import { NextResponse } from 'next/server'

// Returns up to 10 Google Place photos for a given location name + coords.
// Runs server-side with the unrestricted GOOGLE_PLACES_API_KEY, so it works
// regardless of which host the caller (pick pages on custom domains, explore,
// etc.) is running on — no per-domain referrer whitelisting needed.

const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY

async function resolvePhotoUrl(photoName: string, maxHeightPx = 900): Promise<string | null> {
  // Places API (New) serves image binary via a redirect. With
  // skipHttpRedirect=true it returns {photoUri} JSON instead — a Google CDN
  // URL the browser can then load directly.
  const r = await fetch(
    `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=${maxHeightPx}&maxWidthPx=${Math.round(maxHeightPx * 1.4)}&skipHttpRedirect=true&key=${PLACES_KEY}`,
    { cache: 'no-store' },
  )
  if (!r.ok) return null
  const j = await r.json().catch(() => null)
  return j?.photoUri ?? null
}

async function searchOnce(
  textQuery: string,
  lat: number | null,
  lng: number | null,
  includedType?: string,
) {
  const body: any = {
    textQuery,
    maxResultCount: 5,
    ...(includedType ? { includedType } : {}),
    ...(lat != null && lng != null
      ? { locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 5000 } } }
      : {}),
  }
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_KEY!,
      'X-Goog-FieldMask': 'places.displayName,places.photos,places.types',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!r.ok) return null
  const j = await r.json().catch(() => null)
  const cands: any[] = j?.places ?? []
  return cands.find(p => (p.photos?.length ?? 0) > 0) ?? null
}

export async function POST(request: Request) {
  if (!PLACES_KEY) return NextResponse.json({ photos: [] })

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  const name  = typeof body.name  === 'string' ? body.name.trim().slice(0, 240)  : ''
  const city  = typeof body.city  === 'string' ? body.city.trim().slice(0, 120)  : ''
  const state = typeof body.state === 'string' ? body.state.trim().slice(0, 120) : ''
  const lat   = typeof body.lat   === 'number' && Number.isFinite(body.lat) ? body.lat : null
  const lng   = typeof body.lng   === 'number' && Number.isFinite(body.lng) ? body.lng : null
  if (!name) return NextResponse.json({ photos: [] })

  const textQuery = [name, city, state].filter(Boolean).join(' ')

  // Plain search, then fall back to type hints if no result had photos.
  let place: any = null
  for (const t of [undefined, 'tourist_attraction', 'park', 'museum', 'historical_landmark']) {
    place = await searchOnce(textQuery, lat, lng, t)
    if (place) break
  }
  if (!place) return NextResponse.json({ photos: [] })

  const photoNames: string[] = (place.photos ?? []).slice(0, 10).map((p: any) => p.name).filter(Boolean)
  const urls = await Promise.all(photoNames.map(n => resolvePhotoUrl(n)))
  const photos = urls
    .map((url, i) => (url ? { url, name: photoNames[i] } : null))
    .filter((p): p is { url: string; name: string } => !!p)

  return NextResponse.json({
    photos,
    // Cache hint for the Next.js fetch cache — photo URLs from Google are
    // typically valid ~60 min. We're fine re-resolving after that.
  }, { headers: { 'Cache-Control': 'public, max-age=1800' } })
}
