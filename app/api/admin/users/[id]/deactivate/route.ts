import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminEmail } from '@/lib/admin'

// Deactivate a user: bans the auth account so they can't sign in, but
// leaves every row of theirs (portfolio, guides, photos) untouched.
// Reversible via the sibling /reactivate route.
//
// Optional { takeSharesOffline: true } also flips every non-portfolio
// share_link to expired-now so any client hitting a shared URL sees the
// "expired guide" page. The auto Full-Portfolio guide is skipped so it
// snaps back on reactivate without needing to be recreated.

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: { user: caller } } = await admin.auth.getUser(auth.slice(7))
  if (!caller || !isAdminEmail(caller.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id: targetId } = await context.params
  if (targetId === caller.id) {
    return NextResponse.json({ error: 'cannot_deactivate_self' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const takeSharesOffline = body?.takeSharesOffline === true

  // Supabase's built-in ban_duration: pass a very long duration for
  // "indefinite". Reactivate sets it to 'none'.
  const { error: banErr } = await admin.auth.admin.updateUserById(targetId, {
    ban_duration: '876000h', // ~100 years
  })
  if (banErr) return NextResponse.json({ error: banErr.message }, { status: 500 })

  let sharesExpired = 0
  if (takeSharesOffline) {
    const nowIso = new Date().toISOString()
    const { data: expired, error: linkErr } = await admin
      .from('share_links')
      .update({ expires_at: nowIso, is_permanent: false })
      .eq('user_id', targetId)
      .eq('is_full_portfolio', false)
      .select('id')
    if (linkErr) {
      // Ban already succeeded — surface the partial state to the admin
      // so they know to retry the share-link step.
      return NextResponse.json({
        ok: true, banned: true,
        warning: `Banned, but couldn't expire share links: ${linkErr.message}`,
      })
    }
    sharesExpired = expired?.length ?? 0
  }

  return NextResponse.json({ ok: true, banned: true, sharesExpired })
}
