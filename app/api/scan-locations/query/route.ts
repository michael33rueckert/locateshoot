import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminEmail } from '@/lib/admin'
import { SCAN_CATEGORIES, scanCityCategory, sanitizeLocation, isSimilarLocation, distanceMiles } from '@/lib/scan-locations'

// Phase 1 of the two-endpoint scanner (Vercel Hobby forces the split; 60s
// serverless-function cap doesn't fit Claude + geocode + DB in one call).
// This endpoint does exactly one Claude call with web search and returns
// the raw candidates. The client posts those candidates to /commit next,
// which does the fast DB work under a second HTTP budget.

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

    const body = await request.json().catch(() => ({}))
    const city:     string = typeof body.city === 'string' ? body.city.trim() : ''
    const category: string = typeof body.category === 'string' ? body.category : ''
    if (!city)     return NextResponse.json({ error: 'city_required' }, { status: 400 })
    if (!category) return NextResponse.json({ error: 'category_required' }, { status: 400 })

    const categoryDef = SCAN_CATEGORIES.find(c => c.name === category)
    if (!categoryDef) return NextResponse.json({ error: 'unknown_category', message: `No category named "${category}"` }, { status: 400 })

    let candidates
    try {
      const raw = await scanCityCategory(city, categoryDef.prompt(city))
      // Sanitize server-side so /commit can trust the shape of what it
      // receives back from the client. The commit endpoint is admin-gated
      // but this keeps a well-formed contract either way.
      candidates = raw.map(sanitizeLocation)
    } catch (err: any) {
      const msg = err?.message ?? 'scan_failed'
      const status = /429/.test(msg) ? 429 : 500
      return NextResponse.json({ error: 'scan_failed', message: msg }, { status })
    }

    // Preview dedup check — attach a `conflict` per candidate so the
    // admin UI can surface a "⚠ likely duplicate of X" flag before
    // committing. Pool is scoped to the state to keep the query
    // cheap; commit re-checks with the same logic so nothing sneaks
    // through even if the admin approves a flagged row.
    const stateGuess = (candidates[0]?.state ?? '').trim() || city.split(',')[1]?.trim() || ''
    // Pull all statuses (published + pending + rejected + …) so the
    // preview surfaces conflicts against rejects too — a candidate
    // the admin already rejected should show "⚠ likely duplicate"
    // instead of appearing as fresh.
    let existingQuery = supabase
      .from('locations')
      .select('id, name, city, state, latitude, longitude, status')
    if (stateGuess) existingQuery = existingQuery.eq('state', stateGuess)
    else            existingQuery = existingQuery.ilike('city', `%${city.split(',')[0].trim()}%`)
    const { data: existingRows } = await existingQuery
    const existing = (existingRows ?? []) as Array<{ id: string; name: string; city: string; state: string | null; latitude: number | null; longitude: number | null; status?: string }>

    const annotated = candidates.map(c => {
      // Name-based fuzzy match (same city or same first-city-token).
      const nameConflict = existing.find(e => isSimilarLocation(c.name, c.city, e.name, e.city))
      // Proximity match — ~250 ft is close enough that it's almost
      // certainly the same physical spot, even if the model
      // returned a different name.
      const proxConflict = !nameConflict
        ? existing.find(e =>
            Number.isFinite(c.latitude) && Number.isFinite(c.longitude)
            && distanceMiles({ latitude: c.latitude, longitude: c.longitude }, e) < 0.05
          )
        : null
      const hit = nameConflict ?? proxConflict ?? null
      // Lead with the "already rejected" reason when applicable so
      // the admin sees "no, I already said no to this" before
      // deciding whether to include it again.
      const baseReason = nameConflict ? 'similar name' : 'same coordinates'
      const reason = hit?.status === 'rejected'
        ? `previously rejected · ${baseReason}`
        : hit?.status === 'pending'
          ? `already in review queue · ${baseReason}`
          : baseReason
      return {
        ...c,
        conflict: hit ? {
          id:   hit.id,
          name: hit.name,
          city: hit.city,
          reason,
        } : null,
      }
    })

    return NextResponse.json({ ok: true, city, category, candidates: annotated })
  } catch (err: any) {
    console.error('scan-locations/query error:', err)
    return NextResponse.json({ error: 'internal', message: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}
