import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, escapeHtml } from '@/lib/email'
import { check, clientIp } from '@/lib/rate-limit'

// General-purpose feedback/suggestion capture. Available to all visitors,
// signed-in or not. Sends to the feedback inbox with reporter info when
// known so Michael can reply directly.

export async function POST(request: Request) {
  // Each submission emails the inbox. Cap at 5/hour/IP to prevent
  // mailbox spam from a single attacker.
  const ip = clientIp(request.headers)
  const rl = check(`feedback:${ip}`, { windowMs: 60 * 60 * 1000, max: 5 })
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited', message: 'Too many submissions. Please try again later.' }, { status: 429 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  const { message, pageUrl } = body as { message?: string; pageUrl?: string }
  if (!message || !message.trim()) return NextResponse.json({ error: 'message required' }, { status: 400 })
  if (message.length > 5000) return NextResponse.json({ error: 'message too long' }, { status: 400 })

  let reporterEmail: string | null = null
  let reporterName:  string | null = null
  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: { user } } = await admin.auth.getUser(auth.slice(7))
    if (user) {
      reporterEmail = user.email ?? null
      const { data: p } = await admin.from('profiles').select('full_name').eq('id', user.id).single()
      reporterName = p?.full_name ?? null
    }
  }

  const ua = request.headers.get('user-agent') ?? ''
  const html = `
    <div style="font-family: Georgia, serif; color: #1a1612; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="font-size:18px; margin:0 0 12px;">💬 Feedback from a LocateShoot user</h2>
      <table style="font-size:13px; color:#333; border-collapse:collapse; margin-bottom:16px;">
        <tr><td style="padding:4px 8px 4px 0; color:#888;">From</td><td style="padding:4px 0;">${reporterEmail ? escapeHtml(`${reporterName ?? ''} <${reporterEmail}>`.trim()) : '(anonymous)'}</td></tr>
        ${pageUrl ? `<tr><td style="padding:4px 8px 4px 0; color:#888;">Page</td><td style="padding:4px 0;"><a href="${escapeHtml(pageUrl)}">${escapeHtml(pageUrl)}</a></td></tr>` : ''}
        <tr><td style="padding:4px 8px 4px 0; color:#888;">Submitted</td><td style="padding:4px 0;">${new Date().toISOString()}</td></tr>
        <tr><td style="padding:4px 8px 4px 0; color:#888;">UA</td><td style="padding:4px 0; font-size:11px; color:#888;">${escapeHtml(ua)}</td></tr>
      </table>
      <div style="font-size:14px; line-height:1.55; color:#1a1612; background:#f8f5f0; border-left:3px solid #c4922a; padding:12px 16px; border-radius:4px; white-space:pre-wrap;">${escapeHtml(message.trim())}</div>
    </div>
  `

  const result = await sendEmail({
    to:      'feedback@locateshoot.com',
    subject: `Feedback from ${reporterEmail ?? 'anonymous user'}`,
    html,
    replyTo: reporterEmail ?? undefined,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
