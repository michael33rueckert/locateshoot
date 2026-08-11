'use client'

import { useEffect, useRef } from 'react'

// Small Leaflet map used inside modals so someone can pick a location
// visually instead of typing latitude/longitude. Marker is draggable
// and a map-click drops the marker at the tapped point. Both actions
// call onChange with the new coords; the parent owns the state.
//
// Same tile provider + attribution as ExploreMap for visual continuity.
// Container is left up to the caller (width 100%, caller-controlled
// height) so it drops cleanly into whatever form it lives in.

const USA_CENTER: [number, number] = [39.5, -98.5]

export default function MapCoordPicker({
  lat, lng, onChange, height = 260, initialZoom,
}: {
  lat:  number | null
  lng:  number | null
  onChange: (lat: number, lng: number) => void
  height?:  number
  // If the caller knows roughly where the marker should sit even
  // when lat/lng are null (e.g. a city geocode), they can pass an
  // initialZoom to override the default (USA 4 / point 14) so the
  // map opens somewhere useful.
  initialZoom?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<any>(null)
  const markerRef    = useRef<any>(null)
  // The moveMarker effect below sets marker + view whenever lat/lng
  // change. Without a guard, our own onChange (from drag / click)
  // would round-trip via the parent's setState and yank the map view
  // back onto the point — annoying while panning around. Track the
  // last coord we broadcast so we can ignore the echo.
  const lastBroadcastRef = useRef<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current

    import('leaflet').then(L => {
      if (!container) return
      if ((container as any)._leaflet_id) return

      // Same marker-icon plumbing ExploreMap uses. Without this,
      // Leaflet's default marker icon fails to load because Next
      // rewrites the icon path during bundling.
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      })

      const hasPoint = Number.isFinite(lat as any) && Number.isFinite(lng as any)
      const center: [number, number] = hasPoint ? [lat as number, lng as number] : USA_CENTER
      const zoom = initialZoom ?? (hasPoint ? 15 : 4)
      const map = L.map(container, { zoomControl: true }).setView(center, zoom)

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap © CARTO',
      }).addTo(map)

      const marker = L.marker(center, { draggable: true })
      if (hasPoint) marker.addTo(map)

      marker.on('dragend', () => {
        const p = marker.getLatLng()
        lastBroadcastRef.current = { lat: p.lat, lng: p.lng }
        onChange(p.lat, p.lng)
      })

      map.on('click', (e: any) => {
        marker.setLatLng(e.latlng)
        if (!marker.getElement()) marker.addTo(map)
        lastBroadcastRef.current = { lat: e.latlng.lat, lng: e.latlng.lng }
        onChange(e.latlng.lat, e.latlng.lng)
      })

      mapRef.current    = map
      markerRef.current = marker
    })

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      markerRef.current = null
    }
    // Init runs once — subsequent lat/lng updates flow through the
    // effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Move the marker (and re-center) when the parent updates coords —
  // typing into the lat/lng number inputs, external geocode, etc.
  // The echo guard prevents this from cancelling in-flight pans.
  useEffect(() => {
    const marker = markerRef.current
    const map = mapRef.current
    if (!marker || !map) return
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return
    const last = lastBroadcastRef.current
    if (last && Math.abs(last.lat - lat) < 1e-9 && Math.abs(last.lng - lng) < 1e-9) return
    marker.setLatLng([lat, lng])
    if (!marker.getElement()) marker.addTo(map)
    // Keep the point visible but don't force a zoom change if the
    // user has been panning around.
    const currentZoom = map.getZoom()
    map.setView([lat, lng], currentZoom < 12 ? 15 : currentZoom)
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
