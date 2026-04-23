// For every published location that has no photo yet, pull the top Google Places
// photo, upload it to the location-photos Supabase Storage bucket, and insert a
// row in location_photos tagged as an external seed so it doesn't leak into
// the Photographer tab. Existing Wikipedia seeds are not overwritten.
//
// Run: node scripts/seed-google-photos.js

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY
const SEED_USER_ID = process.env.SEED_ADDED_BY_USER_ID || 'cb6cff36-ef30-426b-9a59-b7d75f73f51a'
if (!URL_BASE || !SB_KEY) { console.error('Missing Supabase env'); process.exit(1) }
if (!PLACES_KEY) { console.error('Missing GOOGLE_PLACES_API_KEY'); process.exit(1) }

async function sb(path, opts = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers ?? {}),
    },
  })
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`)
  const text = await r.text()
  return text ? JSON.parse(text) : null
}

async function searchOnce(loc, includedType) {
  const body = {
    textQuery: [loc.name, loc.city, loc.state].filter(Boolean).join(' '),
    maxResultCount: 5,
    ...(includedType ? { includedType } : {}),
    ...(loc.latitude != null && loc.longitude != null ? {
      locationBias: { circle: { center: { latitude: loc.latitude, longitude: loc.longitude }, radius: 5000 } },
    } : {}),
  }
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_KEY,
      'X-Goog-FieldMask': 'places.displayName,places.photos,places.types,places.id',
    },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`Places ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const candidates = (await r.json()).places ?? []
  return candidates.find(p => (p.photos?.length ?? 0) > 0) ?? null
}

// Match the ratings-seeder fallback so we skip neighborhood/administrative
// hits that have no photos attached.
async function findPlaceWithPhotos(loc) {
  for (const t of [undefined, 'tourist_attraction', 'park', 'museum', 'historical_landmark']) {
    const p = await searchOnce(loc, t)
    if (p) return p
    await new Promise(r => setTimeout(r, 120))
  }
  return null
}

async function fetchPhotoBytes(photoName) {
  // photoName looks like "places/ChIJ.../photos/ATp..."
  // Places API Photos returns a 302 redirect to the image CDN. fetch() follows redirects by default.
  const r = await fetch(
    `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=1200&maxWidthPx=1600&key=${PLACES_KEY}`,
  )
  if (!r.ok) throw new Error(`Photo media ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const buf = Buffer.from(await r.arrayBuffer())
  const type = r.headers.get('content-type') || 'image/jpeg'
  return { buf, type }
}

async function uploadToStorage(path, buf, contentType) {
  const r = await fetch(`${URL_BASE}/storage/v1/object/location-photos/${path}`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: buf,
  })
  if (!r.ok) throw new Error(`Storage ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return `${URL_BASE}/storage/v1/object/public/location-photos/${path}`
}

async function run() {
  const locs = await sb('locations?select=id,name,city,state,latitude,longitude&status=eq.published&latitude=not.is.null&longitude=not.is.null&order=name.asc&limit=500')
  const photos = await sb('location_photos?select=location_id&limit=5000')
  const hasPhoto = new Set(photos.map(p => p.location_id))
  const missing = locs.filter(l => !hasPhoto.has(l.id))
  console.log(`Published locations: ${locs.length}. Missing photos: ${missing.length}`)

  let inserted = 0, noMatch = 0, failed = 0
  for (const loc of missing) {
    try {
      const place = await findPlaceWithPhotos(loc)
      if (!place || !place.photos?.length) {
        console.log(`  — ${loc.name}, ${loc.city}: no Google photo available`)
        noMatch++
        continue
      }
      const photoName = place.photos[0].name
      const { buf, type } = await fetchPhotoBytes(photoName)
      const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'
      const path = `seed/google/${loc.id}.${ext}`
      const publicUrl = await uploadToStorage(path, buf, type)
      await sb('location_photos', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          location_id: loc.id,
          user_id: SEED_USER_ID,
          url: publicUrl,
          storage_path: 'external:google',
          is_private: false,
          caption: null,
          photographer_name: 'Google',
        }),
      })
      console.log(`  + ${loc.name}, ${loc.city}`)
      inserted++
    } catch (err) {
      console.log(`  ✗ ${loc.name}, ${loc.city}: ${String(err.message).slice(0, 120)}`)
      failed++
    }
    await new Promise(r => setTimeout(r, 200))
  }
  console.log(`\nDone. Inserted: ${inserted}  No match: ${noMatch}  Failed: ${failed}`)
}

run().catch(err => { console.error(err); process.exit(1) })
