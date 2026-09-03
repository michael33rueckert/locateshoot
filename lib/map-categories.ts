// Category → { icon, background color } lookup used by the Explore
// map + location guide (ClientMap) at close zoom to render Google-
// Maps-style rich pin icons instead of plain colored dots. Kept out
// of ExploreMap.tsx so the admin's dropdown, ClientMap, and any
// downstream UI can share the same source of truth.
//
// The DB has two shapes:
//   1. Explicit `category` column, typically one of the SCAN_CATEGORIES
//      names ("Parks & Nature", "Urban & Architecture", ...) or one of
//      the short AI-output forms ("Park", "Downtown", "Historic", ...).
//   2. `category IS NULL` — most seeded locations. We fall back to
//      scanning the `tags` array for keywords and matching to the
//      closest category. Without this fallback the vast majority of
//      pins would render as the default 📍.
//
// It's fine that several categories share the same emoji (e.g. Parks
// & Nature and Fields & Meadows both use 🌳-family visuals). Losing
// per-category precision at 30px is a smaller cost than losing the
// icon entirely.

export interface CategoryVisual {
  emoji: string
  color: string   // background circle color
}

const PARKS_NATURE:      CategoryVisual = { emoji: '🌳', color: '#4a6741' }
const URBAN_ARCH:        CategoryVisual = { emoji: '🏙', color: '#5c7796' }
const HISTORIC_CULTURAL: CategoryVisual = { emoji: '🏛', color: '#8b6d3d' }
const WATERFRONT:        CategoryVisual = { emoji: '🌊', color: '#5c8ba8' }
const FIELDS_MEADOWS:    CategoryVisual = { emoji: '🌾', color: '#a8955c' }
const PRIVATE_HIDDEN:    CategoryVisual = { emoji: '✨', color: '#7d5c8b' }
const GOLDEN_HOUR:       CategoryVisual = { emoji: '🌅', color: '#c4922a' }
const NEIGHBORHOOD:      CategoryVisual = { emoji: '🏘', color: '#5c5c8b' }
const DEFAULT_VISUAL:    CategoryVisual = { emoji: '📍', color: '#4a6741' }

// Explicit category values → visual. Covers both the sanctioned
// SCAN_CATEGORIES names and the short AI-output forms that end up
// on `locations.category` when the scanner didn't overwrite the
// AI's per-entry value. Keys are lowercased on lookup so the map
// stays case-tolerant.
const CATEGORY_VISUAL: Record<string, CategoryVisual> = {
  // Sanctioned scanner categories
  'parks & nature':                PARKS_NATURE,
  'urban & architecture':          URBAN_ARCH,
  'historic & cultural':           HISTORIC_CULTURAL,
  'waterfront & water features':   WATERFRONT,
  'fields, meadows & open spaces': FIELDS_MEADOWS,
  'private venues & hidden gems':  PRIVATE_HIDDEN,
  'golden hour & sunrise spots':   GOLDEN_HOUR,
  'neighborhoods & street life':   NEIGHBORHOOD,
  // Short forms the AI likes to emit
  'park':          PARKS_NATURE,
  'nature':        PARKS_NATURE,
  'garden':        PARKS_NATURE,
  'trail':         PARKS_NATURE,
  'forest':        PARKS_NATURE,
  'outdoor':       PARKS_NATURE,
  'urban':         URBAN_ARCH,
  'architecture':  URBAN_ARCH,
  'downtown':      URBAN_ARCH,
  'city':          URBAN_ARCH,
  'building':      URBAN_ARCH,
  'bridge':        URBAN_ARCH,
  'rooftop':       URBAN_ARCH,
  'mural':         URBAN_ARCH,
  'street art':    URBAN_ARCH,
  'historic':      HISTORIC_CULTURAL,
  'historical':    HISTORIC_CULTURAL,
  'cultural':      HISTORIC_CULTURAL,
  'monument':      HISTORIC_CULTURAL,
  'memorial':      HISTORIC_CULTURAL,
  'museum':        HISTORIC_CULTURAL,
  'church':        HISTORIC_CULTURAL,
  'campus':        HISTORIC_CULTURAL,
  'waterfront':    WATERFRONT,
  'water':         WATERFRONT,
  'lake':          WATERFRONT,
  'river':         WATERFRONT,
  'ocean':         WATERFRONT,
  'beach':         WATERFRONT,
  'coast':         WATERFRONT,
  'coastal':       WATERFRONT,
  'waterfall':     WATERFRONT,
  'fountain':      WATERFRONT,
  'field':         FIELDS_MEADOWS,
  'fields':        FIELDS_MEADOWS,
  'meadow':        FIELDS_MEADOWS,
  'meadows':       FIELDS_MEADOWS,
  'prairie':       FIELDS_MEADOWS,
  'farm':          FIELDS_MEADOWS,
  'sunflower':     FIELDS_MEADOWS,
  'wildflowers':   FIELDS_MEADOWS,
  'private':       PRIVATE_HIDDEN,
  'private venue': PRIVATE_HIDDEN,
  'hidden gem':    PRIVATE_HIDDEN,
  'barn':          PRIVATE_HIDDEN,
  'vineyard':      PRIVATE_HIDDEN,
  'estate':        PRIVATE_HIDDEN,
  'mansion':       PRIVATE_HIDDEN,
  'golden hour':   GOLDEN_HOUR,
  'sunrise':       GOLDEN_HOUR,
  'sunset':        GOLDEN_HOUR,
  'overlook':      GOLDEN_HOUR,
  'hilltop':       GOLDEN_HOUR,
  'neighborhood':  NEIGHBORHOOD,
  'neighborhoods': NEIGHBORHOOD,
  'street':        NEIGHBORHOOD,
  'district':      NEIGHBORHOOD,
}

