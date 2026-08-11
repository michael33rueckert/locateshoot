import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminEmail } from '@/lib/admin'
import { isSimilarLocation, sanitizeLocation, verifyCoordinates, distanceMiles, type ScannedLocation } from '@/lib/scan-locations'

// Phase 2 of the two-endpoint scanner. Takes the candidate array from
// /query, fuzzy-dedups against existing city locations, exact-matches +
// geocodes in parallel, and inserts survivors serially. Bounded to
// ~2-5s in practice for the default 10 candidates per category, so it
// fits comfortably under the 60s Hobby cap.

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const { data: { user } } = await supabase.auth.getUser(auth.slice(7))
    if (!user || !isAdminEmail(user.email)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const userId = user.id

    const body = await request.json().catch(() => ({}))
    const city:     string = typeof body.city === 'string' ? body.city.trim() : ''
    const category: string = typeof body.category === 'string' ? body.category : ''
    const rawCandidates: ScannedLocation[] = Array.isArray(body.candidates) ? body.candidates : []
    if (!city)     return NextResponse.json({ error: 'city_required' }, { status: 400 })
    if (!category) return NextResponse.json({ error: 'category_required' }, { status: 400 })

    // Preload existing locations for the WHOLE STATE, with coords, so
    // dedup catches cross-suburb duplicates (e.g. an existing row in
    // Overland Park would still block a new "same place" row logged
    // under Kansas City). Also lets us do proximity-based dedup —
    // any candidate whose geocoded position lands within ~250 ft of
    // an existing row is treated as the same place regardless of
    // name. Pool is scoped to state, not global, to keep the query
    // cheap and avoid false positives from same-named parks in
    // different metros.
    const rawCandidatesSanitized = rawCandidates.map(sanitizeLocation)
    const stateGuess = (rawCandidatesSanitized[0]?.state ?? '').trim() || city.split(',')[1]?.trim() || ''
    let existingQuery = supabase
      .from('locations')
      .select('id, name, city, state, latitude, longitude')
      .eq('status', 'published')
    if (stateGuess) existingQuery = existingQuery.eq('state', stateGuess)
    else            existingQuery = existingQuery.ilike('city', `%${city.split(',')[0].trim()}%`)
    const { data: existingInState } = await existingQuery
    const existingSet: { id?: string; name: string; city: string; state?: string | null; latitude: number | null; longitude: number | null }[] = (existingInState ?? []) as any

    const inserted: string[] = []
    const skipped:  string[] = []
    const errors:   string[] = []

    const survivors = rawCandidatesSanitized
      .filter(loc => {
        if (existingSet.some(e => isSimilarLocation(loc.name, loc.city, e.name, e.city))) {
          skipped.push(`similar: ${loc.name}`)
          return false
        }
        return true
      })

    // Parallel: DB exact-match + Google geocode per candidate. What used
    // to be ~5s of serial round-trips collapses to max(each) ≈ 500-800ms.
    const enriched = await Promise.all(survivors.map(async (loc) => {
      const [exactMatch, verified] = await Promise.all([
        supabase.from('locations').select('id').ilike('name', loc.name).ilike('city', loc.city).maybeSingle(),
        verifyCoordinates(loc.name, loc.city, loc.state),
      ])
      if (exactMatch.data) return { loc, duplicate: true }
      if (verified) { loc.latitude = verified.lat; loc.longitude = verified.lng }
      return { loc, duplicate: false }
    }))

    // Serial insert. `existingSet` grows between inserts so two candidates
    // that happened to be similar to each other can't both land.
    for (const { loc, duplicate } of enriched) {
      if (duplicate) {
        skipped.push(`duplicate: ${loc.name}`)
        continue
      }
      if (existingSet.some(e => isSimilarLocation(loc.name, loc.city, e.name, e.city))) {
        skipped.push(`similar-in-batch: ${loc.name}`)
        continue
      }
      // Proximity dedup — geocoded coord landed within ~250 ft of an
      // existing row. Names may differ (Google Places aliases, mis-
      // spellings, different marketing names), but two distinct
      // photoshoot venues that physically overlap doesn't happen.
      const near = existingSet.find(e =>
        Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)
        && distanceMiles({ latitude: loc.latitude, longitude: loc.longitude }, e) < 0.05
      )
      if (near) {
        skipped.push(`same-spot as "${near.name}": ${loc.name}`)
        continue
      }

      const { error: insertErr } = await supabase.from('locations').insert({
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
        status:            'published',
        source:            'ai_scanner',
        added_by:          userId,
      })

      if (insertErr) {
        errors.push(`${loc.name}: ${insertErr.message}`)
      } else {
        inserted.push(loc.name)
        existingSet.push({ name: loc.name, city: loc.city, state: loc.state, latitude: loc.latitude, longitude: loc.longitude })
      }
    }

    return NextResponse.json({
      ok:       true,
      city,
      category,
      scanned:  rawCandidates.length,
      inserted,
      skipped,
      errors,
    })
  } catch (err: any) {
    console.error('scan-locations/commit error:', err)
    return NextResponse.json({ error: 'internal', message: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}
