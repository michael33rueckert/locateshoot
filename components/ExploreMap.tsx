'use client'

import { useEffect, useRef, useState } from 'react'
import { Map as MLMap, NavigationControl, AttributionControl, setWorkerUrl } from 'maplibre-gl'
import type { GeoJSONSource, MapMouseEvent, MapGeoJSONFeature, StyleSpecification } from 'maplibre-gl'

// Point MapLibre's tile-processing worker at a self-hosted
// copy in /public. Turbopack (Next.js dev bundler) can't serve
// maplibre-gl's own worker via the default new-URL-relative
// path — it returns HTML, breaking module-worker loading. The
// worker file and its shared dep are copied to public/ so the
// browser fetches them with a proper text/javascript MIME.
// See scripts/copy-maplibre-worker.mjs for the copy step.
if (typeof window !== 'undefined') {
  try { setWorkerUrl('/maplibre-gl-worker.mjs') } catch { /* older maplibre — no-op */ }
}
import { getVectorStyle } from '@/lib/map-tiles'
import { getCategoryVisual } from '@/lib/map-categories'
import { makeCategoryIcon, makePillImage, makeLabelBadgeImage } from '@/lib/map-images'

// ── ExploreMap (WebGL, MapLibre GL JS) ──────────────────────────────
//
// Rewritten off Leaflet because the raster-tile + DOM-marker path
// was fundamentally rate-limited by the main thread — ~700 canvas
// markers reproject on every zoomend and every DivIcon overlay
// composites per frame. MapLibre pushes all of that to the GPU:
// the tile pane is a WebGL canvas of vector tiles, and markers are
// a GeoJSON source rendered by native circle/symbol layers. Pinch,
// wheel, and pan sit at ~60fps on midrange mobile.
//
// Public surface (props, exported ExploreLocation interface, and
// callback contract) is byte-identical to the previous Leaflet
// version so nothing in explore/page.tsx needs to change.

export interface ExploreLocation {
  id: number
  name: string
  city: string
  lat: number
  lng: number
  access: string
  rating: string
  bg: string
  tags: string[]
  saves: number
  category?: string | null
  // Per-location label rendering — admin picks in LocationEditModal:
  //   'dot'       → circle only, no permanent label
  //   'name'      → circle + text label appears at zoom >= 13
  //   'featured'  → circle + text label appears at zoom >= 11 (larger + gold)
  //   'portfolio' → same shape as 'featured' but with a gold ring +
  //                 badge marking it as one of THIS user's own spots
  mapDisplayMode?: 'dot' | 'name' | 'featured' | 'portfolio'
}

interface ExploreMapProps {
  locations: ExploreLocation[]
  activeId: number | null
  userLocation: { lat: number; lng: number } | null
  homeLocation: { lat: number; lng: number } | null
  photoMap?: Record<string, string>
  onMarkerClick: (id: number) => void
  onMapMove?: (center: { lat: number; lng: number }, zoom: number) => void
}

// USA-wide framing when no home city is saved. Center of the
// contiguous 48, zoomed out enough to show Maine → LA at common
// widths. MapLibre uses [lng, lat] order (opposite of Leaflet).
const USA_VIEW = { center: [-98.5, 39.5] as [number, number], zoom: 4 }
const HOME_CITY_ZOOM = 11

// Zoom thresholds for the per-mode label / icon reveal.
//   * NAME     — text-only pill starts showing at this zoom
//   * FEATURED — featured + portfolio pill/badge starts showing
//   * ICONS    — category emoji icon replaces the plain dot
// All three dropped from their Leaflet-era values so pins pick
// up their rich visuals much sooner as the user zooms in
// (previously you had to be nearly at street level to see them).
const ZOOM_THRESHOLD_NAME     = 12
const ZOOM_THRESHOLD_FEATURED = 9
const ZOOM_THRESHOLD_ICONS    = 10

// GeoJSON source id + layer ids — module-level constants so
// helpers and effects reference the same strings without typos.
const SRC_POINTS      = 'locations'
const SRC_USER        = 'user-location'
const SRC_HOME        = 'home-location'
const SRC_SATELLITE   = 'satellite'
const LAYER_POINTS        = 'unclustered-point'
const LAYER_ICONS         = 'point-icons'
const LAYER_LABELS        = 'point-labels'
const LAYER_LABEL_BADGES  = 'point-label-badges'
const LAYER_HOVER_LABELS  = 'point-hover-labels'
const LAYER_USER_DOT      = 'user-dot'
const LAYER_HOME_DOT      = 'home-dot'
const LAYER_SATELLITE     = 'satellite'

