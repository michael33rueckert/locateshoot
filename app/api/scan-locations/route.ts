import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface ScannedLocation {
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

const SCAN_CATEGORIES = [
  {
    name: 'Parks & Nature',
    prompt: (city: string) => `Find 15 real photoshoot locations in ${city} that are parks, nature areas, trails, gardens, botanical gardens, arboretums, nature preserves, greenways, or outdoor green spaces. Include city parks, county parks, state parks nearby, riverside parks, lake parks, woodland areas, and hiking trails. Be very specific — name the exact park section, trail name, or garden area, not just the park name.`,
  },
  {
    name: 'Urban & Architecture',
    prompt: (city: string) => `Find 15 real photoshoot locations in ${city} that feature interesting urban architecture, murals, street art, alleys, bridges, rooftops, downtown streetscapes, neon signs, brick walls, colorful buildings, or industrial areas. Include specific intersections, named murals, specific bridges, and named buildings or districts.`,
  },
  {
    name: 'Historic & Cultural',
    prompt: (city: string) => `Find 15 real photoshoot locations in ${city} that are historically significant or culturally interesting — historic districts, old churches, cemeteries, monuments, memorials, museums with interesting exteriors, old train stations, courthouses, libraries, university campuses. Be specific about exact locations.`,
  },
  {
    name: 'Waterfront & Water Features',
    prompt: (city: string) => `Find 15 real photoshoot locations in ${city} near water — rivers, lakes, ponds, creeks, waterfalls, fountains, reservoirs, marinas, docks, riverfronts, lakefronts. Include specific named bodies of water, named waterfalls, named fountains in parks or plazas.`,
  },
  {
    name: 'Fields, Meadows & Open Spaces',
    prompt: (city: string) => `Find 15 real photoshoot locations in or near ${city} that are open fields, meadows, prairies, farmland, sunflower fields, wildflower areas, open hillsides, or wide-open spaces with big sky views. Include specific named fields, farms that allow photography, and open recreation areas.`,
  },
  {
    name: 'Private Venues & Hidden Gems',
    prompt: (city: string) => `Find 15 real photoshoot locations in ${city} that are private venues or hidden gems — barns, ranches, vineyards, breweries with interesting exteriors, boutique hotels with rooftops, old warehouses, or unique private properties known among local photographers.`,
  },
  {
    name: 'Golden Hour & Sunrise Spots',
    prompt: (city: string) => `Find 15 real photoshoot locations in or near ${city} that are especially well known for golden hour, sunrise, or sunset photography — hilltops, overlooks, open fields, rooftops, lakefronts, or any spot with unobstructed horizon views.`,
  },
  {
    name: 'Neighborhoods & Street Life',
    prompt: (city: string) => `Find 15 real photoshoot locations in ${city} that are interesting residential neighborhoods, colorful streets, charming commercial districts, or areas with character — tree-lined streets, painted Victorian homes, arts districts, or bohemian neighborhoods.`,
  },
]

// ── Fuzzy deduplication ───────────────────────────────────────────────────────

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(the|a|an|of|at|in|on|and|park|trail|area|lake|river|creek|garden|grove|historic|district)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isSimilarLocation(
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

async function verifyCoordinates(
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

function sanitizeLocation(loc: ScannedLocation): ScannedLocation {
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

// ── Retry on 429 ─────────────────────────────────────────────────────────────

async function scanWithRetry(city: string, categoryPrompt: string, maxRetries = 3): Promise<ScannedLocation[]> {
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await scanCityCategory(city, categoryPrompt)
    } catch (err: any) {
      lastError = err
      if (err.message?.includes('429')) {
        const waitMs = attempt * 65000
        console.log(`Rate limited — waiting ${waitMs / 1000}s (attempt ${attempt}/${maxRetries})`)
        await new Promise(r => setTimeout(r, waitMs))
      } else {
        throw err
      }
    }
  }
  throw lastError ?? new Error('Max retries exceeded')
}

// ── POST handler ──────────────────────────────────────────────────────────────

// Vercel Hobby caps serverless functions at 60s. One city × one category
// comfortably fits; multi-category scans are broken up client-side.
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const supabase    = getServiceClient()
    const body        = await request.json().catch(() => ({}))
    const cities: string[]     = body.cities     ?? []
    const userId: string       = body.userId      ?? ''
    const categories: string[] = body.categories  ?? SCAN_CATEGORIES.map(c => c.name)

    if (!userId)          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!cities.length)   return NextResponse.json({ error: 'No cities provided' }, { status: 400 })

    const allInserted: string[] = []
    const allErrors:   string[] = []
    let   totalScanned = 0

    const selectedCategories = SCAN_CATEGORIES.filter(c => categories.includes(c.name))

    for (const city of cities) {
      // Load existing locations for this city into memory for fuzzy dedup
      const citySlug = city.split(',')[0].trim()
      const { data: existingInCity } = await supabase
        .from('locations')
        .select('name, city')
        .ilike('city', `%${citySlug}%`)
      const existingSet: { name: string; city: string }[] = existingInCity ?? []
      console.log(`\nLoaded ${existingSet.length} existing locations for ${city}`)

      for (const category of selectedCategories) {
        try {
          console.log(`Scanning [${category.name}] in ${city}…`)
          totalScanned++

          const locations = await scanWithRetry(city, category.prompt(city))
          console.log(`  → Claude returned ${locations.length} locations`)

          for (const rawLoc of locations) {
            const loc = sanitizeLocation(rawLoc)

            // Fuzzy dedup check against in-memory set
            const isFuzzyDup = existingSet.some(e => isSimilarLocation(loc.name, loc.city, e.name, e.city))
            if (isFuzzyDup) {
              allErrors.push(`Similar exists: ${loc.name}`)
              continue
            }

            // Exact DB check as fallback
            const { data: exactMatch } = await supabase
              .from('locations')
              .select('id')
              .ilike('name', loc.name)
              .ilike('city', loc.city)
              .maybeSingle()
            if (exactMatch) {
              allErrors.push(`Duplicate: ${loc.name}`)
              continue
            }

            // Verify coordinates with Google
            const verified = await verifyCoordinates(loc.name, loc.city, loc.state)
            if (verified) { loc.latitude = verified.lat; loc.longitude = verified.lng }
            await new Promise(r => setTimeout(r, 200))

            // Insert
            const { error: insertErr } = await supabase.from('locations').insert({
              name:              loc.name,
              city:              loc.city,
              state:             loc.state,
              latitude:          loc.latitude,
              longitude:         loc.longitude,
              description:       loc.description,
              access_type:       loc.access_type,
              category:          loc.category || category.name,
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
              allErrors.push(`Error: ${loc.name} — ${insertErr.message}`)
            } else {
              allInserted.push(`${loc.name} (${category.name})`)
              existingSet.push({ name: loc.name, city: loc.city })
            }
          }

          await new Promise(r => setTimeout(r, 12000))

        } catch (catErr: any) {
          allErrors.push(`[${category.name}] ${city}: ${catErr.message}`)
        }
      }

      if (cities.indexOf(city) < cities.length - 1) {
        console.log('\nPausing 30s between cities…')
        await new Promise(r => setTimeout(r, 30000))
      }
    }

    return NextResponse.json({
      success:   true,
      inserted:  allInserted.length,
      errors:    allErrors.length,
      scans:     totalScanned,
      locations: allInserted,
      errorList: allErrors,
    })

  } catch (err: any) {
    console.error('Scanner error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── Claude API call with web search ──────────────────────────────────────────

async function scanCityCategory(city: string, categoryPrompt: string): Promise<ScannedLocation[]> {
  const prompt = `You are an expert photography location scout with deep knowledge of ${city}.

${categoryPrompt}

For each location, use web search to find and return ALL of these fields:
- name: exact specific name (under 150 chars)
- city: city name
- state: 2-letter state abbreviation (e.g. "MO")
- latitude: number
- longitude: number
- description: vivid 2-3 sentence description of what makes it photogenic
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
- quality_score: integer 0-100
- rating: one decimal 0.0-5.0

RULES:
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
      model:      'claude-sonnet-4-6',
      max_tokens: 6000,
      tools:      [{ type: 'web_search_20250305', name: 'web_search' }],
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
      Math.abs(loc.longitude) <= 180
    )
  } catch {
    return []
  }
}