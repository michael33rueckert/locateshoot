'use client'

import { useEffect, useRef } from 'react'
import { Map as MLMap, Marker, NavigationControl, AttributionControl, setWorkerUrl } from 'maplibre-gl'
import { getVectorStyle } from '@/lib/map-tiles'

// Small MapLibre GL JS map used inside modals so someone can
// pick a location visually instead of typing latitude/longitude.
// Marker is draggable and a map-click drops the marker at the
// tapped point. Both actions call onChange with the new coords;
// the parent owns the state. Same style + engine as
// ExploreMap / ClientMap / HomeMap for visual + perf continuity.
//
// Container is left up to the caller (width 100%, caller-
// controlled height) so it drops cleanly into whatever form
// it lives in.

// Turbopack workaround: point MapLibre at the self-hosted
// worker copy (see /public/maplibre-gl-worker.mjs and the
// postinstall script). Otherwise the worker script comes back
// with the wrong MIME under Turbopack and tile processing
// stalls, leaving the map blank.
if (typeof window !== 'undefined') {
  try { setWorkerUrl('/maplibre-gl-worker.mjs') } catch { /* older maplibre — no-op */ }
}

const USA_CENTER: [number, number] = [-98.5, 39.5]  // MapLibre uses [lng, lat]

export default function MapCoordPicker({
  lat, lng, onChange, height = 260, initialZoom,
}: {
  lat:  number | null
  lng:  number | null
  onChange: (lat: number, lng: number) => void
  height?:  number
  // If the caller knows roughly where the marker should sit
  // even when lat/lng are null (e.g. a city geocode), they
  // can pass an initialZoom to override the default (USA 4 /
  // point 14) so the map opens somewhere useful.
  initialZoom?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<MLMap | null>(null)
  const markerRef    = useRef<Marker | null>(null)
  // The moveMarker effect below sets marker + view whenever
  // lat/lng change. Without a guard, our own onChange (from
  // drag / click) would round-trip via the parent's setState
  // and yank the map view back onto the point — annoying
  // while panning around. Track the last coord we broadcast so
  // we can ignore the echo.
  const lastBroadcastRef = useRef<{ lat: number; lng: number } | null>(null)
  // Keep the latest callback in a ref so the init effect never
  // depends on it and re-runs (would tear down + rebuild the
  // WebGL context every time the parent re-renders).
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const hasPoint = Number.isFinite(lat as any) && Number.isFinite(lng as any)
    const center: [number, number] = hasPoint
      ? [lng as number, lat as number]
      : USA_CENTER
    const zoom = initialZoom ?? (hasPoint ? 15 : 4)

    const map = new MLMap({
      container: containerRef.current,
      style: getVectorStyle('light'),
      center,
      zoom,
      attributionControl: false,
    })
    mapRef.current = map

    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new AttributionControl({ compact: true }), 'bottom-left')

    // Draggable marker for fine-tuning. Only mounted onto the
    // map once we actually have a point — otherwise dropping
    // one requires a map click first.
    const marker = new Marker({ draggable: true, color: '#c4922a' })
      .setLngLat(center)
    if (hasPoint) marker.addTo(map)
    markerRef.current = marker

    marker.on('dragend', () => {
      const p = marker.getLngLat()
      lastBroadcastRef.current = { lat: p.lat, lng: p.lng }
      onChangeRef.current(p.lat, p.lng)
    })

    map.on('click', (e) => {
      const { lat: newLat, lng: newLng } = e.lngLat
      marker.setLngLat([newLng, newLat])
      // Adds the marker to the map if it wasn't already.
      marker.addTo(map)
      lastBroadcastRef.current = { lat: newLat, lng: newLng }
      onChangeRef.current(newLat, newLng)
    })

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // Init runs once — subsequent lat/lng updates flow through
    // the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Move the marker (and re-center) when the parent updates
  // coords — typing into the lat/lng number inputs, external
  // geocode, etc. The echo guard prevents this from cancelling
  // in-flight pans.
  useEffect(() => {
    const marker = markerRef.current
    const map = mapRef.current
    if (!marker || !map) return
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return
    const last = lastBroadcastRef.current
    if (last && Math.abs(last.lat - lat) < 1e-9 && Math.abs(last.lng - lng) < 1e-9) return
    marker.setLngLat([lng, lat])
    marker.addTo(map)
    // Keep the point visible but don't force a zoom change if
    // the user has been panning around.
    const currentZoom = map.getZoom()
    map.easeTo({ center: [lng, lat], zoom: currentZoom < 12 ? 15 : currentZoom, duration: 400 })
  }, [lat, lng])

  return (
    <div style={{ position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--cream-dark)' }} />
      <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, marginTop: 6, lineHeight: 1.5 }}>
        {(lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng))
          ? <>Tap the map to move the pin · drag the pin to fine-tune · currently {lat.toFixed(6)}, {lng.toFixed(6)}</>
          : <>Tap the map to drop a pin — the coordinates fill in automatically.</>}
      </div>
    </div>
  )
}
