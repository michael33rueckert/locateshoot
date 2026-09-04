// Single source of truth for the Leaflet tile URLs used across the
// app (ExploreMap, HomeMap, ClientMap, ShareMap, MapCoordPicker).
//
// Stadia Alidade Smooth (light + dark) is the primary provider —
// clean, muted, Google-Maps-adjacent look. NEXT_PUBLIC_STADIA_API_KEY
// is required in production; get one at stadiamaps.com (free tier is
// 200k tiles/mo). When the key is missing we fall back to OpenStreetMap
// standard tiles so nothing breaks during setup, at the cost of a
// busier look.
//
// Attribution string is baked in per style. Callers pass it straight
// to L.tileLayer's `attribution` option so the required credit chip
// shows in the bottom corner of every map.

interface TileConfig {
  url:         string
  attribution: string
  maxZoom:     number
}

export type MapVariant = 'light' | 'dark'

const STADIA_ATTRIBUTION =
  '© <a href="https://stadiamaps.com/">Stadia Maps</a> © <a href="https://openmaptiles.org/">OpenMapTiles</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>'
const OSM_ATTRIBUTION = '© OpenStreetMap contributors'

export function getTileConfig(variant: MapVariant = 'light'): TileConfig {
  const key = process.env.NEXT_PUBLIC_STADIA_API_KEY
  if (key) {
    // Stadia Alidade Smooth — closest free-tier basemap to Google Maps'
    // default look. Dark variant is a matched design pair.
    const style = variant === 'dark' ? 'alidade_smooth_dark' : 'alidade_smooth'
    return {
      url:         `https://tiles.stadiamaps.com/tiles/${style}/{z}/{x}/{y}{r}.png?api_key=${key}`,
      attribution: STADIA_ATTRIBUTION,
      maxZoom:     20,
    }
  }
  // Fallback — OSM standard. Dark variant doesn't exist here, so
  // callers that want dark still get light tiles + can apply a CSS
  // filter (see HomeMap / ClientMap for the pattern).
  return {
    url:         'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: OSM_ATTRIBUTION,
    maxZoom:     19,
  }
}

// Whether the caller should apply a CSS `filter: invert(1) …` on the
// tile pane to fake a dark map. True only when we're on the OSM
// fallback and the caller asked for dark — Stadia has a real dark
// style so it doesn't need the hack.
export function needsDarkFilter(variant: MapVariant): boolean {
  return variant === 'dark' && !process.env.NEXT_PUBLIC_STADIA_API_KEY
}

// ── MapLibre GL JS (WebGL) vector style ─────────────────────────────
//
// Vector tiles + WebGL rendering = the 60fps map perf story. Stadia
// publishes MapLibre-compatible style JSONs for the same Alidade
// Smooth palette we use on the raster path, so switching between the
// two is invisible to the user visually but night-and-day for zoom
// and pan smoothness. Uses the same NEXT_PUBLIC_STADIA_API_KEY.
//
// When no key is set we fall back to a MapLibre demo style (OSM
// vector tiles from OpenFreeMap or MapLibre's demo tiles) so local
// dev doesn't require a Stadia account. In production the key is
// required — the demo tiles rate-limit aggressively.
//
// Returns the full style URL; callers pass it straight to
// `new maplibregl.Map({ style: ... })`.
export function getVectorStyle(variant: MapVariant = 'light'): string {
  const key = process.env.NEXT_PUBLIC_STADIA_API_KEY
  if (key) {
    const style = variant === 'dark' ? 'alidade_smooth_dark' : 'alidade_smooth'
    return `https://tiles.stadiamaps.com/styles/${style}.json?api_key=${key}`
  }
  // Keyless dev fallback — OpenFreeMap Positron is a free MapLibre
  // vector style with no signup. Not intended for production use.
  return variant === 'dark'
    ? 'https://tiles.openfreemap.org/styles/dark'
    : 'https://tiles.openfreemap.org/styles/positron'
}
