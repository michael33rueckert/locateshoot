import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { check, clientIp } from '@/lib/rate-limit'

// Token-authenticated MFA removal. Called by the /auth/mfa-reset page
// when the user clicks Confirm after opening the emailed link.
//
// Anyone with the raw token (i.e. anyone who can read the mailbox at
// account address time-of-request) can call this and wipe MFA. The
// token is single-use and expires 30 minutes after issue, so intercept
// windows are small.

export async function POST(request: Request) {
  // IP-based rate limit — nothing else identifies the caller before
  // the token has been validated. Small window is fine; each failure
  // burns a slot so brute-forcing 32-byte tokens is a non-starter.
  const ip = clientIp(request.headers)
  const rl = check(`mfa-reset-confirm:${ip}`, { windowMs: 15 * 60 * 1000, max: 20 })
  if (!rl.ok) {
    return NextResponse.json({ error: 'rate_limited', message: 'Too many attempts. Wait a bit.' }, { status: 429 })
  }

  const body = await request.json().catch(() => null)
  const token = body?.token
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }
  const hash = createHash('sha256').update(token).digest('hex')

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Look up by hash; verify not-expired + not-used in-code so the
  // client sees specific failure reasons.
  const { data: row, error: rowErr } = await admin
    .from('mfa_reset_tokens')
    .select('id,user_id,expires_at,used_at')
    .eq('token_hash', hash)
    .maybeSingle()
  if (rowErr) {
    console.error('mfa-reset-confirm: lookup failed', rowErr)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
  if (!row) {
    return NextResponse.json({ error: 'invalid_token', message: 'This reset link is invalid.' }, { status: 400 })
  }
  if (row.used_at) {
    return NextResponse.json({ error: 'used', message: 'This reset link has already been used.' }, { status: 400 })
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'expired', message: 'This reset link has expired. Sign in and request a new one.' }, { status: 400 })
  }

  // Clear all MFA factors for the user via SECURITY DEFINER helper.
  const { data: deletedCount, error: delErr } = await admin.rpc('admin_reset_mfa_for_user', { p_user_id: row.user_id })
  if (delErr) {
    console.error('mfa-reset-confirm: delete factors failed', delErr)
    return NextResponse.json({ error: 'internal', message: 'Could not clear MFA. Contact support.' }, { status: 500 })
  }

  // Mark this token used AND invalidate every other outstanding token
  // for the user — once the account has been reset, any pending
  // requests should not be reusable.
  await admin.from('mfa_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', row.user_id)
    .is('used_at', null)

  return NextResponse.json({ ok: true, factorsCleared: deletedCount ?? 0 })
}
