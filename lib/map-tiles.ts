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

// ── MapLibre GL JS (WebGL) style ────────────────────────────────────
//
// WebGL rendering path used by ExploreMap / ClientMap / HomeMap.
// Returns either a URL string (Stadia's hosted vector-tile style
// JSON) OR a minimal inline style object that wraps raster OSM
// tiles as a keyless fallback. Both plug straight into
// `new maplibregl.Map({ style: ... })`.
//
// Why both shapes: Stadia publishes MapLibre-compatible vector
// styles under the same NEXT_PUBLIC_STADIA_API_KEY the raster
// path already uses, which is the fast/pretty path. Without a
// key we fall back to a minimal raster-tile style so the map
// still renders (raster on MapLibre isn't as smooth as vector,
// but it's leagues better than a blank canvas).
type StyleSpec = string | {
  version: 8
  sources: Record<string, any>
  layers: any[]
  glyphs?: string
}

export function getVectorStyle(variant: MapVariant = 'light'): StyleSpec {
  const key = process.env.NEXT_PUBLIC_STADIA_API_KEY
  if (key) {
    const style = variant === 'dark' ? 'alidade_smooth_dark' : 'alidade_smooth'
    return `https://tiles.stadiamaps.com/styles/${style}.json?api_key=${key}`
  }
  // Keyless fallback — MapLibre-compatible inline style pointing
  // at OSM raster tiles. Guaranteed to render because it needs
  // no external style JSON; the tile URL is the only network
  // dependency, same as the Leaflet path was.
  // glyphs endpoint is required for any text-layer symbols to
  // render — MapLibre's public font server ships Noto Sans and
  // Open Sans for free.
  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: OSM_ATTRIBUTION,
      },
    },
    layers: [
      {
        id: 'osm',
        type: 'raster',
        source: 'osm',
        // Dark variant fakes a dark map via a raster-color filter
        // (invert + hue-rotate) — matches the Leaflet fallback we
        // used for HomeMap's hero.
        ...(variant === 'dark' ? {
          paint: {
            'raster-brightness-min': 0.15,
            'raster-brightness-max': 0.55,
            'raster-saturation': -0.35,
            'raster-contrast': 0.1,
          },
        } : {}),
      },
    ],
  }
}
