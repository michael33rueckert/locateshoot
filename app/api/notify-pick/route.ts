import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, escapeHtml } from '@/lib/email'

// Called by /pick/[slug] right after a client_picks row is inserted. Looks up
// the share link's photographer and emails them with the pick details.
// No auth required — the client hitting this is unauthenticated by definition.
// Idempotency: we include the pick id as a soft dedupe key in logs.

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  const { pickId } = body as { pickId?: string }
  if (!pickId) return NextResponse.json({ error: 'pickId required' }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: pick, error: pErr } = await admin
    .from('client_picks')
    .select('id,share_link_id,client_email,location_name,created_at')
    .eq('id', pickId)
    .single()
  if (pErr || !pick) return NextResponse.json({ error: 'pick not found' }, { status: 404 })

  const { data: link } = await admin
    .from('share_links')
    .select('user_id,session_name,slug')
    .eq('id', pick.share_link_id)
    .single()
  if (!link?.user_id) return NextResponse.json({ error: 'share link missing user' }, { status: 404 })

  const { data: profile } = await admin
    .from('profiles')
    .select('email,full_name')
    .eq('id', link.user_id)
    .single()
  if (!profile?.email) return NextResponse.json({ error: 'photographer email missing' }, { status: 404 })

  const firstName = (profile.full_name ?? '').split(' ')[0] || 'there'
  const appOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? 'https://locateshoot.com'
  const dashUrl = `${appOrigin}/dashboard`

  const html = `
    <div style="font-family: Georgia, serif; color: #1a1612; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px;">
        <span style="width:12px;height:12px;border-radius:50%;background:#c4922a;display:inline-block;"></span>
        <strong style="font-size:15px;">LocateShoot</strong>
      </div>
      <h1 style="font-family: Georgia, serif; font-size: 22px; font-weight: 700; margin: 0 0 12px; color: #1a1612;">
        📍 ${escapeHtml(firstName)}, your client picked a location!
      </h1>
      <p style="font-size:14px; line-height:1.6; color:#5c5248;">
        <strong>${escapeHtml(pick.client_email ?? 'Your client')}</strong> chose <strong>${escapeHtml(pick.location_name ?? 'a location')}</strong>
        ${link.session_name ? ` for <em>${escapeHtml(link.session_name)}</em>` : ''}.
      </p>
      <div style="margin: 24px 0;">
        <a href="${dashUrl}" style="display:inline-block;padding:12px 22px;background:#c4922a;color:#1a1612;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">
          View in your dashboard →
        </a>
      </div>
      <p style="font-size:12px; color:#8a7e70; margin-top:32px; border-top:1px solid #eee; padding-top:16px;">
        Reply to this email to reach your client directly.
      </p>
    </div>
  `

  const result = await sendEmail({
    to:      profile.email,
    subject: `📍 ${pick.client_email ?? 'Your client'} picked ${pick.location_name ?? 'a location'}`,
    html,
    replyTo: pick.client_email ?? undefined,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true, id: result.id })
}
