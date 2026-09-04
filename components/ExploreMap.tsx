'use client'

import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map as MLMap, GeoJSONSource, MapMouseEvent, MapGeoJSONFeature } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getVectorStyle } from '@/lib/map-tiles'
import { getCategoryVisual } from '@/lib/map-categories'

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

// Zoom thresholds. Match the previous Leaflet-era values so the
// per-mode reveal behavior stays consistent for admin's saved
// map_display_mode setting.
const ZOOM_THRESHOLD_NAME     = 13
const ZOOM_THRESHOLD_FEATURED = 11
const ZOOM_THRESHOLD_ICONS    = 13

// GeoJSON source id + layer ids — module-level constants so
// helpers and effects reference the same strings without typos.
const SRC_POINTS      = 'locations'
const SRC_USER        = 'user-location'
const SRC_HOME        = 'home-location'
const LAYER_CLUSTERS  = 'clusters'
const LAYER_CLUSTER_N = 'cluster-count'
const LAYER_POINTS    = 'unclustered-point'
const LAYER_LABELS    = 'point-labels'
const LAYER_USER_DOT  = 'user-dot'
const LAYER_HOME_DOT  = 'home-dot'

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
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [loc.lng, loc.lat] },
      properties: {
        id: loc.id,
        name: loc.name,
        city: loc.city,
        access: loc.access,
        mode: loc.mapDisplayMode ?? 'dot',
        color: visual.color,
        emoji: visual.emoji,
        hasPhoto: !!photoMap[String(loc.id)],
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

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getVectorStyle('light'),
      center: initial.center,
      zoom: initial.zoom,
      // Interaction feel — MapLibre's defaults are already very
      // close to Google Maps. cooperativeGestures is off so
      // single-finger pan works (Google Maps mobile also does).
      touchZoomRotate: true,
      dragRotate: false,
      pitchWithRotate: false,
      // Higher devicePixelRatio ceiling on Retina without
      // ballooning GPU memory. 2 is enough for crisp text.
      maxPitch: 0,
      minZoom: 2,
      maxZoom: 20,
      // Attribution moves to bottom-left so it doesn't collide
      // with the sidebar-collapse handle on desktop.
      attributionControl: { compact: true },
    })
    mapRef.current = map

    // Zoom control (bottom-right, matches the Leaflet placement).
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')

    // moveend is Leaflet-nostalgic naming — MapLibre calls the
    // same event 'moveend'. Fires once per gesture end (debounced
    // by MapLibre internally), so this is safe to bind directly.
    map.on('moveend', () => {
      const cb = onMapMoveRef.current
      if (!cb) return
      const c = map.getCenter()
      cb({ lat: c.lat, lng: c.lng }, map.getZoom())
    })

    map.on('load', () => {
      isReadyRef.current = true

      // ── Points source + clustering ────────────────────────────
      map.addSource(SRC_POINTS, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 12,   // pins split apart at zoom 13 (matches ZOOM_THRESHOLD_NAME)
        clusterRadius: 50,
        // Promote our own `id` property to the top-level feature
        // id — required for map.setFeatureState({id: X, ...}) to
        // hit the right feature (active-marker highlight).
        promoteId: 'id',
      })

      // Cluster bubbles — colored + sized by count. Circles are
      // pure WebGL — thousands of them render at 60fps.
      map.addLayer({
        id: LAYER_CLUSTERS,
        type: 'circle',
        source: SRC_POINTS,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step', ['get', 'point_count'],
            '#4a6741',  10,
            '#c4922a',  50,
            '#b54b2a',
          ],
          'circle-radius': [
            'step', ['get', 'point_count'],
            18,  10,
            22,  50,
            28,
          ],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': 'rgba(255,255,255,0.9)',
        },
      })

      map.addLayer({
        id: LAYER_CLUSTER_N,
        type: 'symbol',
        source: SRC_POINTS,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Bold', 'Noto Sans Regular'],
          'text-size': 13,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': '#ffffff',
        },
      })

      // Unclustered individual points. Data-driven radius + color:
      // active pin (via feature-state) is gold + larger; featured
      // and portfolio pins are slightly larger + colored per
      // category; default pins are their category color.
      map.addLayer({
        id: LAYER_POINTS,
        type: 'circle',
        source: SRC_POINTS,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': [
            'case',
            ['boolean', ['feature-state', 'active'], false], '#c4922a',
            ['==', ['get', 'mode'], 'portfolio'], '#c4922a',
            ['get', 'color'],
          ],
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            6,  ['case', ['boolean', ['feature-state', 'active'], false], 5,
                 ['match', ['get', 'mode'], ['featured', 'portfolio'], 5, 3]],
            13, ['case', ['boolean', ['feature-state', 'active'], false], 10,
                 ['match', ['get', 'mode'], ['featured', 'portfolio'], 9, 6]],
            18, ['case', ['boolean', ['feature-state', 'active'], false], 14,
                 ['match', ['get', 'mode'], ['featured', 'portfolio'], 12, 9]],
          ],
          'circle-stroke-width': [
            'case',
            ['boolean', ['feature-state', 'active'], false], 3,
            ['==', ['get', 'mode'], 'portfolio'], 3,
            2,
          ],
          'circle-stroke-color': [
            'case',
            ['==', ['get', 'mode'], 'portfolio'], '#c4922a',
            '#ffffff',
          ],
        },
      })

      // Text labels for `name`, `featured`, and `portfolio` modes.
      // MapLibre resolves the reveal threshold via a data-driven
      // minzoom expression, so pins in different modes light up
      // at their own zoom levels — no JS zoomend rebinding needed.
      map.addLayer({
        id: LAYER_LABELS,
        type: 'symbol',
        source: SRC_POINTS,
        filter: [
          'all',
          ['!', ['has', 'point_count']],
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
            15, 13,
          ],
          'text-anchor': 'top',
          'text-offset': [0, 0.9],
          'text-max-width': 10,
          'text-optional': true,
        },
        paint: {
          'text-color': '#1a1612',
          'text-halo-color': 'rgba(255,255,255,0.92)',
          'text-halo-width': 1.6,
          'text-halo-blur': 0.4,
        },
        minzoom: ZOOM_THRESHOLD_FEATURED,
      })

      // Interaction: click on a cluster → zoom in. On a point →
      // fire the parent's onMarkerClick with the pin id.
      map.on('click', LAYER_CLUSTERS, (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
        const feat = e.features?.[0]
        if (!feat) return
        const clusterId = feat.properties?.cluster_id
        const source = map.getSource(SRC_POINTS) as GeoJSONSource
        source.getClusterExpansionZoom(clusterId).then((zoom: number) => {
          const geom = feat.geometry as GeoJSON.Point
          map.easeTo({ center: geom.coordinates as [number, number], zoom })
        }).catch(() => { /* cluster gone (data changed) — ignore */ })
      })

      map.on('click', LAYER_POINTS, (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
        const feat = e.features?.[0]
        if (!feat) return
        const id = feat.properties?.id
        if (id != null) onMarkerClickRef.current(id)
      })

      // Cursor feedback so the pins feel interactive.
      map.on('mouseenter', LAYER_CLUSTERS, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', LAYER_CLUSTERS, () => { map.getCanvas().style.cursor = '' })
      map.on('mouseenter', LAYER_POINTS,   () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', LAYER_POINTS,   () => { map.getCanvas().style.cursor = '' })

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
    map.easeTo({ center: [homeLocation.lng, homeLocation.lat], zoom: HOME_CITY_ZOOM, duration: 600 })
    homeAppliedRef.current = true
  }, [homeLocation])

  // Fly to the user's current location when it becomes known
  // (via Search or Near-me). Uses easeTo (WebGL, GPU compositor)
  // so this is buttery smooth even on mobile.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReadyRef.current) return
    if (!userLocation || !isFiniteLatLng(userLocation.lat, userLocation.lng)) return
    map.easeTo({ center: [userLocation.lng, userLocation.lat], zoom: 13, duration: 700 })
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
    map.easeTo({ center: [loc.lng, loc.lat], zoom: Math.max(map.getZoom(), 14), duration: 600 })
  }, [activeId, locations])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
