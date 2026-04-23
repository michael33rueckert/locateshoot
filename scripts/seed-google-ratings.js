// Pull Google ratings for every location via Places API (New) Text Search
// and write them to locations.rating. Skips locations that already have a
// rating unless you pass --force.
//
// Run:
//   node scripts/seed-google-ratings.js
//   node scripts/seed-google-ratings.js --force

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY
if (!URL || !KEY) { console.error('Missing Supabase env'); process.exit(1) }
if (!PLACES_KEY) { console.error('Missing GOOGLE_PLACES_API_KEY'); process.exit(1) }

const FORCE = process.argv.includes('--force')

async function sb(path, opts = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers ?? {}),
    },
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`Supabase ${r.status}: ${t}`)
  }
  return r.json()
}

async function searchOnce({ name, city, state, lat, lng }, includedType) {
  const body = {
    textQuery: [name, city, state].filter(Boolean).join(' '),
    maxResultCount: 5,
    ...(includedType ? { includedType } : {}),
    ...(lat != null && lng != null ? {
      locationBias: {
        circle: { center: { latitude: lat, longitude: lng }, radius: 5000 },
      },
    } : {}),
  }
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_KEY,
      'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.types,places.id',
    },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`Places ${r.status}: ${t}`)
  }
  const candidates = (await r.json()).places ?? []
  return candidates.find(p => p.rating != null) ?? null
}

// Plain text search frequently matches a neighborhood/district result that has no rating
// (e.g. "Pike Place Market" matches the neighborhood, not the market). Fall back through
// a few common primary-type filters to find the actual rated establishment.
async function searchPlace(loc) {
  for (const t of [undefined, 'tourist_attraction', 'park', 'museum', 'historical_landmark']) {
    const p = await searchOnce(loc, t)
    if (p) return p
    await new Promise(r => setTimeout(r, 120))
  }
  return null
}

async function run() {
  const locs = await sb('locations?select=id,name,city,state,latitude,longitude,rating&order=name.asc')
  console.log(`Fetched ${locs.length} locations`)

  let updated = 0, skipped = 0, missing = 0, failed = 0
  for (const loc of locs) {
    if (!FORCE && loc.rating != null) { skipped++; continue }
    try {
      const place = await searchPlace({
        name: loc.name, city: loc.city, state: loc.state,
        lat: loc.latitude, lng: loc.longitude,
      })
      if (!place || place.rating == null) {
        console.log(`  — ${loc.name}, ${loc.city}: no rating on Google`)
        missing++
        continue
      }
      await sb(`locations?id=eq.${loc.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ rating: place.rating }),
      })
      console.log(`  ✓ ${loc.name}, ${loc.city}: ${place.rating} (${place.userRatingCount ?? 0} reviews)`)
      updated++
    } catch (err) {
      console.error(`  ✗ ${loc.name}, ${loc.city}: ${err.message}`)
      failed++
    }
    // Places API has a generous quota but be polite.
    await new Promise(r => setTimeout(r, 120))
  }

  console.log(`\nDone. Updated: ${updated}  Skipped: ${skipped}  No rating: ${missing}  Failed: ${failed}`)
}

run().catch(err => { console.error(err); process.exit(1) })
