// Server-only utilities shared between /api/scan-locations/query and
// /api/scan-locations/commit. Do NOT import from client code — this
// module reads ANTHROPIC_API_KEY and NEXT_PUBLIC_GOOGLE_PLACES_KEY
// (the latter is public but shipped to the client for its Explore
// map already, so no leak).
//
// The two-endpoint split exists because Vercel Hobby caps serverless
// functions at 60s. The full old scanner (Claude call + geocode + DB
// writes) sometimes crossed that cap on a single (city, category).
// Split, each endpoint fits well under 60s:
//   query  — one Claude call, ~20-40s
//   commit — 10 parallel geocodes + serial inserts, ~2-5s

export interface ScannedLocation {
  name: string
  city: string
  state: string
  latitude: number
  longitude: number
  description: string
  access_type: 'public' | 'private'
  category: string
  tags: string[]
  best_time: string
  parking_info: string
  permit_required: boolean
  permit_notes: string | null
  permit_fee: number | null
  permit_website: string | null
  permit_certainty: 'verified' | 'likely' | 'unknown'
  quality_score: number
  rating: number
}

export const SCAN_CATEGORIES = [
  {
    name: 'Parks & Nature',
    prompt: (city: string) => `Find 10 real photoshoot locations in ${city} that are parks, nature areas, trails, gardens, botanical gardens, arboretums, nature preserves, greenways, or outdoor green spaces. Include city parks, county parks, state parks nearby, riverside parks, lake parks, woodland areas, and hiking trails. Be very specific — name the exact park section, trail name, or garden area, not just the park name.`,
  },
  {
    name: 'Urban & Architecture',
    prompt: (city: string) => `Find 10 real photoshoot locations in ${city} that feature interesting urban architecture, murals, street art, alleys, bridges, rooftops, downtown streetscapes, neon signs, brick walls, colorful buildings, or industrial areas. Include specific intersections, named murals, specific bridges, and named buildings or districts.`,
  },
  {
    name: 'Historic & Cultural',
    prompt: (city: string) => `Find 10 real photoshoot locations in ${city} that are historically significant or culturally interesting — historic districts, old churches, cemeteries, monuments, memorials, museums with interesting exteriors, old train stations, courthouses, libraries, university campuses. Be specific about exact locations.`,
  },
  {
    name: 'Waterfront & Water Features',
    prompt: (city: string) => `Find 10 real photoshoot locations in ${city} near water — rivers, lakes, ponds, creeks, waterfalls, fountains, reservoirs, marinas, docks, riverfronts, lakefronts. Include specific named bodies of water, named waterfalls, named fountains in parks or plazas.`,
  },
  {
    name: 'Fields, Meadows & Open Spaces',
    prompt: (city: string) => `Find 10 real photoshoot locations in or near ${city} that are open fields, meadows, prairies, farmland, sunflower fields, wildflower areas, open hillsides, or wide-open spaces with big sky views. Include specific named fields, farms that allow photography, and open recreation areas.`,
  },
  {
    name: 'Private Venues & Hidden Gems',
    prompt: (city: string) => `Find 10 real photoshoot locations in ${city} that are private venues or hidden gems — barns, ranches, vineyards, breweries with interesting exteriors, boutique hotels with rooftops, old warehouses, or unique private properties known among local photographers.`,
  },
  {
    name: 'Golden Hour & Sunrise Spots',
    prompt: (city: string) => `Find 10 real photoshoot locations in or near ${city} that are especially well known for golden hour, sunrise, or sunset photography — hilltops, overlooks, open fields, rooftops, lakefronts, or any spot with unobstructed horizon views.`,
  },
  {
    name: 'Neighborhoods & Street Life',
    prompt: (city: string) => `Find 10 real photoshoot locations in ${city} that are interesting residential neighborhoods, colorful streets, charming commercial districts, or areas with character — tree-lined streets, painted Victorian homes, arts districts, or bohemian neighborhoods.`,
  },
]

export const SCAN_CATEGORY_NAMES = SCAN_CATEGORIES.map(c => c.name)

