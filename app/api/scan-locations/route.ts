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
  quality_score: number
  rating: number
}

// ── Category passes — each one finds a different type of location ─────────────
const SCAN_CATEGORIES = [
  {
    name: 'Parks & Nature',
    prompt: (city: string) => `Find 20 real photoshoot locations in ${city} that are parks, nature areas, trails, gardens, botanical gardens, arboretums, nature preserves, greenways, or outdoor green spaces. Include city parks, county parks, state parks nearby, riverside parks, lake parks, woodland areas, and hiking trails. Be very specific — name the exact park section, trail name, or garden area, not just the park name.`,
  },
  {
    name: 'Urban & Architecture',
    prompt: (city: string) => `Find 20 real photoshoot locations in ${city} that feature interesting urban architecture, murals, street art, alleys, bridges, rooftops, parking garages with views, downtown streetscapes, neon signs, brick walls, colorful buildings, or industrial areas. Include specific intersections, named murals, specific bridges, and named buildings or districts.`,
  },
  {
    name: 'Historic & Cultural',
    prompt: (city: string) => `Find 20 real photoshoot locations in ${city} that are historically significant or culturally interesting — historic districts, old churches, cemeteries, monuments, memorials, museums with interesting exteriors, old train stations, courthouses, libraries, university campuses, or culturally significant neighborhoods. Be specific about exact locations.`,
  },
  {
    name: 'Waterfront & Water Features',
    prompt: (city: string) => `Find 20 real photoshoot locations in ${city} near water — rivers, lakes, ponds, creeks, waterfalls, fountains, reservoirs, marinas, docks, riverfronts, lakefronts, or flood plains. Include specific named bodies of water, named waterfalls, named fountains in parks or plazas, and waterfront districts.`,
  },
  {
    name: 'Fields, Meadows & Open Spaces',
    prompt: (city: string) => `Find 20 real photoshoot locations in or near ${city} that are open fields, meadows, prairies, farmland, sunflower fields, lavender fields, wildflower areas, open hillsides, golf courses open to photographers, or wide-open spaces with big sky views. Include specific named fields, farms that allow photography, and open recreation areas.`,
  },
  {
    name: 'Private Venues & Hidden Gems',
    prompt: (city: string) => `Find 20 real photoshoot locations in ${city} that are private venues, event spaces, or hidden gems — barns, ranches, vineyards, breweries with interesting interiors or exteriors, coffee shops with good light, boutique hotels with rooftops or lobbies open to photographers, old warehouses repurposed as studios, or unique private properties known among local photographers. Include contact info or booking notes where known.`,
  },
  {
    name: 'Golden Hour & Sunrise Spots',
    prompt: (city: string) => `Find 20 real photoshoot locations in or near ${city} that are especially well known among photographers for golden hour, sunrise, or sunset photography — hilltops, overlooks, open fields facing west, rooftops, lakefronts, riverbanks, or any spot with unobstructed western or eastern horizon views. Include specific named overlooks, named hills, and viewing areas.`,
  },
  {
    name: 'Neighborhoods & Street Life',
    prompt: (city: string) => `Find 20 real photoshoot locations in ${city} that are interesting residential neighborhoods, colorful streets, charming commercial districts, farmers markets, weekend markets, or areas with character — think tree-lined streets, painted Victorian homes, bungalow districts, arts districts, bohemian neighborhoods, or any area with a distinctive visual personality. Be specific about street names and neighborhood names.`,
  },
]

