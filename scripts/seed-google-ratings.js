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

async function searchPlace({ name, city, state, lat, lng }) {
  const body = {
    textQuery: [name, city, state].filter(Boolean).join(' '),
    maxResultCount: 1,
    // Bias toward the location's coordinates so we don't match namesakes in other states.
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
      'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.id',
    },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`Places ${r.status}: ${t}`)
  }
  const j = await r.json()
  return j.places?.[0] ?? null
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
