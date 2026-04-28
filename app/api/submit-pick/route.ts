import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, escapeHtml } from '@/lib/email'
import { sendPushToUser } from '@/lib/server-push'
import { check, clientIp } from '@/lib/rate-limit'

// Client-facing submit endpoint for /pick/[slug]. RLS blocks anonymous writes
// to client_picks, so this route uses the service role to insert + email
// atomically. Handles both single-pick and multi-location-pick links.

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

export async function POST(request: Request) {
  // Rate-limit by IP — every successful pick triggers a Resend email
  // (and a push notification). 10/hour/IP is plenty for honest use
  // and stops a bad actor from blowing through the Resend quota.
  const ip = clientIp(request.headers)
  const rl = check(`submit-pick:${ip}`, { windowMs: 60 * 60 * 1000, max: 10 })
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited', message: 'Too many submissions. Please try again later.' }, { status: 429 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  const shareLinkId = typeof body.shareLinkId === 'string' ? body.shareLinkId : ''
  const email       = typeof body.email       === 'string' ? body.email.trim()       : ''
  const firstName   = typeof body.firstName   === 'string' ? body.firstName.trim().slice(0, 120) : ''
  const lastName    = typeof body.lastName    === 'string' ? body.lastName.trim().slice(0, 120)  : ''
  // Legacy single-pick param; still honored when picks[] isn't provided.
  const singleName  = typeof body.locationName === 'string' ? body.locationName.trim().slice(0, 240) : ''
  // Preferred multi-pick shape: [{ id, name }, ...]
  const picksRaw    = Array.isArray(body.picks) ? body.picks : []
  const picks       = picksRaw
    .map((p: any) => ({
      id:   typeof p?.id   === 'string' ? p.id   : null,
      name: typeof p?.name === 'string' ? p.name.slice(0, 240) : '',
    }))
    .filter((p: { id: string | null; name: string }) => p.name.length > 0)
    .slice(0, 20)

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
    .select('id,user_id,session_name,expires_at,max_picks,is_permanent,expire_on_submit')
    .eq('id', shareLinkId)
    .single()
  if (linkErr || !link) return NextResponse.json({ error: 'share link not found' }, { status: 404 })
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'share link expired' }, { status: 410 })
  }
  // Single-use guides: if any client has already submitted a pick, the link
  // has burned out and subsequent submissions are rejected.
  if (link.expire_on_submit) {
    const { count } = await admin
      .from('client_picks')
      .select('id', { count: 'exact', head: true })
      .eq('share_link_id', link.id)
    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: 'share link expired' }, { status: 410 })
    }
  }

  // Custom-domain ownership check — mirrors /api/pick-data.
  const host = (request.headers.get('host') ?? '').toLowerCase().split(':')[0]
  const apex = (process.env.NEXT_PUBLIC_APEX_DOMAIN ?? 'locateshoot.com').toLowerCase()
  const isPrimary = !host || host === apex || host === `www.${apex}` || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app')
  if (!isPrimary) {
    // host is lowercased above; stored profiles.custom_domain is
    // normalized to lowercase by validateCustomDomain on save, so eq
    // is sufficient — no need for case-insensitive ilike.
    const { data: owner } = await admin.from('profiles').select('id').eq('custom_domain', host).maybeSingle()
    if (!owner || owner.id !== link.user_id) {
      return NextResponse.json({ error: 'share link not found' }, { status: 404 })
    }
  }

  // Reconcile legacy single-pick payload into the array shape so the DB + email
  // paths below are uniform.
  const allPicks = picks.length > 0
    ? picks
    : (singleName ? [{ id: null, name: singleName }] : [])
  if (allPicks.length === 0) return NextResponse.json({ error: 'no locations selected' }, { status: 400 })

  const maxAllowed = Math.max(1, link.max_picks ?? 1)
  if (allPicks.length > maxAllowed) {
    return NextResponse.json({ error: `this link allows at most ${maxAllowed} location${maxAllowed === 1 ? '' : 's'}` }, { status: 400 })
  }

  const names: string[] = allPicks.map((p: { name: string }) => p.name)
  const ids:   string[] = allPicks
    .map((p: { id: string | null }) => p.id)
    .filter((id: string | null): id is string => !!id)

  const { data: inserted, error: insErr } = await admin
    .from('client_picks')
    .insert({
      share_link_id:     link.id,
      client_email:      email || null,
      client_first_name: firstName || null,
      client_last_name:  lastName  || null,
      location_name:     names[0] || null, // legacy single-value column
      location_names:    names,
      location_ids:      ids.length > 0 ? ids : null,
    })
    .select('id')
    .single()
  if (insErr || !inserted) return NextResponse.json({ error: insErr?.message ?? 'insert failed' }, { status: 500 })

  // Photographer profile (for both the photographer notification and the
  // client confirmation below). Includes plan + branding prefs so the
  // client email can render with the photographer's studio name + accent
  // color when they're on Pro with white-label turned on. sender_email +
  // sender_verified gate the custom-sending-domain feature: when verified,
  // the client email goes From: their address instead of LocateShoot's.
  const { data: profile } = await admin
    .from('profiles')
    .select('email,full_name,plan,preferences,sender_email,sender_verified')
    .eq('id', link.user_id)
    .single()

  // Pull rich location details for every pick, so the client email can
  // include city, description, best time, parking, permit, Pinterest, blog,
  // and a Get Directions button per spot. Picks reference either
  // portfolio_locations or the public locations table — query both and
  // build a single lookup keyed by id.
  type LocDetail = {
    id: string
    name: string
    city: string | null
    state: string | null
    lat: number | null
    lng: number | null
    description: string | null
    best_time: string | null
    parking_info: string | null
    permit_required: boolean | null
    permit_notes: string | null
    pinterest_url: string | null
    blog_url: string | null
  }
  const locDetails: Record<string, LocDetail> = {}
  if (ids.length > 0) {
    // portfolio_locations first — try with the new link columns and fall
    // back without them when the migration hasn't been run yet (same
    // pattern as the pick-data endpoint).
    const baseCols = 'id,name,city,state,latitude,longitude,description,best_time,parking_info,permit_required,permit_notes'
    let portfolioRows: any[] = []
    {
      const r = await admin.from('portfolio_locations').select(`${baseCols},pinterest_url,blog_url`).in('id', ids)
      if (r.error) {
        const fb = await admin.from('portfolio_locations').select(baseCols).in('id', ids)
        portfolioRows = fb.data ?? []
      } else {
        portfolioRows = r.data ?? []
      }
    }
    portfolioRows.forEach((p: any) => {
      locDetails[p.id] = {
        id: p.id, name: p.name,
        city: p.city, state: p.state,
        lat: p.latitude, lng: p.longitude,
        description: p.description,
        best_time: p.best_time,
        parking_info: p.parking_info,
        permit_required: p.permit_required,
        permit_notes: p.permit_notes,
        pinterest_url: p.pinterest_url ?? null,
        blog_url: p.blog_url ?? null,
      }
    })
    // Anything still missing might be a public locations row (legacy share-
    // link shape). Look those up directly.
    const missing = ids.filter(id => !locDetails[id])
    if (missing.length > 0) {
      const { data: pubRows } = await admin
        .from('locations')
        .select('id,name,city,state,latitude,longitude,description,best_time,parking_info,permit_required,permit_notes')
        .in('id', missing)
      ;(pubRows ?? []).forEach((p: any) => {
        locDetails[p.id] = {
          id: p.id, name: p.name,
          city: p.city, state: p.state,
          lat: p.latitude, lng: p.longitude,
          description: p.description,
          best_time: p.best_time,
          parking_info: p.parking_info,
          permit_required: p.permit_required,
          permit_notes: p.permit_notes,
          pinterest_url: null,
          blog_url: null,
        }
      })
    }
  }

  // Plan tiers — Starter+ unlocks the client confirmation email and
  // permit-info-on-shares; Pro additionally unlocks white-label
  // branding (no LocateShoot footer + studio name in From).
  const prefs           = (profile?.preferences as any) ?? {}
  const isPaid          = profile?.plan === 'starter' || profile?.plan === 'pro' || profile?.plan === 'Pro'
  const isPro           = profile?.plan === 'pro' || profile?.plan === 'Pro'
  const whiteLabel      = isPro && !!prefs.remove_ls_branding
  const studioName      = (prefs.studio_name as string | undefined)?.trim() || profile?.full_name?.trim() || ''
  const brandAccentRaw  = (prefs.brand_accent as string | undefined) ?? '#c4922a'
  const brandAccent     = /^#[0-9a-f]{3,8}$/i.test(brandAccentRaw) ? brandAccentRaw : '#c4922a'
  // From-display-name shown in the recipient's inbox. Pro white-label uses
  // the studio name straight; everyone else gets a "Photographer via
  // LocateShoot" hybrid so the photographer's name is still visible.
  const fromNameClient  = whiteLabel && studioName
    ? studioName
    : (studioName ? `${studioName} via LocateShoot` : 'LocateShoot')

  // Photographer notification (existing behavior — unchanged). Non-fatal
  // if email send fails.
  let emailResult: { ok: boolean; error?: string } = { ok: true }
  try {
    if (profile?.email) {
      const firstNamePhotog = (profile.full_name ?? '').split(' ')[0] || 'there'
      const appOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? 'https://locateshoot.com'
      const dashUrl = `${appOrigin}/dashboard`
      const clientDisplay = [firstName, lastName].filter(Boolean).join(' ').trim()
        || email
        || 'Your client'

      const countWord = names.length === 1
        ? `1 location`
        : `${names.length} locations`
      const headline = names.length === 1
        ? `📍 ${escapeHtml(firstNamePhotog)}, ${escapeHtml(clientDisplay)} picked a location`
        : `📍 ${escapeHtml(firstNamePhotog)}, ${escapeHtml(clientDisplay)} picked ${countWord}`

      const locationsList = names.length === 1
        ? `<div><strong>Location:</strong> ${escapeHtml(names[0])}</div>`
        : `<div style="margin:4px 0;"><strong>Locations:</strong></div>
           <ol style="margin:4px 0 4px 20px; padding:0; font-size:14px; line-height:1.7;">
             ${names.map((n: string) => `<li style="margin-bottom:2px;">${escapeHtml(n)}</li>`).join('')}
           </ol>`

      const html = `
        <div style="font-family: Georgia, serif; color: #1a1612; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px;">
            <span style="width:12px;height:12px;border-radius:50%;background:#c4922a;display:inline-block;"></span>
            <strong style="font-size:15px;">LocateShoot</strong>
          </div>
          <h1 style="font-family: Georgia, serif; font-size: 22px; font-weight: 700; margin: 0 0 12px;">
            ${headline}
          </h1>
          <div style="font-size:14px; line-height:1.7; color:#3a3229; margin: 0 0 20px;">
            ${locationsList}
            ${clientDisplay !== 'Your client' ? `<div><strong>Client:</strong> ${escapeHtml(clientDisplay)}</div>` : ''}
            ${email ? `<div><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}" style="color:#c4922a;">${escapeHtml(email)}</a></div>` : ''}
            ${!link.is_permanent && link.session_name ? `<div><strong>Session:</strong> ${escapeHtml(link.session_name)}</div>` : ''}
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

      const subject = names.length === 1
        ? `📍 ${clientDisplay} picked ${names[0]}`
        : `📍 ${clientDisplay} picked ${countWord}`

      const r = await sendEmail({
        to:      profile.email,
        subject,
        html,
        replyTo: email || undefined,
      })
      emailResult = r.ok ? { ok: true } : { ok: false, error: r.error }
    }
  } catch (e: any) {
    emailResult = { ok: false, error: e?.message ?? 'email send threw' }
    console.error('submit-pick email failure', e)
  }

  // Client confirmation email — Pro feature. Recap of every location
  // picked with a Get Directions button per spot. Reply-to is the
  // photographer so any follow-up reply goes straight to them. Skipped
  // when:
  //   - no client email (anonymous pick, can't email anyone)
  //   - no photographer profile (data integrity)
  //   - photographer is on Free plan (gated to Pro per pricing —
  //     photographer still gets their own pick notification email above)
  let clientEmailResult: { ok: boolean; error?: string; skipped?: 'no-email' | 'free-plan' } = { ok: true }
  try {
    if (!email) {
      clientEmailResult = { ok: true, skipped: 'no-email' }
    } else if (!isPaid) {
      clientEmailResult = { ok: true, skipped: 'free-plan' }
    } else if (email && profile) {
      const subject = names.length === 1
        ? `Your shoot location — ${names[0]}`
        : `Your ${names.length} shoot locations`

      // Render one card per pick. Order matches the user's submission order
      // so what they tapped first stays first in the email.
      const cards = allPicks.map((p: { id: string | null; name: string }, i: number) => {
        const d = p.id ? locDetails[p.id] : null
        const cityLine = d ? [d.city, d.state].filter(Boolean).join(', ') : ''
        const dirDest  = d && Number.isFinite(d.lat) && Number.isFinite(d.lng)
          ? `${d.lat},${d.lng}`
          : encodeURIComponent([p.name, cityLine].filter(Boolean).join(', '))
        // Universal Google Maps directions URL. Works on every platform
        // (desktop opens Google Maps in browser; mobile opens the Google
        // Maps app if installed, otherwise the web). Apple users on iOS
        // can long-press to open in Maps.app; we can't detect platform
        // from email so we pick the option that works everywhere.
        const dirUrl = `https://www.google.com/maps/dir/?api=1&destination=${dirDest}`

        const facts: string[] = []
        if (d?.best_time)         facts.push(`<strong>Best time:</strong> ${escapeHtml(d.best_time)}`)
        if (d?.parking_info)      facts.push(`<strong>Parking:</strong> ${escapeHtml(d.parking_info)}`)
        if (d?.permit_required && d.permit_notes) facts.push(`<strong>Permit:</strong> ${escapeHtml(d.permit_notes)}`)
        else if (d?.permit_required)              facts.push(`<strong>Permit required</strong>`)

        const links: string[] = []
        if (d?.pinterest_url) links.push(`<a href="${escapeHtml(d.pinterest_url)}" style="color:${brandAccent};text-decoration:none;font-size:13px;">📌 Pinterest board</a>`)
        if (d?.blog_url)      links.push(`<a href="${escapeHtml(d.blog_url)}"      style="color:${brandAccent};text-decoration:none;font-size:13px;">✍ Blog post</a>`)

        return `
          <div style="border:1px solid #ece5d8;border-radius:10px;padding:18px 20px;margin-bottom:14px;background:white;">
            <div style="font-family: Georgia, serif; font-size:18px; font-weight:700; color:#1a1612; margin:0 0 4px;">
              ${names.length > 1 ? `<span style="color:#8a7e70;font-weight:400;">${i + 1}. </span>` : ''}${escapeHtml(p.name)}
            </div>
            ${cityLine ? `<div style="font-size:13px; color:#6b5f52; margin:0 0 12px;">📍 ${escapeHtml(cityLine)}</div>` : '<div style="margin-bottom:12px;"></div>'}
            ${d?.description ? `<p style="font-size:14px; line-height:1.65; color:#3a3229; margin:0 0 12px; font-weight:300;">${escapeHtml(d.description)}</p>` : ''}
            ${facts.length > 0 ? `<div style="font-size:13px; line-height:1.7; color:#3a3229; margin:0 0 14px;">${facts.join('<br>')}</div>` : ''}
            <div>
              <a href="${dirUrl}" style="display:inline-block;padding:10px 18px;background:${brandAccent};color:#1a1612;text-decoration:none;border-radius:4px;font-size:13px;font-weight:600;">
                🗺 Get Directions
              </a>
            </div>
            ${links.length > 0 ? `<div style="margin-top:12px; display:flex; gap:14px; flex-wrap:wrap;">${links.join('')}</div>` : ''}
          </div>
        `
      }).join('')

      // Email header — branding tier:
      //   Pro: photographer's logo (or studio name when no logo is
      //        uploaded yet). White-label kept identical to before.
      //   Starter: studio-name + gold dot, like the photographer
      //        notification email. Always followed by a 'Powered by
      //        LocateShoot' wordmark in the footer.
      // (Free is already gated out of this email above via isPaid.)
      const logoUrl = (prefs.logo_url as string | undefined) || ''
      const isLogoSafe = /^https?:\/\//i.test(logoUrl)
      const headerName = isPro && isLogoSafe
        ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(studioName || 'Studio logo')}" style="display:block;max-width:200px;max-height:64px;width:auto;height:auto;border:0;" />`
        : isPro && studioName
          ? `<div style="font-family: Georgia, serif; font-size:18px; font-weight:700; color:#1a1612;">${escapeHtml(studioName)}</div>`
          : `<div style="display:flex;align-items:center;gap:8px;">
               <span style="width:10px;height:10px;border-radius:50%;background:${brandAccent};display:inline-block;"></span>
               <strong style="font-size:14px;color:#1a1612;">${escapeHtml(studioName || 'Your photographer')}</strong>
             </div>`

      const tagline = (prefs.share_tagline as string | undefined)?.trim()
      const greeting = firstName
        ? `Hi ${escapeHtml(firstName)},`
        : 'Hi there,'
      const intro = names.length === 1
        ? `Thanks for picking your shoot location! Here are the details${studioName ? ` from ${escapeHtml(studioName)}` : ''}:`
        : `Thanks for picking your shoot locations! Here's the recap${studioName ? ` from ${escapeHtml(studioName)}` : ''}:`

      // Footer:
      //   Pro + white-label: studio reply-line only, no LocateShoot mark.
      //   Pro without white-label / Starter: 'Powered by LocateShoot'
      //     wordmark with a clickable logo + name. Email clients block
      //     <link> tags so we use a small inline gold-dot mark plus the
      //     LocateShoot wordmark wrapped in an anchor to the homepage.
      const lsHome = process.env.NEXT_PUBLIC_APP_ORIGIN ?? 'https://locateshoot.com'
      const poweredByMark = `
        <a href="${lsHome}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none;color:#8a7e70;font-size:12px;">
          <span style="width:8px;height:8px;border-radius:50%;background:#c4922a;display:inline-block;"></span>
          <span style="font-family: Georgia, serif; font-weight:700; color:#1a1612;">LocateShoot</span>
        </a>`
      const footer = whiteLabel
        ? `<p style="font-size:12px; color:#8a7e70; margin-top:24px; border-top:1px solid #eee; padding-top:16px;">Reply to this email to reach ${escapeHtml(studioName || 'your photographer')} directly.</p>`
        : `<div style="margin-top:24px; border-top:1px solid #eee; padding-top:16px;">
             <p style="font-size:12px; color:#8a7e70; margin:0 0 10px;">Reply to this email to reach ${escapeHtml(studioName || 'your photographer')} directly.</p>
             <div style="font-size:11px; color:#a89c8d;">Powered by ${poweredByMark}</div>
           </div>`

      const html = `
        <div style="font-family: Georgia, serif; color: #1a1612; max-width: 600px; margin: 0 auto; padding: 32px 24px; background:#f9f6f1;">
          <div style="margin-bottom:24px;">
            ${headerName}
            ${tagline ? `<div style="font-size:13px; color:#6b5f52; font-style:italic; margin-top:6px;">${escapeHtml(tagline)}</div>` : ''}
          </div>
          <p style="font-size:15px; line-height:1.6; color:#1a1612; margin:0 0 8px;">${greeting}</p>
          <p style="font-size:14px; line-height:1.6; color:#3a3229; margin:0 0 20px; font-weight:300;">${intro}</p>
          ${cards}
          ${footer}
        </div>
      `

      // Pro + verified custom sending domain → email goes From: their
      // address (e.g. jane@studio.com). Otherwise we fall back to the
      // shared notifications@locateshoot.com sender and rely on reply-to
      // to route replies back to the photographer. Also gated by the
      // CUSTOM_SENDER_ENABLED env flag — when soft-disabled (e.g. while
      // Resend's plan only fits one domain), any stale sender_verified
      // rows are ignored and we send through the default address.
      const customSenderEnabled = process.env.CUSTOM_SENDER_ENABLED === 'true'
      const useCustomSender = customSenderEnabled && !!(profile.sender_verified && profile.sender_email)
      const r = await sendEmail({
        to:          email,
        subject,
        html,
        // Reply-to is the photographer so the client can hit Reply and reach
        // them directly. Even when From: is the custom domain, we still set
        // reply-to to the photographer's primary contact email — they may
        // have a different inbox they actually read mail in.
        replyTo:     profile.email ?? undefined,
        fromName:    fromNameClient,
        fromAddress: useCustomSender ? profile.sender_email! : undefined,
      })
      clientEmailResult = r.ok ? { ok: true } : { ok: false, error: r.error }
    }
  } catch (e: any) {
    clientEmailResult = { ok: false, error: e?.message ?? 'client email send threw' }
    console.error('submit-pick client email failure', e)
  }

  // Fire a push notification alongside the email. Non-fatal — photographer
  // may simply not have any devices subscribed yet. Tapping the push deep-
  // links to /dashboard so they land on the new pick.
  try {
    const clientDisplay = [firstName, lastName].filter(Boolean).join(' ').trim()
      || email
      || 'Your client'
    const title = names.length === 1
      ? `📍 ${clientDisplay} picked a location`
      : `📍 ${clientDisplay} picked ${names.length} locations`
    const body = names.length === 1 ? names[0] : names.join(' · ')
    await sendPushToUser(admin, link.user_id, {
      title,
      body,
      // Deep-link to the Client Selections section on the dashboard
      // (#client-picks anchor). The dashboard scrolls to that block
      // on load when the hash is present, so 'View' lands the
      // photographer right at the new pick.
      url: '/dashboard#client-picks',
      tag: `pick-${inserted.id}`,
    })
  } catch (e: any) {
    console.error('submit-pick push failure', e)
  }

  return NextResponse.json({
    ok: true,
    pickId: inserted.id,
    emailSent: emailResult.ok,
    clientEmailSent: clientEmailResult.ok && !clientEmailResult.skipped,
    clientEmailSkipped: clientEmailResult.skipped ?? null,
  })
}
