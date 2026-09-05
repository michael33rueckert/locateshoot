'use client'

import { useEffect, useRef } from 'react'
import { Map as MLMap, NavigationControl, LngLatBounds, setWorkerUrl } from 'maplibre-gl'
import type { GeoJSONSource, MapMouseEvent, MapGeoJSONFeature } from 'maplibre-gl'

// Self-hosted worker path — see ExploreMap.tsx for context on
// why Turbopack can't serve maplibre-gl's default worker URL.
if (typeof window !== 'undefined') {
  try { setWorkerUrl('/maplibre-gl-worker.mjs') } catch { /* older maplibre — no-op */ }
}
import { getVectorStyle } from '@/lib/map-tiles'
import { getCategoryVisual } from '@/lib/map-categories'

// ── ClientMap (WebGL, MapLibre GL JS) ───────────────────────────────
//
// Location-guide map — smaller than the Explore map (usually 10–30
// pins per photographer's guide) but shares the same MapLibre GL JS
// engine so the pinch/pan feel is consistent across the app.
//
// The photographer's picks are drawn as numbered circles that
// mirror the sidebar list order; the client's chosen picks show as
// green check circles; unpickable-by-distance pins fade back. All
// paint decisions are data-driven expressions so activeId /
// chosenIds / disabledIds updates skip layer teardown and just
// re-paint with a new state — cheap.

function isFiniteLatLng(lat: any, lng: any): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng)
}

export interface ClientLocation {
  id: number
  name: string
  city: string
  lat: number
  lng: number
  access: string
  rating: string
  bg: string
  type: 'favorite' | 'recommended' | 'secret'
  category?: string | null
  tags?: string[] | null
  photoUrl?: string | null
}

interface ClientMapProps {
  locations: ClientLocation[]
  activeId: number | null
  chosenIds: Array<number | string>
  disabledIds?: Array<number | string>
  onMarkerClick: (id: number) => void
  /** Set false while the container is hidden (e.g. mobile map toggle).
   *  When it flips back to true we call map.resize() + refit bounds
   *  so the map shows the pin spread instead of the fallback center. */
  visible?: boolean
}

const SRC_POINTS  = 'guide-locations'
const LAYER_POINTS = 'guide-points'
const LAYER_INDEX  = 'guide-index'
const LAYER_LABEL  = 'guide-label'
const LAYER_REC    = 'guide-recommended'

function locsToGeoJSON(
  locations: ClientLocation[],
  chosenSet: Set<string>,
  disabledSet: Set<string>,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  locations.forEach((loc, i) => {
    if (!isFiniteLatLng(loc.lat, loc.lng)) return
    const key = String(loc.id)
    const visual = getCategoryVisual(loc.category, loc.access, loc.tags ?? undefined)
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [loc.lng, loc.lat] },
      properties: {
        id: loc.id,
        name: loc.name,
        index: i + 1,
        color: visual.color,
        chosen: chosenSet.has(key),
        disabled: !chosenSet.has(key) && disabledSet.has(key),
        recommended: loc.type === 'recommended',
      },
    })
  })
  return { type: 'FeatureCollection', features }
}

