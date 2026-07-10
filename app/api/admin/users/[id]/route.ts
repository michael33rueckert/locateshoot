import { NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { isAdminEmail } from '@/lib/admin'
import { getStripe } from '@/lib/stripe'

// Read + delete on a single user, scoped to admin.
//
// GET: pulls the target's profile plus the current auth-user record so
// the /admin/users/[id] page knows if they're deactivated (banned_until
// set) alongside plan, custom domain, etc.
//
// DELETE: hard-removes the account and every scrap of user data. Wired
// to Stripe cancel + Storage sweep + tabled rows + auth.users so a
// deleted account has nothing lingering. Requires the caller to be at
// AAL2 (i.e. re-verified their MFA in this session), separate from the
// baseline "signed in as admin" check.

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = adminClient()
  const { data: { user } } = await admin.auth.getUser(auth.slice(7))
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await context.params
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id,email,full_name,plan,custom_domain,custom_domain_verified,preferences,created_at,stripe_customer_id,stripe_subscription_id')
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!profile) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Pull the auth-user record too so the UI can render a "Deactivated"
  // badge when banned_until is in the future. Failures here don't block
  // the response; the admin UI just doesn't get the ban state.
  let bannedUntil: string | null = null
  const authRes = await admin.auth.admin.getUserById(id)
  const authRow: any = authRes?.data?.user
  if (authRow?.banned_until) {
    // Supabase returns 'none' or a timestamp; treat 'none' as not banned.
    if (authRow.banned_until !== 'none') bannedUntil = authRow.banned_until
  }

  return NextResponse.json({ user: { ...profile, banned_until: bannedUntil } })
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const token = auth.slice(7)

  const admin = adminClient()
  const { data: { user: caller } } = await admin.auth.getUser(token)
  if (!caller || !isAdminEmail(caller.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Step-up auth: the delete route only accepts a session that has
  // re-verified MFA in this same call chain. The admin page runs
  // mfa.challengeAndVerify() with the code the admin just typed, which
  // hoists the session to aal2. We require that here so an already-
  // signed-in admin whose session was hijacked can't nuke accounts
  // without producing a fresh TOTP.
  if (jwtAal(token) !== 'aal2') {
    return NextResponse.json({ error: 'mfa_required', message: 'MFA re-verification required.' }, { status: 401 })
  }

  const { id: targetId } = await context.params
  if (targetId === caller.id) {
    return NextResponse.json({ error: 'cannot_delete_self' }, { status: 400 })
  }

  // Load the target profile so we know if there's a Stripe subscription
  // to cancel. `maybeSingle()` returns null instead of erroring on
  // missing row, in case the caller's already partway through a retry.
  const { data: profile } = await admin
    .from('profiles')
    .select('email,stripe_customer_id,stripe_subscription_id')
    .eq('id', targetId)
    .maybeSingle()

  // ── 1. Cancel Stripe subscription (best-effort) ────────────────────
  // Failures here don't block the delete — we log them and press on so
  // an out-of-sync Stripe row (already-canceled subscription, deleted
  // customer) doesn't leave the account undeletable. Admin follows up
  // in the Stripe dashboard if the warning surfaces.
  let stripeWarning: string | null = null
  if (profile?.stripe_subscription_id && process.env.STRIPE_SECRET_KEY) {
    try {
      await getStripe().subscriptions.cancel(profile.stripe_subscription_id)
    } catch (err: any) {
      stripeWarning = err?.message ?? 'Stripe cancel failed'
    }
  }

  // ── 2. Sweep Storage (recursive) ───────────────────────────────────
  // Everything a user uploads lives under `{userId}/` in the
  // location-photos bucket — portfolio photos, logo, favicon,
  // pick-template hero images. Walk the tree once and batch-delete.
  const storagePaths = await listStorageRecursive(admin, 'location-photos', targetId)
  for (let i = 0; i < storagePaths.length; i += 100) {
    await admin.storage.from('location-photos').remove(storagePaths.slice(i, i + 100))
  }

  // ── 3. Delete user-owned rows ──────────────────────────────────────
  // Ordered so child tables go before parents. Most FKs cascade off
  // profiles.id → auth.users.id, but doing this explicitly means we
  // don't depend on any migration having set cascade correctly.
  const targetedTables = [
    // Photos + related rows first (they FK to portfolio_locations and
    // share_links, so removing them clears the way for those parents).
    'location_photos',
    'client_picks',
    'client_favorite_lists',
    'share_link_views',
    'share_links',
    'portfolio_locations',
    'pick_templates',
    'push_subscriptions',
    'help_feedback',
  ]
  const tableWarnings: string[] = []
  for (const table of targetedTables) {
    const { error } = await admin.from(table).delete().eq('user_id', targetId)
    if (error) tableWarnings.push(`${table}: ${error.message}`)
  }

  // Profile itself last, so any FK-referencing above didn't hit an
  // orphaned parent error.
  const { error: profileErr } = await admin.from('profiles').delete().eq('id', targetId)
  if (profileErr) tableWarnings.push(`profiles: ${profileErr.message}`)

  // ── 4. Delete auth.users row ───────────────────────────────────────
  // This is the "the account is gone" moment. If everything above
  // succeeded but this fails, the profile row is gone but auth still
  // knows about the email — so surface it as an error the admin can
  // retry.
  const { error: authErr } = await admin.auth.admin.deleteUser(targetId)
  if (authErr) {
    return NextResponse.json({
      error: 'auth_delete_failed',
      message: authErr.message,
      stripeWarning, tableWarnings,
      storageDeleted: storagePaths.length,
    }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    email: profile?.email ?? null,
    storageDeleted: storagePaths.length,
    stripeWarning,
    tableWarnings: tableWarnings.length ? tableWarnings : undefined,
  })
}

// ── Helpers ──────────────────────────────────────────────────────────

function adminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Decode the AAL claim from a Supabase JWT without verifying the
// signature — the caller has already validated the token via
// admin.auth.getUser(). We just need to read one claim.
function jwtAal(token: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'))
    return typeof payload.aal === 'string' ? payload.aal : null
  } catch {
    return null
  }
}

// Recursively enumerate every file under a prefix in the given bucket.
// Storage's list() returns folder entries with id === null; we recurse
// into those and treat everything with a real id as a leaf file.
async function listStorageRecursive(admin: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const files: string[] = []
  async function walk(sub: string) {
    let offset = 0
    while (true) {
      const { data, error } = await admin.storage.from(bucket).list(sub, { limit: 1000, offset })
      if (error || !data || data.length === 0) return
      for (const entry of data) {
        const full = sub ? `${sub}/${entry.name}` : entry.name
        if (entry.id === null) {
          await walk(full)
        } else {
          files.push(full)
        }
      }
      if (data.length < 1000) return
      offset += 1000
    }
  }
  await walk(prefix)
  return files
}