// ── Fuzzy deduplication ───────────────────────────────────────────────────────

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(the|a|an|of|at|in|on|and|park|trail|area|lake|river|creek|garden|grove|historic|district)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isSimilarLocation(
  name1: string, city1: string,
  name2: string, city2: string,
): boolean {
  const c1 = city1.toLowerCase().split(',')[0].trim()
  const c2 = city2.toLowerCase().split(',')[0].trim()
  if (!c1.includes(c2) && !c2.includes(c1) && c1 !== c2) return false

  const n1 = normalizeName(name1)
  const n2 = normalizeName(name2)
  if (!n1 || !n2) return false

  if (n1 === n2) return true

  if (n1.length > 8 && n2.length > 8) {
    if (n1.includes(n2) || n2.includes(n1)) return true
  }

  const w1 = n1.split(' ').filter(w => w.length > 3)
  const w2 = n2.split(' ').filter(w => w.length > 3)
  if (w1.length < 2 || w2.length < 2) return false
  const common = w1.filter(w => w2.includes(w))
  return common.length / Math.min(w1.length, w2.length) >= 0.75
}

// ── Coordinate verification ───────────────────────────────────────────────────

export async function verifyCoordinates(
  name: string, city: string, state: string
): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY
  if (!apiKey) return null
  const query = encodeURIComponent(`${name}, ${city}, ${state}`)
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${apiKey}`
  try {
    const res  = await fetch(url)
    const data = await res.json()
    if (data.status === 'OK' && data.results?.[0]) {
      const loc = data.results[0].geometry.location
      return { lat: loc.lat, lng: loc.lng }
    }
  } catch {}
  return null
}

// ── Sanitize ──────────────────────────────────────────────────────────────────

export function sanitizeLocation(loc: ScannedLocation): ScannedLocation {
  return {
    ...loc,
    rating:           Math.min(5.0, Math.max(0, Math.round((loc.rating ?? 4.0) * 10) / 10)),
    quality_score:    Math.min(100, Math.max(0, Math.round(loc.quality_score ?? 75))),
    permit_fee:       typeof loc.permit_fee === 'number' ? Math.round(loc.permit_fee * 100) / 100 : null,
    latitude:         Math.round((loc.latitude  ?? 0) * 1000000) / 1000000,
    longitude:        Math.round((loc.longitude ?? 0) * 1000000) / 1000000,
    name:             (loc.name ?? '').slice(0, 200),
    city:             (loc.city ?? '').slice(0, 100),
    state:            (loc.state ?? '').slice(0, 50),
    description:      (loc.description ?? '').slice(0, 2000),
    best_time:        (loc.best_time ?? '').slice(0, 200),
    parking_info:     (loc.parking_info ?? '').slice(0, 500),
    permit_notes:     loc.permit_notes  ? loc.permit_notes.slice(0, 500)  : null,
    permit_website:   loc.permit_website ? loc.permit_website.slice(0, 500) : null,
    permit_certainty: ['verified','likely','unknown'].includes(loc.permit_certainty) ? loc.permit_certainty : 'unknown',
    access_type:      loc.access_type === 'private' ? 'private' : 'public',
    tags:             Array.isArray(loc.tags) ? loc.tags.slice(0, 10) : [],
  }
}

// ── Claude API call with web search ──────────────────────────────────────────

export async function scanCityCategory(city: string, categoryPrompt: string): Promise<ScannedLocation[]> {
  const prompt = `You are an expert photography location scout with deep knowledge of ${city}.

${categoryPrompt}