export async function POST(request: Request) {
  try {
    const supabase = getServiceClient()
    const body     = await request.json().catch(() => ({}))

    const cities: string[] = body.cities ?? []
    const userId: string   = body.userId ?? ''
    const categories: string[] = body.categories ?? SCAN_CATEGORIES.map(c => c.name)

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (cities.length === 0) {
      return NextResponse.json({ error: 'No cities provided' }, { status: 400 })
    }

    const allInserted: string[] = []
    const allErrors:   string[] = []
    let   totalScanned = 0

    const selectedCategories = SCAN_CATEGORIES.filter(c => categories.includes(c.name))

    for (const city of cities) {
      for (const category of selectedCategories) {
        try {
          console.log(`Scanning [${category.name}] in ${city}…`)
          totalScanned++

          const locations = await scanCityCategory(city, category.prompt(city))

          for (const loc of locations) {
            // Skip if name+city already exists
            const { data: existing } = await supabase
              .from('locations')
              .select('id')
              .ilike('name', loc.name)
              .ilike('city', loc.city)
              .maybeSingle()

            if (existing) {
              allErrors.push(`Duplicate: ${loc.name}`)
              continue
            }

            const { error: insertErr } = await supabase
              .from('locations')
              .insert({
                name:            loc.name,
                city:            loc.city,
                state:           loc.state,
                latitude:        loc.latitude,
                longitude:       loc.longitude,
                description:     loc.description,
                access_type:     loc.access_type,
                category:        loc.category || category.name,
                tags:            loc.tags,
                best_time:       loc.best_time,
                parking_info:    loc.parking_info,
                permit_required: loc.permit_required,
                permit_notes:    loc.permit_notes || null,
                quality_score:   loc.quality_score,
                rating:          loc.rating,
                status:          'published',
                source:          'ai_scanner',
                added_by:        userId,
              })

            if (insertErr) {
              allErrors.push(`Error: ${loc.name} — ${insertErr.message}`)
            } else {
              allInserted.push(`${loc.name} (${category.name})`)
            }
          }

          // Polite delay between API calls
          await new Promise(r => setTimeout(r, 600))

        } catch (catErr: any) {
          allErrors.push(`[${category.name}] ${city}: ${catErr.message}`)
        }
      }
    }

    return NextResponse.json({
      success:    true,
      inserted:   allInserted.length,
      errors:     allErrors.length,
      scans:      totalScanned,
      locations:  allInserted,
      errorList:  allErrors,
    })

  } catch (err: any) {
    console.error('Scanner error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

async function scanCityCategory(city: string, categoryPrompt: string): Promise<ScannedLocation[]> {
  const prompt = `You are an expert photography location scout with deep knowledge of ${city}.

${categoryPrompt}

For each location return:
- Exact specific name (not vague — "Loose Park Rose Garden" not "a park")
- The city it is in (may be a suburb or nearby town)
- State abbreviation
- Precise GPS coordinates (latitude/longitude)
- A vivid 2-3 sentence description of what makes it photogenic
- Access type: "public" or "private"
- Category
- Tags (choose relevant ones from: Golden Hour, Sunrise, Sunset, Forest, Urban, Waterfront, Rooftop, Historic, Architecture, Nature, Meadow, Creek, Industrial, Rustic, Romantic, Dramatic, Colorful, Editorial, Wedding, Family, Portrait, Fashion, Boho, Minimal, Gardens, Cemetery, Bridge, Mural, Alley, Barn, Ranch, Vineyard, Campus)
- Best time of day for photography
- Parking information
- Whether a commercial photography permit is required (true/false)
- Any permit notes
- quality_score: 0-100 (how photogenic and accessible)
- rating: 0.0-5.0 (community photographer rating)

IMPORTANT: Only include real, verified locations that actually exist. Do not invent locations. Use web search to verify locations exist. Include as many as you can find — aim for the full 20.

Respond ONLY with a raw JSON array. No markdown, no backticks, no explanation. Just the array:

[{"name":"...","city":"...","state":"MO","latitude":39.0,"longitude":-94.0,"description":"...","access_type":"public","category":"Park","tags":["Golden Hour"],"best_time":"...","parking_info":"...","permit_required":false,"permit_notes":null,"quality_score":80,"rating":4.5}]`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 8000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Claude API ${response.status}: ${errText.slice(0, 200)}`)
  }

  const data = await response.json()

  const textContent = data.content
    ?.filter((b: any) => b.type === 'text')
    ?.map((b: any) => b.text)
    ?.join('') ?? ''

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