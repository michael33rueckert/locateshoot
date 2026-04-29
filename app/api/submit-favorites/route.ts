import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, escapeHtml } from '@/lib/email'
import { sendPushToUser } from '@/lib/server-push'
import { check, clientIp } from '@/lib/rate-limit'

// Client-facing endpoint for the "Send favorites to discuss" flow on
// the Pick page. Distinct from /api/submit-pick (final selection) —
// favorites are a soft "let's talk this over" signal. Inserts a row
// into client_favorite_lists, emails BOTH the photographer and the
// client (so the client has a record + the photographer can reply
// directly), and fires a push notification.
//
// No account required for the client; identity is the email address
// they entered. Rate-limited per IP at the same 10/hour ceiling as
// submit-pick to keep email-sending budget predictable.

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

export async function POST(request: Request) {
  const ip = clientIp(request.headers)
  const rl = check(`submit-favorites:${ip}`, { windowMs: 60 * 60 * 1000, max: 10 })
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited', message: 'Too many submissions. Please try again later.' }, { status: 429 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  const shareLinkId = typeof body.shareLinkId === 'string' ? body.shareLinkId : ''
  const email       = typeof body.email       === 'string' ? body.email.trim()       : ''
  const firstName   = typeof body.firstName   === 'string' ? body.firstName.trim().slice(0, 120) : ''
  const lastName    = typeof body.lastName    === 'string' ? body.lastName.trim().slice(0, 120)  : ''
  const comment     = typeof body.comment     === 'string' ? body.comment.trim().slice(0, 1500) : ''
  const favoritesRaw = Array.isArray(body.favorites) ? body.favorites : []
  const favorites   = favoritesRaw
    .map((f: any) => ({
      id:   typeof f?.id   === 'string' ? f.id   : null,
      name: typeof f?.name === 'string' ? f.name.slice(0, 240) : '',
    }))
    .filter((f: { id: string | null; name: string }) => f.name.length > 0)
    .slice(0, 30)

  if (!shareLinkId) return NextResponse.json({ error: 'shareLinkId required' }, { status: 400 })
  if (!email || !isEmail(email)) return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
  if (favorites.length === 0) return NextResponse.json({ error: 'no_favorites' }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Verify the share link exists + isn't expired.
  const { data: link, error: linkErr } = await admin
    .from('share_links')
    .select('id,user_id,session_name,expires_at')
    .eq('id', shareLinkId)
    .single()
  if (linkErr || !link) return NextResponse.json({ error: 'share link not found' }, { status: 404 })
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'share link expired' }, { status: 410 })
  }

  // Custom-domain ownership check — mirrors submit-pick + pick-data.
  const host = (request.headers.get('host') ?? '').toLowerCase().split(':')[0]
  const apex = (process.env.NEXT_PUBLIC_APEX_DOMAIN ?? 'locateshoot.com').toLowerCase()
  const isPrimary = !host || host === apex || host === `www.${apex}` || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app')
  if (!isPrimary) {
    const { data: owner } = await admin.from('profiles').select('id').eq('custom_domain', host).maybeSingle()
    if (!owner || owner.id !== link.user_id) {
      return NextResponse.json({ error: 'share link not found' }, { status: 404 })
    }
  }

  // Persist the row. user_id denormalized from the share link so RLS on
  // the SELECT side is fast (auth.uid() = user_id).
  const { error: insertErr } = await admin.from('client_favorite_lists').insert({
    share_link_id:     link.id,
    user_id:           link.user_id,
    client_first_name: firstName || null,
    client_last_name:  lastName  || null,
    client_email:      email,
    locations:         favorites,
    comment:           comment || null,
  })
  if (insertErr) {
    console.error('insert favorite list failed', insertErr)
    return NextResponse.json({ error: 'could_not_save', message: 'Could not save favorites — please try again.' }, { status: 500 })
  }

  // Pull photographer name + email for the email templates. Both
  // calls wrapped: the row is already saved, so a transient profile
  // / auth read failure shouldn't make the client see a "couldn't
  // send your favorites" error after we've actually persisted them.
  let photographerEmail: string | null = null
  let photographerName  = 'Your photographer'
  try {
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', link.user_id)
      .single()
    if (profile?.full_name) photographerName = profile.full_name
  } catch (e) { console.warn('favorites: profile lookup failed', e) }
  try {
    const { data: photographerAuth } = await admin.auth.admin.getUserById(link.user_id)
    photographerEmail = photographerAuth?.user?.email ?? null
  } catch (e) { console.warn('favorites: auth lookup failed', e) }

  const clientName  = [firstName, lastName].filter(Boolean).join(' ') || 'A client'
  const sessionName = link.session_name ?? 'your Location Guide'
  const namesHtml   = favorites.map((f: { name: string }) => `<li style="margin-bottom:4px;">${escapeHtml(f.name)}</li>`).join('')

  // 1. Email the photographer — reply-to set to the client so a single
  //    reply opens a real conversation.
  if (photographerEmail) {
    try {
    await sendEmail({
      to:      photographerEmail,
      replyTo: email,
      subject: `${clientName} wants to discuss some favorites — ${sessionName}`,
      html: `
        <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:24px 20px;color:#1a1612;background:#ffffff;">
          <div style="font-size:15px;font-weight:700;color:#c4922a;margin-bottom:6px;">★ Favorites to discuss</div>
          <h2 style="font-family:Georgia,serif;font-size:22px;margin:0 0 10px;">${escapeHtml(clientName)} marked a few spots to consider</h2>
          <p style="font-size:14px;line-height:1.6;color:#3a3229;margin:0 0 16px;">From your <strong>${escapeHtml(sessionName)}</strong> guide. Not ready to commit to a final pick yet — would like to talk through the options.</p>
          <div style="margin:0 0 14px;font-size:13px;color:#6b5f52;">Favorites:</div>
          <ul style="margin:0 0 18px 0;padding-left:22px;font-size:14px;line-height:1.5;">
            ${namesHtml}
          </ul>
          ${comment ? `
            <div style="background:#f9f6f1;padding:14px 16px;border-radius:8px;margin-bottom:18px;border:1px solid #ece5d8;">
              <div style="font-size:12px;color:#6b5f52;margin-bottom:6px;font-weight:500;">Question / comment:</div>
              <div style="white-space:pre-wrap;font-size:14px;line-height:1.55;">${escapeHtml(comment)}</div>
            </div>
          ` : ''}
          <p style="font-size:13px;line-height:1.6;color:#6b5f52;margin:0;">Reply to this email to start the conversation — replies go to <a href="mailto:${escapeHtml(email)}" style="color:#c4922a;">${escapeHtml(email)}</a>.</p>
        </div>
      `,
    })
    } catch (e) { console.warn('favorites: photographer email failed', e) }
  }

  // 2. Email the client — confirmation of what they sent + a hint that
  //    replies reach the photographer.
  try {
  await sendEmail({
    to:      email,
    replyTo: photographerEmail ?? undefined,
    subject: `Your favorites for ${sessionName}`,
    html: `
      <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:24px 20px;color:#1a1612;background:#ffffff;">
        <h2 style="font-family:Georgia,serif;font-size:22px;margin:0 0 10px;">Sent! ${escapeHtml(photographerName)} got your favorites.</h2>
        <p style="font-size:14px;line-height:1.6;color:#3a3229;margin:0 0 16px;">Here's what you marked for <strong>${escapeHtml(sessionName)}</strong>:</p>
        <ul style="margin:0 0 18px 0;padding-left:22px;font-size:14px;line-height:1.5;">
          ${namesHtml}
        </ul>
        ${comment ? `
          <div style="background:#f9f6f1;padding:14px 16px;border-radius:8px;margin-bottom:18px;border:1px solid #ece5d8;">
            <div style="font-size:12px;color:#6b5f52;margin-bottom:6px;font-weight:500;">Your message:</div>
            <div style="white-space:pre-wrap;font-size:14px;line-height:1.55;">${escapeHtml(comment)}</div>
          </div>
        ` : ''}
        <p style="font-size:13px;line-height:1.6;color:#6b5f52;margin:0 0 6px;">Reply to this email anytime to keep the conversation going. When you're ready to commit to a final spot, head back to the link ${escapeHtml(photographerName)} sent and tap <strong>Send my choice</strong>.</p>
      </div>
    `,
  })
  } catch (e) { console.warn('favorites: client email failed', e) }

  // 3. Push notification to the photographer (best-effort).
  try {
    await sendPushToUser(admin, link.user_id, {
      title: `${clientName} wants to discuss favorites`,
      body:  `${favorites.length} spot${favorites.length === 1 ? '' : 's'} from ${sessionName}`,
      url:   '/dashboard#client-favorites',
    })
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true })
}