// Tag keyword → category visual. Scanned in order — first hit wins,
// so more-specific tags (Waterfall) come before more-generic
// container words (Outdoor). Case-insensitive substring match on
// each tag string. This is the fallback path when the location has
// no explicit category (most of the seeded rows).
const TAG_MATCHERS: [RegExp, CategoryVisual][] = [
  [/waterfall|riverwalk|marina|dock|pier|boardwalk|lagoon|marsh|wetland/i, WATERFRONT],
  [/beach|coast|coastal|cliff|ocean|bay|lighthouse|tropical/i,              WATERFRONT],
  [/river|lake|pond|creek|water|reservoir|fountain/i,                       WATERFRONT],
  [/sunrise|sunset|golden hour|hilltop|overlook|skyline|hilltop|geothermal/i, GOLDEN_HOUR],
  [/field|meadow|prairie|sunflower|wildflower|farm|farmland|rural/i,        FIELDS_MEADOWS],
  [/barn|vineyard|estate|mansion|resort|private|hidden|indoor|wedding/i,    PRIVATE_HIDDEN],
  [/historic|monument|memorial|museum|mission|religious|cultural|campus|government|adobe|ruins|vintage|carousel|sculpture/i, HISTORIC_CULTURAL],
  [/urban|architecture|downtown|city|skyline|rooftop|brutalist|modernist|industrial|neon|mural|art\b|colorful|plaza|street art/i, URBAN_ARCH],
  [/bridge|tunnel|walkway|pedestrian|cobblestone/i,                         URBAN_ARCH],
  [/neighborhood|district|street\b|residential|quaint|quirky|cinematic/i,   NEIGHBORHOOD],
  [/park|trail|forest|garden|floral|arboretum|nature|trees|hike|wildlife|greenway|prairie|canyon|mountain|desert|geology|cliffs|dramatic|outdoor|iconic|scenic/i, PARKS_NATURE],
]

// Private-access spots override the category color so at-a-glance
// the access restriction is obvious (matches the rust color the
// DetailPanel already uses for the "🔒 Private" badge).
const PRIVATE_ACCESS_COLOR = '#b54b2a'

export function getCategoryVisual(
  category: string | null | undefined,
  access: string | null | undefined,
  tags?: string[] | null,
): CategoryVisual {
  let base: CategoryVisual | null = null

  if (category) {
    const key = category.trim().toLowerCase()
    base = CATEGORY_VISUAL[key] ?? null
    // Some AI-output categories arrive as "Historic District", "City Park",
    // "Riverfront Park", etc. — multi-word phrases that don't hit the map
    // directly but whose leading/trailing word usually does. Fall back to
    // scanning each word.
    if (!base) {
      for (const word of key.split(/[\s,&/-]+/).filter(Boolean)) {
        if (CATEGORY_VISUAL[word]) { base = CATEGORY_VISUAL[word]; break }
      }
    }
  }

  // No category match — try tag-based inference before defaulting.
  if (!base && Array.isArray(tags) && tags.length > 0) {
    for (const [pattern, visual] of TAG_MATCHERS) {
      if (tags.some(t => typeof t === 'string' && pattern.test(t))) {
        base = visual
        break
      }
    }
  }

  if (!base) base = DEFAULT_VISUAL
  if (access === 'private') return { ...base, color: PRIVATE_ACCESS_COLOR }
  return base
}
