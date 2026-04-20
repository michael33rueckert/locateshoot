'use client'

import { useEffect, useRef } from 'react'

export interface ClientLocation {
  id: number
  name: string
  city: string
  lat: number
  lng: number
  access: string
  rating: string
  bg: string
  type: 'favorite' | 'recommended'
}

interface ClientMapProps {
  locations: ClientLocation[]
  activeId: number | null
  chosenId: number | null
  onMarkerClick: (id: number) => void
}

export default function ClientMap({
  locations,
  activeId,
  chosenId,
  onMarkerClick,
}: ClientMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<any>(null)
  const markersRef   = useRef<Record<number, any>>({})

  // ── Init map ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current

    import('leaflet').then(L => {
      if (!container) return
      if ((container as any)._leaflet_id) return

      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      })

      const map = L.map(container, { zoomControl: false })
        .setView([39.09, -94.58], 11)

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap © CARTO',
      }).addTo(map)

      L.control.zoom({ position: 'bottomright' }).addTo(map)

      mapRef.current = map

      // Fit map to all locations on load
      if (locations.length > 0) {
        const bounds = L.latLngBounds(locations.map(l => [l.lat, l.lng]))
        map.fitBounds(bounds, { padding: [48, 48] })
      }
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Redraw markers when active/chosen state changes ────────────────────────
  useEffect(() => {
    if (!mapRef.current) return

    import('leaflet').then(L => {
      const map = mapRef.current
      if (!map) return

      Object.values(markersRef.current).forEach((m: any) => map.removeLayer(m))
      markersRef.current = {}

      locations.forEach((loc, i) => {
        const isActive = activeId === loc.id
        const isChosen = chosenId === loc.id
        const isRec    = loc.type === 'recommended'

        let bg    = isRec ? 'rgba(61,110,140,0.9)' : 'rgba(245,240,232,0.92)'
        let color = isRec ? 'white' : '#1a1612'
        let size  = 28
        let border = '2.5px solid white'

        if (isChosen) {
          bg = '#4a6741'; color = 'white'; size = 32; border = '3px solid white'
        } else if (isActive) {
          bg = '#c4922a'; color = '#1a1612'; size = 32; border = '3px solid white'
        }

        const marker = L.marker([loc.lat, loc.lng], {
          icon: L.divIcon({
            className: '',
            html: `<div style="
              width:${size}px; height:${size}px; border-radius:50%;
              background:${bg}; border:${border};
              box-shadow:0 3px 10px rgba(0,0,0,.4);
              display:flex; align-items:center; justify-content:center;
              font-size:12px; font-weight:700; color:${color};
              transition:all .25s;
            ">${isChosen ? '✓' : i + 1}</div>`,
            iconSize:   [size, size],
            iconAnchor: [size / 2, size / 2],
          }),
          zIndexOffset: isActive || isChosen ? 1000 : 0,
        }).addTo(map)

        marker.on('click', () => onMarkerClick(loc.id))

        marker.bindPopup(
          `<strong>${loc.name}</strong><br>
           <span style="color:#6b5f52;font-size:12px;">📍 ${loc.city}</span><br>
           <span style="color:#c4922a;font-size:12px;">★ ${loc.rating}</span>
           ${isRec ? '<br><span style="color:#3d6e8c;font-size:11px;">📌 Recommended</span>' : ''}`
        )

        markersRef.current[loc.id] = marker
      })
    })
  }, [locations, activeId, chosenId, onMarkerClick])

  // ── Fly to active location ─────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !activeId) return
    const loc = locations.find(l => l.id === activeId)
    if (!loc) return
    mapRef.current.flyTo([loc.lat, loc.lng], 14, { duration: 0.8 })
  }, [activeId, locations])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}