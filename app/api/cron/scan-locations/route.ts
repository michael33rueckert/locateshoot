import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SCAN_CATEGORIES, scanCityCategory, sanitizeLocation, isSimilarLocation, verifyCoordinates, distanceMiles } from '@/lib/scan-locations'
import { sendPushToUser } from '@/lib/server-push'
import { sendEmail, escapeHtml } from '@/lib/email'

// Daily-cron scanner. Vercel Hobby caps functions at 60s and one Claude
// scan (~30–45s) plus geocode + inserts already comes close, so this
// endpoint processes ONE (city, category) per invocation and advances a
// queue pointer stored in admin_settings.scanner_config. Over N daily
// runs it cycles through the full cities × categories grid.
//
// Anything the scanner finds lands with status='pending' so the map
// stays clean until the admin reviews each row in the Tinder-style
// swipe UI. Dedup is stricter than the interactive scanner: it checks
// the whole state (not just city) AND rejects any candidate whose
// geocoded coord is within ~250 ft of an existing row regardless of
// status — so a candidate the auto-scan already surfaced last week
// but that's still awaiting review doesn't get re-proposed today.

export const maxDuration = 60

export async function GET(request: Request) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Reject
  // anything else so a random POST from the internet can't force a
  // scan. Also allow a query-param secret for manual browser triggers
  // during setup.
  const cronSecret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization') ?? ''
  const url = new URL(request.url)
  const querySecret = url.searchParams.get('secret')
  const ok = cronSecret && (auth === `Bearer ${cronSecret}` || querySecret === cronSecret)
  if (!ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: cfgRow } = await admin.from('admin_settings').select('value').eq('key', 'scanner_config').single()
  const cfg = (cfgRow?.value ?? {}) as {
    enabled?:        boolean
    cities?:         string[]
    categories?:     string[]
    queue_index?:    number
    last_run_at?:    string | null
    notify_email?:   string | null
    notify_user_id?: string | null
  }

  if (!cfg.enabled) {
    return NextResponse.json({ ok: true, skipped: 'disabled' })
  }
  const cities = Array.isArray(cfg.cities) ? cfg.cities.filter(Boolean) : []
  const categories = Array.isArray(cfg.categories) ? cfg.categories.filter(Boolean) : []
  if (cities.length === 0 || categories.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'no cities/categories' })
  }

  // Combo list is deterministic — cities outer, categories inner — so
  // the queue index maps consistently across runs even if the arrays
  // are re-ordered in the admin UI.
  const combos: Array<{ city: string; category: string }> = []
  for (const c of cities) for (const cat of categories) combos.push({ city: c, category: cat })
  const idx = ((cfg.queue_index ?? 0) % combos.length + combos.length) % combos.length
  const { city, category } = combos[idx]

  const categoryDef = SCAN_CATEGORIES.find(c => c.name === category)
  if (!categoryDef) {
    // Advance past a bad category so the queue doesn't jam on it.
    await admin.from('admin_settings')
      .update({ value: { ...cfg, queue_index: (idx + 1) % combos.length }, updated_at: new Date().toISOString() })
      .eq('key', 'scanner_config')
    return NextResponse.json({ ok: false, skipped: 'unknown_category', category })
  }

  // Run the Claude scan.
  let candidates: any[] = []
  try {
    const raw = await scanCityCategory(city, categoryDef.prompt(city))
    candidates = raw.map(sanitizeLocation)
  } catch (err: any) {
    console.error('cron scan-locations: scanCityCategory threw', { city, category, err: err?.message })
    return NextResponse.json({ ok: false, error: 'scan_failed', message: err?.message }, { status: 500 })
  }

  // Dedup pool — whole state, all statuses (including pending). Broader
  // than the interactive commit endpoint on purpose: the auto-scanner
  // shouldn't re-propose something we already have in review.
  const stateGuess = (candidates[0]?.state ?? '').trim() || city.split(',')[1]?.trim() || ''
  let poolQuery = admin.from('locations').select('id,name,city,state,latitude,longitude')
  if (stateGuess) poolQuery = poolQuery.eq('state', stateGuess)
  else            poolQuery = poolQuery.ilike('city', `%${city.split(',')[0].trim()}%`)
  const { data: existing } = await poolQuery
  const pool = (existing ?? []) as Array<{ id: string; name: string; city: string; latitude: number | null; longitude: number | null }>

  const inserted: string[] = []
  const skipped:  string[] = []

  for (const loc of candidates) {
    if (pool.some(e => isSimilarLocation(loc.name, loc.city, e.name, e.city))) {
      skipped.push(`similar: ${loc.name}`)
      continue
    }
    const verified = await verifyCoordinates(loc.name, loc.city, loc.state)
    if (verified) { loc.latitude = verified.lat; loc.longitude = verified.lng }
    if (pool.some(e => Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)
                    && distanceMiles({ latitude: loc.latitude, longitude: loc.longitude }, e) < 0.05)) {
      skipped.push(`same-spot: ${loc.name}`)
      continue
    }
    const { error: insertErr } = await admin.from('locations').insert({
      name:              loc.name,
      city:              loc.city,
      state:             loc.state,
      latitude:          loc.latitude,
      longitude:         loc.longitude,
      description:       loc.description,
      access_type:       loc.access_type,
      category:          loc.category || category,
      tags:              loc.tags,
      best_time:         loc.best_time,
      parking_info:      loc.parking_info,
      permit_required:   loc.permit_required ?? false,
      permit_notes:      loc.permit_notes,
      permit_fee:        loc.permit_fee,
      permit_website:    loc.permit_website,
      permit_certainty:  loc.permit_certainty,
      permit_scanned_at: new Date().toISOString(),
      quality_score:     loc.quality_score,
      rating:            loc.rating,
      status:            'pending',              // <— key: not visible on Explore until approved
      source:            'ai_scanner_auto',
      added_by:          cfg.notify_user_id ?? null,
    })
    if (insertErr) {
      skipped.push(`insert failed: ${loc.name}`)
      continue
    }
    inserted.push(loc.name)
    // Grow the pool so two similar candidates in the same batch don't
    // both land.
    pool.push({ id: '_local_' + inserted.length, name: loc.name, city: loc.city, latitude: loc.latitude, longitude: loc.longitude })
  }

  // Advance queue + stamp last-run.
  await admin.from('admin_settings')
    .update({ value: { ...cfg, queue_index: (idx + 1) % combos.length, last_run_at: new Date().toISOString() }, updated_at: new Date().toISOString() })
    .eq('key', 'scanner_config')

  // Notify (push + email) only when we actually surfaced new rows —
  // no need to ping the admin about "no new candidates in Boise
  // today". Both channels deep-link to the review overlay.
  if (inserted.length > 0) {
    const total = inserted.length
    const title = `🤖 ${total} new location${total === 1 ? '' : 's'} to review`
    const body  = `${city} · ${category}`
    const reviewUrl = '/admin?review=scanner'

    if (cfg.notify_user_id) {
      try { await sendPushToUser(admin as any, cfg.notify_user_id, { title, body, url: reviewUrl, tag: 'auto-scan-review' }) }
      catch (e) { console.error('cron scan-locations: push failed', e) }
    }
    if (cfg.notify_email) {
      const appOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? 'https://locateshoot.com'
      try {
        await sendEmail({
          to: cfg.notify_email,
          subject: title,
          html: `
            <div style="font-family: Georgia, serif; color: #1a1612; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px;">
                <span style="width:12px;height:12px;border-radius:50%;background:#c4922a;display:inline-block;"></span>
                <strong style="font-size:15px;">LocateShoot</strong>
              </div>
              <h1 style="font-family: Georgia, serif; font-size: 22px; font-weight: 700; margin: 0 0 12px;">${escapeHtml(title)}</h1>
              <div style="font-size:14px; line-height:1.7; color:#3a3229; margin: 0 0 20px;">
                <div><strong>City:</strong> ${escapeHtml(city)}</div>
                <div><strong>Category:</strong> ${escapeHtml(category)}</div>
                <div style="margin-top:10px;"><strong>New candidates:</strong></div>
                <ol style="margin:6px 0 4px 20px; padding:0; font-size:14px; line-height:1.7;">
                  ${inserted.slice(0, 12).map(n => `<li>${escapeHtml(n)}</li>`).join('')}
                  ${inserted.length > 12 ? `<li>+${inserted.length - 12} more…</li>` : ''}
                </ol>
              </div>
              <div style="margin: 24px 0;">
                <a href="${appOrigin}${reviewUrl}" style="display:inline-block;padding:12px 22px;background:#c4922a;color:#1a1612;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">
                  Review candidates →
                </a>
              </div>
              <p style="font-size:12px; color:#8a7e70; margin-top:32px; border-top:1px solid #eee; padding-top:16px;">
                Nothing goes live on the public map until you swipe to keep it.
              </p>
            </div>
          `,
        })
      } catch (e) { console.error('cron scan-locations: email failed', e) }
    }
  }

  return NextResponse.json({
    ok: true,
    city, category,
    inserted: inserted.length,
    skipped:  skipped.length,
    queue: { index: idx, total: combos.length, next: (idx + 1) % combos.length },
  })
}
