import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'crypto'
import { sendEmail, escapeHtml } from '@/lib/email'
import { check, clientIp } from '@/lib/rate-limit'

// User-triggered "I lost my authenticator" flow.
//
// The MfaGate keeps the session at AAL1 when a user with MFA enrolled
// can't produce a code. That AAL1 session identifies who they are
// (password already verified) — enough to email a reset link to their
// account address without needing an extra "prove you own this email"
// step. Clicking that link takes them to /auth/mfa-reset, which POSTs
// to the sibling /confirm route to clear their factors.
//
// The link isn't self-authenticating for anyone but the mailbox owner:
// tokens are random 32-byte values, hashed at rest, single-use, 30-min
// expiry. Rate limits stop the endpoint from being used to spam a
// mailbox.

const TOKEN_TTL_MS = 30 * 60 * 1000
const MAX_PER_HOUR = 3

export async function POST(request: Request) {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: { user } } = await admin.auth.getUser(auth.slice(7))
  if (!user?.id || !user.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Rate-limit per user and per IP so a single attacker can't flood
  // the mailbox by rotating IPs or force a lockout on someone else.
  const ip = clientIp(request.headers)
  const userRl = check(`mfa-reset:${user.id}`, { windowMs: 60 * 60 * 1000, max: MAX_PER_HOUR })
  const ipRl   = check(`mfa-reset-ip:${ip}`,   { windowMs: 60 * 60 * 1000, max: 20 })
  if (!userRl.ok || !ipRl.ok) {
    return NextResponse.json({ error: 'rate_limited', message: 'Too many reset requests. Try again in an hour.' }, { status: 429 })
  }

  // Only send if the user actually has MFA enrolled. Silently succeeds
  // otherwise so the endpoint can't be used to probe MFA status.
  const listRes = await admin.auth.admin.getUserById(user.id)
  const factors: any[] = (listRes?.data?.user as any)?.factors ?? []
  const hasVerified = factors.some(f => f?.status === 'verified')
  if (!hasVerified) {
    return NextResponse.json({ ok: true, sent: false })
  }

  // Random token; store the hash so a DB leak can't be replayed.
  const raw     = randomBytes(32).toString('base64url')
  const hash    = createHash('sha256').update(raw).digest('hex')
  const expires = new Date(Date.now() + TOKEN_TTL_MS)

  const { error: insErr } = await admin.from('mfa_reset_tokens').insert({
    user_id:    user.id,
    token_hash: hash,
    expires_at: expires.toISOString(),
    ip,
    user_agent: request.headers.get('user-agent') ?? null,
  })
  if (insErr) {
    console.error('mfa-reset: insert failed', insErr)
    return NextResponse.json({ error: 'internal', message: 'Could not create reset token.' }, { status: 500 })
  }

  const appOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? new URL(request.url).origin
  const link      = `${appOrigin}/auth/mfa-reset?token=${encodeURIComponent(raw)}`

  const html = `
    <div style="font-family: Georgia, serif; color: #1a1612; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="font-size:20px; margin:0 0 12px;">Reset two-factor on your LocateShoot account</h2>
      <p style="font-size:14px; line-height:1.6; margin:0 0 12px;">
        We got a request to remove two-factor authentication from your account (<strong>${escapeHtml(user.email)}</strong>).
      </p>
      <p style="font-size:14px; line-height:1.6; margin:0 0 20px;">
        Click the button below within 30 minutes to clear MFA and sign in with just your password.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${escapeHtml(link)}" style="display:inline-block; padding:12px 24px; border-radius:6px; background:#c4922a; color:#1a1612; text-decoration:none; font-size:14px; font-weight:600;">Reset my two-factor</a>
      </p>
      <p style="font-size:12px; color:#666; line-height:1.6; margin:0 0 8px;">
        Or copy and paste this URL into your browser:<br>
        <span style="word-break:break-all;">${escapeHtml(link)}</span>
      </p>
      <hr style="border:none; border-top:1px solid #eee; margin:24px 0;">
      <p style="font-size:12px; color:#666; line-height:1.6; margin:0;">
        If you didn't request this, ignore this email — nothing will change. If you're getting these emails without asking, someone may know your password; sign in and change it right away.
      </p>
    </div>
  `

  const result = await sendEmail({
    to:      user.email,
    subject: 'Reset two-factor on your LocateShoot account',
    html,
  })
  if (!result.ok) {
    return NextResponse.json({ error: 'email_failed', message: result.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true, sent: true })
}