QUALITY OVER QUANTITY:
- Only include locations that are genuinely photogenic and specifically recognized as good photo spots by photographers, wedding vendors, or online photography communities. If a spot is just "a place in the city" without visual distinction, skip it.
- Skip generic or non-distinctive venues: chain restaurants, ordinary strip malls, unremarkable office parks, generic subdivisions, plain intersections, gas stations, big-box stores.
- If ${city} is a smaller city and only 3-5 truly excellent locations exist in this category, return only those 3-5. Do NOT pad the list to reach 10 by including mediocre entries — a shorter list of great spots is far more useful than a longer list diluted with weak ones.
- Do NOT inflate quality_score or rating to justify including a location. If a spot would honestly score below 60/100 or below 3.3/5, leave it out entirely — the server rejects those anyway.
- Prefer locations you can find corroboration for (a wedding-venue listing, a "best photo spots in [city]" article, a local photographer's blog, a real Instagram tag) over places you're inferring might be photogenic.

For each location, use web search to find and return ALL of these fields:
- name: exact specific name (under 150 chars)
- city: city name
- state: 2-letter state abbreviation (e.g. "MO")
- latitude: number
- longitude: number
- description: vivid 2-3 sentence description of what makes it photogenic — describe the actual visual features that make it work (light quality, textures, backdrops, seasonal appeal), not just what the place is
- access_type: "public" or "private"
- category: category name
- tags: array from this list — Golden Hour, Sunrise, Sunset, Forest, Urban, Waterfront, Historic, Architecture, Nature, Meadow, Creek, Industrial, Rustic, Romantic, Dramatic, Colorful, Editorial, Wedding, Family, Portrait, Fashion, Boho, Gardens, Cemetery, Bridge, Mural, Alley, Barn, Ranch, Vineyard, Campus
- best_time: e.g. "Golden hour" or "Early morning"
- parking_info: brief parking note
- permit_required: true or false — does commercial/professional photography require a permit?
- permit_notes: brief description of permit requirements (null if none required or unknown)
- permit_fee: permit cost in USD as a number, or null if free or not found
- permit_website: the EXACT URL of the official page where you found permit information (parks dept, city govt, etc). null if not found. Do NOT make up URLs.
- permit_certainty: "verified" = found official govt/parks page confirming requirements. "likely" = found strong indirect evidence permits needed. "unknown" = could not find specific permit info.
- quality_score: integer 0-100 (see rubric)
- rating: one decimal 0.0-5.0 (see rubric)

QUALITY_SCORE RUBRIC (be honest — do not inflate):
- 90-100: iconic, must-see spots widely referenced in "best photo locations" lists for the region. Few cities have more than 2-3 of these.
- 75-89: excellent, distinctive spots regularly used by local wedding/portrait photographers.
- 60-74: solid, useful spots that add variety to a portfolio but aren't must-visit.
- Below 60: do not include.

RATING RUBRIC (be honest — do not inflate):
- 4.5-5.0: photographers actively seek this out and plan sessions around it.
- 3.8-4.4: photographers use this happily when it fits the session mood.
- 3.3-3.7: usable but not distinctive; a fallback rather than a first choice.
- Below 3.3: do not include.

OTHER RULES:
- Only include real verified locations that exist
- For permit_website provide the actual URL you found — never fabricate one
- rating MUST be 0.0-5.0, quality_score MUST be 0-100 integer

Respond ONLY with a raw JSON array, no markdown fences:
[{"name":"...","city":"...","state":"MO","latitude":39.0,"longitude":-94.0,"description":"...","access_type":"public","category":"Park","tags":["Golden Hour"],"best_time":"Golden hour","parking_info":"Free lot on site","permit_required":false,"permit_notes":null,"permit_fee":null,"permit_website":null,"permit_certainty":"unknown","quality_score":80,"rating":4.5}]`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-5',
      max_tokens: 8000,
      // Explicit disable — Sonnet 5 defaults to adaptive thinking when
      // this field is omitted (a behavior change vs Sonnet 4.6). Adaptive
      // thinking adds 15-30s to a research prompt that already delegates
      // to web search; we don't need it here.
      thinking:   { type: 'disabled' },
      // max_uses caps how many web-search rounds Claude runs. Without it
      // Claude occasionally issues 5-8 rounds on fuzzy topics, each a
      // ~5-10s server-side roundtrip. 3 rounds is enough for well-known
      // metros; the prompt already primes it to research then compose.
      tools:      [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages:   [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Claude API ${response.status}: ${errText.slice(0, 300)}`)
  }

  const data = await response.json()
  const textContent = (data.content ?? [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')

  if (!textContent) return []

  const cleaned  = textContent.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
  const startIdx = cleaned.indexOf('[')
  const endIdx   = cleaned.lastIndexOf(']')
  if (startIdx === -1 || endIdx === -1) return []

  try {
    const locations: ScannedLocation[] = JSON.parse(cleaned.slice(startIdx, endIdx + 1))
    return locations.filter(loc =>
      loc.name &&
      loc.city &&
      typeof loc.latitude  === 'number' &&
      typeof loc.longitude === 'number' &&
      Math.abs(loc.latitude)  <= 90 &&
      Math.abs(loc.longitude) <= 180 &&
      // Quality floor — matches the rubric in the prompt above. Deliberately
      // gentle rather than strict so a small city can still contribute
      // 1-3 locations per category. A stricter cutoff (say 70/3.8) starves
      // small-town coverage; a much looser one (say 50/2.5) lets weak
      // spots slip through. Adjust after watching real scan output.
      (typeof loc.quality_score === 'number' ? loc.quality_score : 0) >= 60 &&
      (typeof loc.rating        === 'number' ? loc.rating        : 0) >= 3.3
    )
  } catch {
    return []
  }
}
