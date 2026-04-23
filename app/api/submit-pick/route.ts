import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, escapeHtml } from '@/lib/email'

// Client-facing submit endpoint for /pick/[slug]. Replaces the old two-step
// client-insert + notify flow because RLS blocks anonymous writes to
// client_picks. This route uses the service role to insert + email atomically.
// Anyone can call it; the payload is validated and the share link must exist
// and not be expired.

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  const shareLinkId = typeof body.shareLinkId === 'string' ? body.shareLinkId : ''
  const email       = typeof body.email       === 'string' ? body.email.trim()       : ''
  const firstName   = typeof body.firstName   === 'string' ? body.firstName.trim().slice(0, 120) : ''
  const lastName    = typeof body.lastName    === 'string' ? body.lastName.trim().slice(0, 120)  : ''
  const locationName= typeof body.locationName=== 'string' ? body.locationName.trim().slice(0, 240) : ''

  if (!shareLinkId) return NextResponse.json({ error: 'shareLinkId required' }, { status: 400 })
  if (email && !isEmail(email)) return NextResponse.json({ error: 'invalid email' }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Verify the share link exists + isn't expired. Prevents random POSTs from
  // creating junk rows.
  const { data: link, error: linkErr } = await admin
    .from('share_links')
    .select('id,user_id,session_name,expires_at')
    .eq('id', shareLinkId)
    .single()
  if (linkErr || !link) return NextResponse.json({ error: 'share link not found' }, { status: 404 })
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'share link expired' }, { status: 410 })
  }

  // If the request is coming in on a photographer's custom domain, require that
  // domain's owner to match the share link's owner. Keeps one photographer's
  // custom domain from submitting picks against another photographer's links.
  const host = (request.headers.get('host') ?? '').toLowerCase().split(':')[0]
  const apex = (process.env.NEXT_PUBLIC_APEX_DOMAIN ?? 'locateshoot.com').toLowerCase()
  const isPrimary = !host || host === apex || host === `www.${apex}` || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app')
  if (!isPrimary) {
    const { data: owner } = await admin.from('profiles').select('id').ilike('custom_domain', host).maybeSingle()
    if (!owner || owner.id !== link.user_id) {
      return NextResponse.json({ error: 'share link not found' }, { status: 404 })
    }
  }

  const { data: inserted, error: insErr } = await admin
    .from('client_picks')
    .insert({
      share_link_id:     link.id,
      client_email:      email || null,
      client_first_name: firstName || null,
      client_last_name:  lastName  || null,
      location_name:     locationName || null,
    })
    .select('id')
    .single()
  if (insErr || !inserted) return NextResponse.json({ error: insErr?.message ?? 'insert failed' }, { status: 500 })

  // Photographer lookup + email. Non-fatal if email send fails; the pick is
  // already saved.
  let emailResult: { ok: boolean; error?: string } = { ok: true }
  try {
    const { data: profile } = await admin
      .from('profiles')
      .select('email,full_name')
      .eq('id', link.user_id)
      .single()

    if (profile?.email) {
      const firstNamePhotog = (profile.full_name ?? '').split(' ')[0] || 'there'
      const appOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? 'https://locateshoot.com'
      const dashUrl = `${appOrigin}/dashboard`
      const clientDisplay = [firstName, lastName].filter(Boolean).join(' ').trim()
        || email
        || 'Your client'

      const html = `
        <div style="font-family: Georgia, serif; color: #1a1612; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px;">
            <span style="width:12px;height:12px;border-radius:50%;background:#c4922a;display:inline-block;"></span>
            <strong style="font-size:15px;">LocateShoot</strong>
          </div>
          <h1 style="font-family: Georgia, serif; font-size: 22px; font-weight: 700; margin: 0 0 12px;">
            📍 ${escapeHtml(firstNamePhotog)}, ${escapeHtml(clientDisplay)} picked a location
          </h1>
          <div style="font-size:14px; line-height:1.7; color:#3a3229; margin: 0 0 20px;">
            <div><strong>Location:</strong> ${escapeHtml(locationName || 'a location')}</div>
            ${clientDisplay !== 'Your client' ? `<div><strong>Client:</strong> ${escapeHtml(clientDisplay)}</div>` : ''}
            ${email ? `<div><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}" style="color:#c4922a;">${escapeHtml(email)}</a></div>` : ''}
            ${link.session_name ? `<div><strong>Session:</strong> ${escapeHtml(link.session_name)}</div>` : ''}
          </div>
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

      const r = await sendEmail({
        to:      profile.email,
        subject: `📍 ${clientDisplay} picked ${locationName || 'a location'}`,
        html,
        replyTo: email || undefined,
      })
      emailResult = r.ok ? { ok: true } : { ok: false, error: r.error }
    }
  } catch (e: any) {
    emailResult = { ok: false, error: e?.message ?? 'email send threw' }
    console.error('submit-pick email failure', e)
  }

  return NextResponse.json({ ok: true, pickId: inserted.id, emailSent: emailResult.ok })
}
