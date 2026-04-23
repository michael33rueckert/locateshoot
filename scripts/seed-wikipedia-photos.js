// For every 'curated' location that has no photo yet, fetch a Wikipedia
// thumbnail (if one exists) and insert into location_photos.
// Wikipedia thumbnails are free, CC-licensed, and served from upload.wikimedia.org.
// Run: node scripts/seed-wikipedia-photos.js

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const USER_ID = process.env.SEED_ADDED_BY_USER_ID || 'cb6cff36-ef30-426b-9a59-b7d75f73f51a'
if (!URL || !KEY) { console.error('Missing env'); process.exit(1) }

// Strip common suffixes that tank search quality: "(Exterior)", "— Main Concourse", etc.
function cleanQueryName(name) {
  return name
    .replace(/\s*[—–-]\s*.*$/, '')   // strip everything after an em-dash / en-dash / hyphen
    .replace(/\([^)]*\)/g, '')        // strip parenthetical notes
    .replace(/\bExterior\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const WP_HEADERS = {
  'User-Agent': 'LocateShoot/1.0 (https://locateshoot.com; michael@locateshoot.com)',
  'Accept':     'application/json',
}

async function restSummary(title) {
  const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, { headers: WP_HEADERS }).catch(() => null)
  if (!r || !r.ok) return null
  const j = await r.json().catch(() => null)
  // Prefer originalimage for higher quality, fall back to thumbnail
  const src = j?.originalimage?.source ?? j?.thumbnail?.source ?? null
  // Wikipedia "originalimage" can be huge (10MB+); prefer the 1200px thumbnail when available
  return j?.thumbnail?.source ?? src
}

async function searchTitle(query) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json&origin=*`
  const s = await fetch(url, { headers: WP_HEADERS }).then(r => r.json()).catch(() => null)
  return s?.query?.search?.[0]?.title ?? null
}

async function fetchWikipediaThumb(name, city, state) {
  const short = cleanQueryName(name)
  const attempts = [
    short && city ? `${short} ${city}` : null,
    short && state ? `${short} ${state}` : null,
    short || null,
    name,
  ].filter(Boolean)
  for (const q of attempts) {
    const title = await searchTitle(q)
    if (!title) continue
    const src = await restSummary(title)
    if (src) return src
    await new Promise(r => setTimeout(r, 80))
  }
  return null
}

async function main() {
  // Curated locations without a photo
  const listRes = await fetch(`${URL}/rest/v1/locations?select=id,name,city,state&source=eq.curated`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  const locs = await listRes.json()
  const hasPhotoRes = await fetch(`${URL}/rest/v1/location_photos?select=location_id&is_private=eq.false`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  const hasPhoto = new Set((await hasPhotoRes.json()).map(r => r.location_id))
  const missing = locs.filter(l => !hasPhoto.has(l.id))
  console.log(`Curated locations: ${locs.length}. Missing photos: ${missing.length}`)

  let inserted = 0, skipped = 0, errors = []
  for (const loc of missing) {
    const thumb = await fetchWikipediaThumb(loc.name, loc.city, loc.state)
    if (!thumb) {
      skipped++
      console.log(`  skip: ${loc.name}`)
      continue
    }
    // Insert with external sentinel storage_path
    const res = await fetch(`${URL}/rest/v1/location_photos`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        location_id:       loc.id,
        user_id:           USER_ID,
        url:               thumb,
        storage_path:      'external:wikipedia',
        is_private:        false,
        caption:           null,
        photographer_name: 'Wikipedia',
      }),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      errors.push(`${loc.name}: ${t.slice(0, 120)}`)
    } else {
      inserted++
      console.log(`  +   ${loc.name}`)
    }
    await new Promise(r => setTimeout(r, 150)) // be gentle with Wikipedia
  }
  console.log(`\nDone. Inserted: ${inserted}. Skipped (no Wikipedia match): ${skipped}. Errors: ${errors.length}`)
  if (errors.length) errors.slice(0, 5).forEach(e => console.log(' -', e))
}

main().catch(e => { console.error(e); process.exit(1) })