export default function ClientMap({
  locations,
  activeId,
  chosenIds,
  disabledIds = [],
  onMarkerClick,
  visible = true,
}: ClientMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<MLMap | null>(null)
  const isReadyRef   = useRef(false)
  const didInitialFitRef = useRef(false)

  const onMarkerClickRef = useRef(onMarkerClick)
  useEffect(() => { onMarkerClickRef.current = onMarkerClick }, [onMarkerClick])

  // ── Init ────────────────────────────────────────────────────────
  // Same init pattern ExploreMap uses — mount-once, let
  // MapLibre's built-in ResizeObserver detect container size
  // changes (e.g. mobile display:none → display:block).
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    // eslint-disable-next-line no-console
    console.log('[ClientMap] init — container:', rect.width, '×', rect.height, 'display:', getComputedStyle(containerRef.current).display, 'parent display:', containerRef.current.parentElement && getComputedStyle(containerRef.current.parentElement).display)

    const map = new MLMap({
      container: containerRef.current,
      style: getVectorStyle('dark'),
      center: [-94.58, 39.09],
      zoom: 11,
    })
    mapRef.current = map
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
    map.on('error', (e: any) => {
      // eslint-disable-next-line no-console
      console.error('[ClientMap] error:', e?.error?.message ?? e)
    })
    map.on('load', () => {
      // eslint-disable-next-line no-console
      console.log('[ClientMap] load fired — container:', containerRef.current?.getBoundingClientRect())
      isReadyRef.current = true

      map.addSource(SRC_POINTS, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'id',
      })

      // Base circle — sized + colored by chosen / active / disabled
      // via feature-state + properties. Active + chosen states beat
      // the base color; disabled dims + halves the ring.
      map.addLayer({
        id: LAYER_POINTS,
        type: 'circle',
        source: SRC_POINTS,
        paint: {
          'circle-color': [
            'case',
            ['get', 'chosen'], '#4a6741',
            ['boolean', ['feature-state', 'active'], false], '#c4922a',
            ['get', 'disabled'], 'rgba(180,175,165,0.7)',
            'rgba(245,240,232,0.95)',
          ],
          'circle-radius': [
            'case',
            ['any', ['get', 'chosen'], ['boolean', ['feature-state', 'active'], false]], 14,
            10,
          ],
          'circle-stroke-width': [
            'case',
            ['any', ['get', 'chosen'], ['boolean', ['feature-state', 'active'], false]], 3,
            2,
          ],
          'circle-stroke-color': '#ffffff',
          'circle-opacity': [
            'case', ['get', 'disabled'], 0.55, 1,
          ],
        },
      })

      // Recommended pins get a gold accent ring behind the base
      // circle. Rendered below LAYER_POINTS as a slightly larger
      // circle so it reads as a halo.
      map.addLayer({
        id: LAYER_REC,
        type: 'circle',
        source: SRC_POINTS,
        filter: ['get', 'recommended'],
        paint: {
          'circle-color': 'rgba(0,0,0,0)',
          'circle-radius': [
            'case',
            ['any', ['get', 'chosen'], ['boolean', ['feature-state', 'active'], false]], 18,
            14,
          ],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#c4922a',
        },
      }, LAYER_POINTS)

      // Numbered index label inside each pin (or ✓ if chosen).
      map.addLayer({
        id: LAYER_INDEX,
        type: 'symbol',
        source: SRC_POINTS,
        layout: {
          'text-field': [
            'case',
            ['get', 'chosen'], '✓',
            ['to-string', ['get', 'index']],
          ],
          'text-font': ['Noto Sans Bold', 'Noto Sans Regular'],
          'text-size': 12,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': [
            'case',
            ['get', 'chosen'], '#ffffff',
            ['boolean', ['feature-state', 'active'], false], '#1a1612',
            ['get', 'disabled'], '#6b5f52',
            '#1a1612',
          ],
        },
      })

      // Name label + Recommended tag to the right of the pin, once
      // the client has zoomed in far enough to read it.
      map.addLayer({
        id: LAYER_LABEL,
        type: 'symbol',
        source: SRC_POINTS,
        layout: {
          'text-field': [
            'case',
            ['get', 'recommended'], ['concat', ['get', 'name'], '\n⭐ Recommended'],
            ['get', 'name'],
          ],
          'text-font': ['Noto Sans Bold', 'Noto Sans Regular'],
          'text-size': 11,
          'text-anchor': 'left',
          'text-offset': [1.1, 0],
          'text-max-width': 10,
          'text-optional': true,
        },
        paint: {
          'text-color': '#f5f0e8',
          'text-halo-color': 'rgba(26,22,18,0.85)',
          'text-halo-width': 1.4,
          'text-halo-blur': 0.4,
        },
        minzoom: 12,
      })

      // Click → onMarkerClick with the pin's id.
      map.on('click', LAYER_POINTS, (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
        const feat = e.features?.[0]
        if (!feat) return
        const id = feat.properties?.id
        if (id != null) onMarkerClickRef.current(id)
      })
      map.on('mouseenter', LAYER_POINTS, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', LAYER_POINTS, () => { map.getCanvas().style.cursor = '' })

      // Push whatever data has already arrived.
      pushLocations()
    })

    function pushLocations() {
      if (!isReadyRef.current) return
      const src = map.getSource(SRC_POINTS) as GeoJSONSource | undefined
      if (!src) return
      const chosenSet   = new Set(chosenIdsRef.current.map(String))
      const disabledSet = new Set(disabledIdsRef.current.map(String))
      src.setData(locsToGeoJSON(locationsRef.current, chosenSet, disabledSet))
    }
    ;(map as any).__pushLocations = pushLocations

    return () => {
      isReadyRef.current = false
      didInitialFitRef.current = false
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Latest-value refs so pushLocations always sees current props.
  const locationsRef   = useRef(locations)
  const chosenIdsRef   = useRef(chosenIds)
  const disabledIdsRef = useRef(disabledIds)
  useEffect(() => {
    locationsRef.current   = locations
    chosenIdsRef.current   = chosenIds
    disabledIdsRef.current = disabledIds
    ;(mapRef.current as any)?.__pushLocations?.()
  }, [locations, chosenIds, disabledIds])

  // Active-marker highlight via feature-state — no layer rebuild.
  const lastActiveIdRef = useRef<number | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReadyRef.current) return
    const prev = lastActiveIdRef.current
    if (prev != null) {
      try { map.setFeatureState({ source: SRC_POINTS, id: prev }, { active: false }) } catch { /* feature gone */ }
    }
    if (activeId != null) {
      try { map.setFeatureState({ source: SRC_POINTS, id: activeId }, { active: true }) } catch { /* not loaded yet */ }
    }
    lastActiveIdRef.current = activeId
  }, [activeId])

  // Fit bounds once, after the map is ready + locations arrive +
  // container is visible. Mobile hides the map column until "View
  // Map" is tapped — the visible dep re-runs so we fit correctly
  // when the container gets a real size.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReadyRef.current) return
    if (!visible) return
    if (didInitialFitRef.current) return
    const valid = locations.filter(l => isFiniteLatLng(l.lat, l.lng))
    if (valid.length === 0) return
    requestAnimationFrame(() => {
      if (didInitialFitRef.current) return
      map.resize()
      const bounds = new LngLatBounds()
      valid.forEach(l => bounds.extend([l.lng, l.lat]))
      map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 })
      didInitialFitRef.current = true
    })
  }, [visible, locations])

  // resize() when visibility flips — the map may have been mounted
  // while the container was 0×0, in which case the WebGL context
  // is at 1×1 until we tell it to remeasure.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReadyRef.current) return
    if (visible) requestAnimationFrame(() => map.resize())
  }, [visible])

  // Fly to active marker on activeId change.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReadyRef.current || !activeId) return
    const loc = locations.find(l => l.id === activeId)
    if (!loc || !isFiniteLatLng(loc.lat, loc.lng)) return
    map.easeTo({ center: [loc.lng, loc.lat], zoom: 14, duration: 600 })
  }, [activeId, locations])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