function isFiniteLatLng(lat: any, lng: any): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng)
}

// Turn ExploreLocation[] into a MapLibre-ready FeatureCollection.
// Skips rows with non-numeric coords (RLS + partial-migration
// leftovers occasionally have nulls). Every feature exposes the
// same `id` shape that onMarkerClick expects.
function locationsToGeoJSON(locations: ExploreLocation[], photoMap: Record<string, string>): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const loc of locations) {
    if (!isFiniteLatLng(loc.lat, loc.lng)) continue
    const visual = getCategoryVisual(loc.category, loc.access, loc.tags)
    const mode = loc.mapDisplayMode ?? 'dot'
    const thumb = photoMap[String(loc.id)]
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [loc.lng, loc.lat] },
      properties: {
        id: loc.id,
        name: loc.name,
        city: loc.city,
        access: loc.access,
        mode,
        color: visual.color,
        emoji: visual.emoji,
        // Encode the emoji by codepoint (base-10) rather than
        // as a raw character — some emoji (especially those
        // with variation selectors like 🏙︎) can normalize
        // differently between the property setter and the
        // styleimagemissing consumer, breaking the id lookup.
        // Numeric codepoints are stable across both.
        iconKey: `cat-${visual.color.slice(1).toLowerCase()}-${visual.emoji.codePointAt(0) ?? 0}`,
        hasPhoto: !!thumb,
        // Set on every featured / portfolio pin regardless of
        // whether a thumb has loaded yet. The badge composite
        // falls back to a colored emoji circle if no thumb is
        // available, so all pins in these modes look uniform.
        ...((mode === 'featured' || mode === 'portfolio')
          ? { labelImageId: `label-${loc.id}` }
          : {}),
      },
    })
  }
  return { type: 'FeatureCollection', features }
}

