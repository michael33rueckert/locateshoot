'use client'

import { useEffect, useRef } from 'react'
import { Map as MLMap, NavigationControl, setWorkerUrl } from 'maplibre-gl'
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
const LAYER_POINTS        = 'unclustered-point'
const LAYER_ICONS         = 'point-icons'
const LAYER_LABELS        = 'point-labels'
const LAYER_LABEL_BADGES  = 'point-label-badges'
const LAYER_USER_DOT      = 'user-dot'
const LAYER_HOME_DOT      = 'home-dot'

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
    // Featured / portfolio pins that HAVE a loaded thumbnail
    // get the full pill+thumb composite label via labelImageId.
    // Pins without a thumb (or in name/dot mode) fall back to
    // the text-only pill layer below.
    const wantsBadge = (mode === 'featured' || mode === 'portfolio') && !!thumb
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
        // Only set when a thumb is available — the label-badge
        // symbol layer filters on this. Empty string when
        // missing so [has, labelImageId] can distinguish.
        ...(wantsBadge ? { labelImageId: `label-${loc.id}` } : {}),
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
    })
    mapRef.current = map

    // Faster wheel / trackpad zoom. Defaults are 1/450 and
    // 1/100 which feel sluggish — bumped 3-4× so a normal
    // scroll gesture covers a few zoom levels quickly. Pinch
    // zoom on touch is controlled by finger movement so it
    // doesn't need explicit tuning here.
    map.scrollZoom.setWheelZoomRate(1 / 120)
    map.scrollZoom.setZoomRate(1 / 40)

    // Zoom control (bottom-right, pushed up via CSS so it
    // clears the Help + Feedback launchers). NavigationControl
    // stays here because Google Maps also has +/- at the
    // bottom-right on desktop.
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')

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
      map.addLayer({
        id: LAYER_POINTS,
        type: 'circle',
        source: SRC_POINTS,
        maxzoom: ZOOM_THRESHOLD_ICONS,
        paint: {
          'circle-color': [
            'case',
            ['boolean', ['feature-state', 'active'], false], '#c4922a',
            ['get', 'color'],
          ],
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            6,  ['case', ['boolean', ['feature-state', 'active'], false], 5, 3],
            12, ['case', ['boolean', ['feature-state', 'active'], false], 8, 5],
          ],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      })

      // Category icons — colored circle with an emoji baked
      // in. Kicks in past the same zoom the labels do so wide
      // zooms stay clean. icon-size 1.0 = the natural 32px
      // rasterised in lib/map-images.ts (matches the previous
      // Leaflet .explore-map-cat-icon-inner 30px size).
      // Active pin scales up ~30%.
      map.addLayer({
        id: LAYER_ICONS,
        type: 'symbol',
        source: SRC_POINTS,
        minzoom: ZOOM_THRESHOLD_ICONS,
        layout: {
          'icon-image': ['get', 'iconKey'],
          // Ramp starts smaller (0.55 at zoom 10) so many icons
          // in one view read as pins, not a wall of circles.
          // Grows to natural 1.0 by zoom 14 and beyond.
          'icon-size': [
            'interpolate', ['linear'], ['zoom'],
            10, ['case', ['boolean', ['feature-state', 'active'], false], 0.75, 0.55],
            14, ['case', ['boolean', ['feature-state', 'active'], false], 1.2, 0.95],
            17, ['case', ['boolean', ['feature-state', 'active'], false], 1.4, 1.1],
          ],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      })

      // Pre-composited badge labels for featured / portfolio
      // pins that have a loaded thumbnail. The image is baked
      // (pill + circular thumb + name + optional subtitle) via
      // makeLabelBadgeImage so what you see here is exactly
      // what the Leaflet .explore-map-label-featured /
      // .explore-map-label-portfolio elements used to look
      // like. Loaded async by ensureBadgeImages() below.
      map.addLayer({
        id: LAYER_LABEL_BADGES,
        type: 'symbol',
        source: SRC_POINTS,
        filter: ['has', 'labelImageId'],
        layout: {
          'icon-image': ['get', 'labelImageId'],
          // Start small at ZOOM_THRESHOLD_FEATURED (9) so
          // badges surface early without eating the whole
          // viewport. Grow toward natural size by zoom 15.
          'icon-size': [
            'interpolate', ['linear'], ['zoom'],
            9,  0.42,
            12, 0.7,
            15, 0.9,
          ],
          'icon-anchor': 'bottom',
          'icon-offset': [0, -8],
          'icon-allow-overlap': false,
          'icon-optional': true,   // don't hide pin if image still loading
        },
        minzoom: ZOOM_THRESHOLD_FEATURED,
      })

      // Text labels for `name` mode and for featured / portfolio
      // pins that DON'T have a thumbnail loaded — falls back to
      // the plain pill + text via icon-text-fit.
      map.addLayer({
        id: LAYER_LABELS,
        type: 'symbol',
        source: SRC_POINTS,
        filter: [
          'all',
          ['!', ['has', 'labelImageId']],
          ['match',
            ['get', 'mode'],
            ['name', 'featured', 'portfolio'], true,
            false,
          ],
        ],
        layout: {
          'text-field': [
            'case',
            ['==', ['get', 'mode'], 'portfolio'],
              ['concat', ['get', 'name'], '\n📷 In your portfolio'],
            ['get', 'name'],
          ],
          'text-font': ['Noto Sans Bold', 'Noto Sans Regular'],
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            11, 11,
            15, 12,
          ],
          'text-anchor': 'top',
          'text-offset': [0, 1.4],
          'text-max-width': 10,
          'icon-image': [
            'case',
            ['==', ['get', 'mode'], 'portfolio'], 'pill-portfolio',
            'pill-featured',
          ],
          'icon-text-fit': 'both',
          'icon-text-fit-padding': [4, 10, 4, 10],
          'icon-allow-overlap': false,
          'text-optional': false,
        },
        paint: {
          'text-color': '#1a1612',
        },
        minzoom: ZOOM_THRESHOLD_FEATURED,
      })

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

  // ── Async badge-image loader ─────────────────────────────────
  // For each featured / portfolio pin that has a photoMap entry,
  // load the thumb → composite pill+thumb+text canvas → register
  // as a MapLibre image. Once registered, the LAYER_LABEL_BADGES
  // symbol layer picks it up on the next redraw. Dedup keyed by
  // pin id so we never re-load or re-generate.
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
        const thumb = pm[String(loc.id)]
        if (!thumb) continue
        const imageId = `label-${loc.id}`
        if (loadedBadgesRef.current.has(imageId)) continue
        if (map.hasImage(imageId)) { loadedBadgesRef.current.add(imageId); continue }
        loadedBadgesRef.current.add(imageId)
        try {
          const badge = await makeLabelBadgeImage({ thumbUrl: thumb, name: loc.name, variant: mode })
          if (cancelled) return
          if (!map.hasImage(imageId)) {
            map.addImage(imageId, badge.data, { pixelRatio: badge.pixelRatio })
          }
        } catch {
          // Thumb failed to load (CORS, 404, etc.) — leave the
          // dedup flag set so we don't spin trying again. The
          // pin falls back to the text-based pill via the
          // LAYER_LABELS filter (!has labelImageId).
        }
      }
    })()
    return () => { cancelled = true }
  }, [locations, photoMap])
  useEffect(() => { homeLocationRef.current = homeLocation; (mapRef.current as any)?.__pushHome?.() },      [homeLocation])

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

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