export default function ExploreMap({
  locations,
  activeId,
  userLocation,
  homeLocation,
  photoMap,
  onMarkerClick,
  onMapMove,
}: ExploreMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<MLMap | null>(null)
  // Basemap toggle — streets (vector tiles) vs satellite
  // (Esri raster overlay). Rendered as the two-state pill in
  // the top-right of the map. Layer visibility swap only —
  // vector base + pin overlays stay attached across toggles.
  const [viewMode, setViewMode] = useState<'streets' | 'satellite'>('streets')
  const isReadyRef   = useRef(false)
  const homeAppliedRef = useRef(false)

  // Callbacks + latest photoMap kept in refs so the init effect
  // never depends on them — moving the map or streaming in photos
  // must not tear down and re-init the WebGL context.
  const onMarkerClickRef = useRef(onMarkerClick)
  const onMapMoveRef     = useRef(onMapMove)
  const photoMapRef      = useRef<Record<string, string>>(photoMap ?? {})
  useEffect(() => { onMarkerClickRef.current = onMarkerClick }, [onMarkerClick])
  useEffect(() => { onMapMoveRef.current = onMapMove }, [onMapMove])
  useEffect(() => { photoMapRef.current = photoMap ?? {} }, [photoMap])

  // ── Init ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    if (mapRef.current) return

    const initial = homeLocation && isFiniteLatLng(homeLocation.lat, homeLocation.lng)
      ? { center: [homeLocation.lng, homeLocation.lat] as [number, number], zoom: HOME_CITY_ZOOM }
      : USA_VIEW
    if (homeLocation) homeAppliedRef.current = true

    // Debug: log container size + style spec at init time. Helps
    // pinpoint whether the map is failing to init or just rendering
    // to a 0×0 container.
    const rect = containerRef.current.getBoundingClientRect()
    // eslint-disable-next-line no-console
    console.log('[ExploreMap] init — container size:', rect.width, '×', rect.height)

    const map = new MLMap({
      container: containerRef.current,
      style: getVectorStyle('light'),
      center: initial.center,
      zoom: initial.zoom,
      // Turn OFF the default attribution — we add a compact
      // one manually below so it's just a small "i" bubble
      // instead of the full attribution text sprawl.
      attributionControl: false,
    })
    mapRef.current = map

    // Compact attribution ("i" bubble) in the bottom-left. Small
    // enough to sit alongside the Help + Feedback launchers
    // without covering any map controls.
    map.addControl(new AttributionControl({ compact: true }), 'bottom-left')

    // Faster wheel / trackpad zoom. Defaults are 1/450 and
    // 1/100 which feel sluggish — bumped 3-4× so a normal
    // scroll gesture covers a few zoom levels quickly. Pinch
    // zoom on touch is controlled by finger movement so it
    // doesn't need explicit tuning here.
    map.scrollZoom.setWheelZoomRate(1 / 120)
    map.scrollZoom.setZoomRate(1 / 40)

    // Zoom control (bottom-right, pushed up via CSS so it clears
    // the Help + Feedback launchers). showCompass:true is the
    // north-reset button — MapLibre renders a small circular
    // control that rotates to match the current bearing; tapping
    // it eases back to north (same UX as Google Maps).
    map.addControl(new NavigationControl({ showCompass: true, visualizePitch: false }), 'bottom-right')

    // Catch style + tile errors so silent init failures show up in
    // the console instead of just rendering blank.
    map.on('error', (e: any) => {
      // eslint-disable-next-line no-console
      console.error('[ExploreMap] MapLibre error:', e?.error?.message ?? e)
    })
    map.on('load', () => {
      // eslint-disable-next-line no-console
      console.log('[ExploreMap] style loaded')
    })
    map.on('styledata', () => {
      // eslint-disable-next-line no-console
      console.log('[ExploreMap] styledata event')
    })

    // moveend is Leaflet-nostalgic naming — MapLibre calls the
    // same event 'moveend'. Fires once per gesture end (debounced
    // by MapLibre internally), so this is safe to bind directly.
    map.on('moveend', () => {
      const cb = onMapMoveRef.current
      if (!cb) return
      const c = map.getCenter()
      cb({ lat: c.lat, lng: c.lng }, map.getZoom())
    })

    // ── Pinch / wheel zoom momentum (Google Maps-style fling) ─
    // MapLibre's built-in touchZoom + scrollZoom both snap to
    // the target zoom the moment input stops. We sample zoom
    // levels during any active gesture (touch pinch OR wheel /
    // trackpad pinch — both fire the 'zoom' event) and, on
    // gesture end, fire ONE easeTo toward the extrapolated
    // target so the zoom "keeps going" briefly before
    // decelerating. Same pattern as native Google Maps on both
    // desktop trackpad and phone pinch.
    const containerEl = containerRef.current
    const zoomSamples: { t: number; z: number }[] = []
    const VELOCITY_WINDOW_MS = 120
    let touchActive = false
    let wheelEndTimer: ReturnType<typeof setTimeout> | null = null
    const applyMomentum = () => {
      if (zoomSamples.length < 2) { zoomSamples.length = 0; return }
      const first = zoomSamples[0]
      const last  = zoomSamples[zoomSamples.length - 1]
      const dt    = (last.t - first.t) / 1000
      zoomSamples.length = 0
      if (dt <= 0) return
      const velocity = (last.z - first.z) / dt      // zoom levels / sec
      if (Math.abs(velocity) < 1.5) return          // ignore slow gestures
      // Extrapolate the fling. Clamped so it never adds more
      // than ~0.8 zoom levels — subtle, not a big jump.
      const delta      = Math.max(-0.8, Math.min(0.8, velocity * 0.22))
      const targetZoom = Math.max(2, Math.min(20, map.getZoom() + delta))
      // 380ms with MapLibre's default ease — interpolation
      // runs on the GPU, no per-frame JS.
      map.easeTo({ zoom: targetZoom, duration: 380 })
    }
    map.on('zoom', () => {
      // Sample only while the user is actively gesturing —
      // programmatic easeTo calls also fire 'zoom' but we
      // don't want their frames counted toward user velocity.
      if (!touchActive && wheelEndTimer === null) return
      const now = performance.now()
      zoomSamples.push({ t: now, z: map.getZoom() })
      while (zoomSamples.length > 0 && now - zoomSamples[0].t > VELOCITY_WINDOW_MS) {
        zoomSamples.shift()
      }
    })
    // Touch pinch (mobile / tablet).
    const onTouchStart = () => { touchActive = true; zoomSamples.length = 0 }
    const onTouchEnd   = () => { touchActive = false; applyMomentum() }
    containerEl.addEventListener('touchstart',  onTouchStart, { passive: true })
    containerEl.addEventListener('touchend',    onTouchEnd,   { passive: true })
    containerEl.addEventListener('touchcancel', onTouchEnd,   { passive: true })
    // Wheel / trackpad pinch (desktop). Debounce a 'wheel end'
    // 90ms after the last wheel event — that's how long you
    // typically have to pause a trackpad pinch or scroll wheel
    // before it counts as "released".
    const WHEEL_END_DELAY = 90
    const onWheel = () => {
      if (wheelEndTimer !== null) { clearTimeout(wheelEndTimer); wheelEndTimer = null }
      else zoomSamples.length = 0   // first wheel event of a fresh gesture
      wheelEndTimer = setTimeout(() => {
        wheelEndTimer = null
        applyMomentum()
      }, WHEEL_END_DELAY)
    }
    containerEl.addEventListener('wheel', onWheel, { passive: true })

    map.on('load', () => {
      isReadyRef.current = true

      // ── Satellite raster overlay (hidden until toggled) ──
      // Instead of the more invasive map.setStyle() dance to
      // swap basemaps, add the satellite tiles as a raster
      // layer that sits ABOVE the vector base and BELOW all
      // the pin overlays we add next. Toggling its visibility
      // is a one-line setLayoutProperty call. When 'none' the
      // vector base shows through; when 'visible' the raster
      // covers it. Pin overlays render on top either way.
      map.addSource(SRC_SATELLITE, {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: 'Imagery © <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics',
      })
      map.addLayer({
        id: LAYER_SATELLITE,
        type: 'raster',
        source: SRC_SATELLITE,
        layout: { visibility: 'none' },
      })

      // ── Points source + clustering ────────────────────────────
      // Points source — clustering off per product decision.
      // Every pin renders individually at every zoom level
      // (small colored dot until the icon threshold, colored
      // emoji circle after) with WebGL handling the load.
      map.addSource(SRC_POINTS, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        // Promote our own `id` property to the top-level
        // feature id — required for map.setFeatureState
        // ({id: X, ...}) to hit the right feature (active-
        // marker highlight).
        promoteId: 'id',
      })

      // ── Pill background images (icon-text-fit pattern) ──
      // Registered once at load-time. The label symbol layer
      // below references them by name and MapLibre stretches
      // the flat middle of the pill to fit the text at each
      // zoom level. Corners stay perfectly round.
      const featuredPill = makePillImage('rgba(255,255,255,0.95)')
      map.addImage('pill-featured', featuredPill.data, {
        pixelRatio: featuredPill.pixelRatio,
        stretchX: featuredPill.stretchX,
        stretchY: featuredPill.stretchY,
        content: featuredPill.content,
      })
      const portfolioPill = makePillImage('rgba(255,255,255,0.95)', { color: '#c4922a', width: 2 })
      map.addImage('pill-portfolio', portfolioPill.data, {
        pixelRatio: portfolioPill.pixelRatio,
        stretchX: portfolioPill.stretchX,
        stretchY: portfolioPill.stretchY,
        content: portfolioPill.content,
      })

      // Category emoji + colored circle icons are generated on
      // demand — MapLibre fires `styleimagemissing` for any
      // icon-image the symbol layer needs but doesn't have.
      // Cheap: only the visuals actually visible get rasterised.
      // id format: cat-{6hex}-{codepoint-number}
      map.on('styleimagemissing', (e) => {
        const id = e.id
        const match = /^cat-([0-9a-f]{6})-(\d+)$/.exec(id)
        if (!match) return
        if (map.hasImage(id)) return
        const [, hex, cpStr] = match
        const emoji = String.fromCodePoint(Number(cpStr))
        // eslint-disable-next-line no-console
        console.log('[ExploreMap] generating icon', id, emoji)
        const img = makeCategoryIcon('#' + hex, emoji)
        map.addImage(id, img.data, { pixelRatio: img.pixelRatio })
      })

      // Unclustered individual points. Small colored circle
      // that gives a low-density scan at wide zoom — replaced
      // by the emoji icon layer at zoom >= ZOOM_THRESHOLD_ICONS
      // via maxzoom, so both layers never render at once.
      // Colored dots. Rendered at ALL zoom levels — the icon
      // layer above (zoom >= ICON threshold) simply covers them
      // because the icon bitmap is larger than the dot radius.
      // Kept simple: constant zoom-based interpolate (no case
      // inside the output) — mixing feature-state into a zoom
      // interpolate output was producing empty renders on some
      // MapLibre versions.
      map.addLayer({
        id: LAYER_POINTS,
        type: 'circle',
        source: SRC_POINTS,
        // Featured / portfolio pins skip the base dot — their
        // badge pill already carries the pin's visual weight,
        // and layering a small dot underneath just looks like
        // a stray artifact.
        filter: ['!', ['match', ['get', 'mode'], ['featured', 'portfolio'], true, false]],
        paint: {
          'circle-color': [
            'case',
            ['boolean', ['feature-state', 'active'], false], '#c4922a',
            ['get', 'color'],
          ],
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            4,  3,
            8,  4,
            12, 5,
          ],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      })

      // Category icons — colored circle with an emoji baked in.
      // Simple zoom-based size ramp (no feature-state inside
      // interpolate output for the same reason as above).
      // Same filter as LAYER_POINTS — featured/portfolio pins
      // only get the badge pill, not the emoji circle on top.
      map.addLayer({
        id: LAYER_ICONS,
        type: 'symbol',
        source: SRC_POINTS,
        filter: ['!', ['match', ['get', 'mode'], ['featured', 'portfolio'], true, false]],
        minzoom: ZOOM_THRESHOLD_ICONS,
        layout: {
          'icon-image': ['get', 'iconKey'],
          'icon-size': [
            'interpolate', ['linear'], ['zoom'],
            10, 0.55,
            14, 0.95,
            17, 1.1,
          ],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      })

      // Pre-composited badge for featured / portfolio pins:
      // pill + circular thumbnail (or category emoji fallback)
      // + name + optional "IN YOUR PORTFOLIO" subtitle. Baked
      // per pin by makeLabelBadgeImage below and registered
      // via map.addImage. Filter matches only pins whose id
      // has been registered — pins waiting on thumb load fall
      // through to the text-pill layer below.
      map.addLayer({
        id: LAYER_LABEL_BADGES,
        type: 'symbol',
        source: SRC_POINTS,
        filter: ['has', 'labelImageId'],
        layout: {
          'icon-image': ['get', 'labelImageId'],
          'icon-size': [
            'interpolate', ['linear'], ['zoom'],
            9,  0.42,
            12, 0.65,
            15, 0.85,
          ],
          'icon-anchor': 'bottom',
          'icon-offset': [0, -8],
          'icon-allow-overlap': false,
          // Optional so a pin still shows if the image is
          // mid-load (parent renders the underlying dot).
          'icon-optional': true,
        },
        minzoom: ZOOM_THRESHOLD_FEATURED,
      })

      // Permanent text-only label for `name`-mode pins. No
      // pill / no background — Google-Maps-style place labels
      // with a chunky white halo so the text stays legible
      // over any basemap. Featured / portfolio pins skip this
      // layer via the labelImageId filter (they have their own
      // pill badge from LAYER_LABEL_BADGES).
      map.addLayer({
        id: LAYER_LABELS,
        type: 'symbol',
        source: SRC_POINTS,
        filter: [
          'all',
          ['!', ['has', 'labelImageId']],
          ['==', ['get', 'mode'], 'name'],
        ],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold', 'Noto Sans Regular'],
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            11, 11,
            15, 12,
          ],
          'text-anchor': 'top',
          'text-offset': [0, 1.0],
          'text-max-width': 10,
          'text-allow-overlap': false,
          'text-optional': false,
        },
        paint: {
          'text-color': '#1a1612',
          'text-halo-color': 'rgba(255,255,255,0.92)',
          'text-halo-width': 2,
          'text-halo-blur': 0.3,
        },
        minzoom: ZOOM_THRESHOLD_FEATURED,
      })

      // Hover-triggered name label for dot-mode pins on desktop.
      // Text-only with a heavy halo (same visual as the
      // permanent name labels). text-opacity flips 0 → 1 via
      // feature-state.hover, so it stays 100% GPU-driven — no
      // JS runs on mousemove other than a single setFeatureState
      // per pin transition. Touch devices never fire hover so
      // this layer is naturally desktop-only.
      map.addLayer({
        id: LAYER_HOVER_LABELS,
        type: 'symbol',
        source: SRC_POINTS,
        // Any pin that isn't already showing a permanent label —
        // dot mode. name / featured / portfolio all have their
        // own labels, so hover on those is redundant.
        filter: ['==', ['get', 'mode'], 'dot'],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold', 'Noto Sans Regular'],
          'text-size': 12,
          'text-anchor': 'top',
          'text-offset': [0, 1.0],
          'text-max-width': 10,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': '#1a1612',
          'text-halo-color': 'rgba(255,255,255,0.92)',
          'text-halo-width': 2,
          'text-halo-blur': 0.3,
          'text-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false], 1,
            0,
          ],
          'text-opacity-transition': { duration: 120, delay: 0 },
        },
      })

      // Wire the hover state — set feature-state.hover on
      // whichever pin the pointer is currently over, clear it
      // when the pointer leaves.
      let hoveredPointId: string | number | null = null
      const clearHover = () => {
        if (hoveredPointId != null) {
          map.setFeatureState({ source: SRC_POINTS, id: hoveredPointId }, { hover: false })
          hoveredPointId = null
        }
      }
      map.on('mousemove', LAYER_POINTS, (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
        const feat = e.features?.[0]
        if (!feat || feat.id == null) return
        if (hoveredPointId === feat.id) return
        clearHover()
        hoveredPointId = feat.id as string | number
        map.setFeatureState({ source: SRC_POINTS, id: hoveredPointId }, { hover: true })
      })
      map.on('mouseleave', LAYER_POINTS, clearHover)

      // Click handler is bound to point + icon + label layers
      // so a tap on any shape (dot, category icon, pill) opens
      // the detail panel for that pin.
      const onPointClick = (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
        const feat = e.features?.[0]
        if (!feat) return
        const id = feat.properties?.id
        if (id != null) onMarkerClickRef.current(id)
      }
      map.on('click', LAYER_POINTS,       onPointClick)
      map.on('click', LAYER_ICONS,        onPointClick)
      map.on('click', LAYER_LABELS,       onPointClick)
      map.on('click', LAYER_LABEL_BADGES, onPointClick)

      // Cursor feedback so the pins feel interactive.
      const setPointer = () => { map.getCanvas().style.cursor = 'pointer' }
      const clearPointer = () => { map.getCanvas().style.cursor = '' }
      map.on('mouseenter', LAYER_POINTS,   setPointer)
      map.on('mouseleave', LAYER_POINTS,   clearPointer)
      map.on('mouseenter', LAYER_ICONS,    setPointer)
      map.on('mouseleave', LAYER_ICONS,    clearPointer)
      map.on('mouseenter', LAYER_LABELS,       setPointer)
      map.on('mouseleave', LAYER_LABELS,       clearPointer)
      map.on('mouseenter', LAYER_LABEL_BADGES, setPointer)
      map.on('mouseleave', LAYER_LABEL_BADGES, clearPointer)
      // ── User + home locations (separate sources so they don't
      //     participate in cluster / point layer paint expressions)
      map.addSource(SRC_USER, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: LAYER_USER_DOT,
        type: 'circle',
        source: SRC_USER,
        paint: {
          'circle-color': '#3d6e8c',
          'circle-radius': 8,
          'circle-stroke-width': 3,
          'circle-stroke-color': 'white',
        },
      })
      map.addSource(SRC_HOME, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: LAYER_HOME_DOT,
        type: 'circle',
        source: SRC_HOME,
        paint: {
          'circle-color': '#4a6741',
          'circle-radius': 5,
          'circle-stroke-width': 2,
          'circle-stroke-color': 'white',
          'circle-opacity': 0.9,
        },
      })

      // First data push — locations may already have arrived
      // before 'load' fired (the parent starts fetching on mount).
      pushLocations()
      pushUser()
      pushHome()
    })

    // Helpers hoisted so the effects below can call them without
    // recreating the map. They read from refs, not closures over
    // the effect's props.
    function pushLocations() {
      if (!isReadyRef.current) return
      const src = map.getSource(SRC_POINTS) as GeoJSONSource | undefined
      if (!src) return
      src.setData(locationsRef.current
        ? locationsToGeoJSON(locationsRef.current, photoMapRef.current)
        : { type: 'FeatureCollection', features: [] })
    }
    function pushUser() {
      if (!isReadyRef.current) return
      const src = map.getSource(SRC_USER) as GeoJSONSource | undefined
      if (!src) return
      const u = userLocationRef.current
      src.setData(u && isFiniteLatLng(u.lat, u.lng)
        ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [u.lng, u.lat] }, properties: {} }] }
        : { type: 'FeatureCollection', features: [] })
    }
    function pushHome() {
      if (!isReadyRef.current) return
      const src = map.getSource(SRC_HOME) as GeoJSONSource | undefined
      if (!src) return
      const h = homeLocationRef.current
      src.setData(h && isFiniteLatLng(h.lat, h.lng)
        ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [h.lng, h.lat] }, properties: {} }] }
        : { type: 'FeatureCollection', features: [] })
    }
    // Stash the helpers on the map instance so the update effects
    // below can call them by looking at mapRef.current.
    ;(map as any).__pushLocations = pushLocations
    ;(map as any).__pushUser      = pushUser
    ;(map as any).__pushHome      = pushHome

    return () => {
      isReadyRef.current = false
      homeAppliedRef.current = false
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Latest-value refs read by the pushX helpers in the init effect.
  // Kept separate from the callback refs above because the helpers
  // fire from BOTH 'load' AND the update effects below, so they
  // need to always see current props.
  const locationsRef    = useRef(locations)
  const userLocationRef = useRef(userLocation)
  const homeLocationRef = useRef(homeLocation)
  useEffect(() => { locationsRef.current    = locations;    (mapRef.current as any)?.__pushLocations?.() }, [locations, photoMap])
  useEffect(() => { userLocationRef.current = userLocation; (mapRef.current as any)?.__pushUser?.() },      [userLocation])

  useEffect(() => { homeLocationRef.current = homeLocation; (mapRef.current as any)?.__pushHome?.() },      [homeLocation])

  // ── Async badge-image loader ─────────────────────────────────
  // For each featured / portfolio pin, generate the composite
  // badge image (pill + thumb-or-emoji + name + optional
  // subtitle) and register it under `label-{id}`. Once
  // registered, LAYER_LABEL_BADGES picks it up on next paint.
  // Dedup keyed by pin id so we don't re-render on every
  // photoMap or locations update.
  const loadedBadgesRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReadyRef.current) return
    const pm = photoMap ?? {}
    let cancelled = false
    ;(async () => {
      for (const loc of locations) {
        const mode = loc.mapDisplayMode ?? 'dot'
        if (mode !== 'featured' && mode !== 'portfolio') continue
        const imageId = `label-${loc.id}`
        // Skip if we've already generated a badge for this pin
        // in this session. If a new photo lands later the pin
        // will just keep its emoji-fallback badge until reload
        // — acceptable trade-off for keeping this loop cheap.
        if (loadedBadgesRef.current.has(imageId)) continue
        if (map.hasImage(imageId)) { loadedBadgesRef.current.add(imageId); continue }
        loadedBadgesRef.current.add(imageId)
        const visual = getCategoryVisual(loc.category, loc.access, loc.tags)
        try {
          const badge = await makeLabelBadgeImage({
            thumbUrl: pm[String(loc.id)] || undefined,
            name:     loc.name,
            variant:  mode,
            fallback: { color: visual.color, emoji: visual.emoji },
          })
          if (cancelled) return
          if (!map.hasImage(imageId)) {
            map.addImage(imageId, badge.data, { pixelRatio: badge.pixelRatio })
          }
        } catch {
          // Fully broken — nothing more to do, pin will show
          // the underlying dot without a label.
        }
      }
    })()
    return () => { cancelled = true }
  }, [locations, photoMap])

  // ── Basemap view toggle (streets / satellite) ─────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReadyRef.current) return
    if (!map.getLayer(LAYER_SATELLITE)) return
    map.setLayoutProperty(
      LAYER_SATELLITE,
      'visibility',
      viewMode === 'satellite' ? 'visible' : 'none',
    )
  }, [viewMode])

  // ── Active marker highlight via feature-state ─────────────────
  const lastActiveIdRef = useRef<number | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReadyRef.current) return
    // Clear previous
    const prev = lastActiveIdRef.current
    if (prev != null) {
      try { map.setFeatureState({ source: SRC_POINTS, id: prev }, { active: false }) } catch { /* feature gone */ }
    }
    if (activeId != null) {
      // Note: MapLibre needs a numeric id on the feature to accept
      // setFeatureState — we provide it via `promoteId` below when
      // the source is added. Actually we set feature.id at data
      // push time — see promoteId patch below.
      try { map.setFeatureState({ source: SRC_POINTS, id: activeId }, { active: true }) } catch { /* feature not loaded yet */ }
    }
    lastActiveIdRef.current = activeId
  }, [activeId])

  // Home location arrives async from the profile query. Center on
  // it once (never again — the user could have panned away).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReadyRef.current) return
    if (homeAppliedRef.current) return
    if (!homeLocation || !isFiniteLatLng(homeLocation.lat, homeLocation.lng)) return
    map.easeTo({ center: [homeLocation.lng, homeLocation.lat], zoom: HOME_CITY_ZOOM, duration: 400 })
    homeAppliedRef.current = true
  }, [homeLocation])

  // Fly to the user's current location when it becomes known
  // (via Search or Near-me). Uses easeTo (WebGL, GPU compositor)
  // so this is buttery smooth even on mobile.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReadyRef.current) return
    if (!userLocation || !isFiniteLatLng(userLocation.lat, userLocation.lng)) return
    map.easeTo({ center: [userLocation.lng, userLocation.lat], zoom: 13, duration: 450 })
  }, [userLocation])

  // Fly to the active marker on activeId change (sidebar card
  // click / marker click). Skip on repeats.
  const lastActiveFlyRef = useRef<number | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReadyRef.current) return
    if (activeId === lastActiveFlyRef.current) return
    lastActiveFlyRef.current = activeId ?? null
    if (activeId == null) return
    const loc = locations.find(l => l.id === activeId)
    if (!loc || !isFiniteLatLng(loc.lat, loc.lng)) return
    map.easeTo({ center: [loc.lng, loc.lat], zoom: Math.max(map.getZoom(), 14), duration: 400 })
  }, [activeId, locations])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {/* Streets / Satellite basemap toggle. Bottom-right of
          the map, above Help+Feedback launchers and below the
          zoom+compass control (which the CSS in explore/page
          pushes up to bottom:164). Compact 40×40 button with
          a tiny label — Google Maps also keeps this small so
          it doesn't fight the map for attention. */}
      <button
        type="button"
        onClick={() => setViewMode(m => m === 'streets' ? 'satellite' : 'streets')}
        title={viewMode === 'streets' ? 'Switch to satellite view' : 'Switch to map view'}
        aria-label={viewMode === 'streets' ? 'Switch to satellite view' : 'Switch to map view'}
        style={{
          position: 'absolute',
          // Sits above Help (bottom:60) with ~14px gap. Zoom is
          // at bottom:164 via CSS, so 106 → ~146 for the 40px
          // button leaves a comfortable 18px gap above.
          bottom: 'calc(env(safe-area-inset-bottom, 0) + 106px)',
          right: 14,
          zIndex: 10,
          padding: 3,
          width: 40,
          height: 40,
          borderRadius: 8,
          border: '1px solid rgba(0,0,0,0.15)',
          background: 'white',
          boxShadow: '0 1px 3px rgba(60,64,67,0.15), 0 2px 8px rgba(60,64,67,0.15)',
          cursor: 'pointer',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // Mobile: waive the tap delay and disable the
          // gray tap-highlight for a clean touch feel.
          touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {/* Thumbnail preview of the OPPOSITE mode with a
            tiny 9px label overlay. Short two/three-letter
            label fits comfortably in the 34px inner area. */}
        <div style={{
          width: '100%',
          height: '100%',
          borderRadius: 6,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          // Preview shows the OPPOSITE mode — matches Google
          // Maps' UX where the button shows what you'll get.
          // Both are real tiles at the same coord (Kansas City,
          // z12) so the "before/after" reads clearly at 34px.
          backgroundImage: viewMode === 'streets'
            ? 'url("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/12/1585/936")'
            : 'url("https://tile.openstreetmap.org/12/1585/936.png")',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          fontSize: 9,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          paddingBottom: 2,
          // Dark text on light OSM tile, white text on dark
          // satellite — halo shadow in the opposite color so
          // the label stays readable on either background.
          textShadow: viewMode === 'streets'
            ? '0 1px 2px rgba(0,0,0,0.55)'
            : '0 1px 2px rgba(255,255,255,0.65)',
        }}>
          <span style={{ color: viewMode === 'streets' ? '#fff' : '#1a1612' }}>
            {viewMode === 'streets' ? 'Sat' : 'Map'}
          </span>
        </div>
      </button>
    </div>
  )
}
