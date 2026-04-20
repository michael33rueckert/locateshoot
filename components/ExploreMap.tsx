'use client'

import { useEffect, useRef } from 'react'

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
}

interface ExploreMapProps {
  locations: ExploreLocation[]
  activeId: number | null
  userLocation: { lat: number; lng: number } | null
  onMarkerClick: (id: number) => void
}

export default function ExploreMap({
  locations,
  activeId,
  userLocation,
  onMarkerClick,
}: ExploreMapProps) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<any>(null)
  const markersRef    = useRef<Record<number, any>>({})
  const userMarkerRef = useRef<any>(null)

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
        .setView([39.09, -94.58], 10)

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap © CARTO',
      }).addTo(map)

      L.control.zoom({ position: 'bottomright' }).addTo(map)

      mapRef.current = map
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [])

  // ── Fly to user location when it arrives ──────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !userLocation) return
    mapRef.current.flyTo([userLocation.lat, userLocation.lng], 13, { duration: 1.2 })
  }, [userLocation])

  // ── Draw user location dot ─────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !userLocation) return

    import('leaflet').then(L => {
      const map = mapRef.current
      if (!map) return

      if (userMarkerRef.current) map.removeLayer(userMarkerRef.current)

      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], {
        icon: L.divIcon({
          className: '',
          html: `
            <div style="position:relative;width:18px;height:18px;">
              <div style="
                width:14px;height:14px;border-radius:50%;
                background:#3d6e8c;border:3px solid white;
                box-shadow:0 2px 8px rgba(61,110,140,.6);
                position:absolute;top:2px;left:2px;z-index:2;
              "></div>
              <div style="
                position:absolute;top:50%;left:50%;
                transform:translate(-50%,-50%);
                width:32px;height:32px;border-radius:50%;
                background:rgba(61,110,140,.15);
                animation:userpulse 2s ease-out infinite;
              "></div>
            </div>
            <style>
              @keyframes userpulse {
                0%   { transform:translate(-50%,-50%) scale(1);   opacity:1; }
                100% { transform:translate(-50%,-50%) scale(2.5); opacity:0; }
              }
            </style>
          `,
          iconSize:   [18, 18],
          iconAnchor: [9, 9],
        }),
        zIndexOffset: 2000,
      }).addTo(map)
        .bindPopup('<strong>You are here</strong>')
    })
  }, [userLocation])

  // ── Redraw location markers when data or active state changes ──────────────
  useEffect(() => {
    if (!mapRef.current) return

    import('leaflet').then(L => {
      const map = mapRef.current
      if (!map) return

      Object.values(markersRef.current).forEach((m: any) => map.removeLayer(m))
      markersRef.current = {}

      locations.forEach(loc => {
        const isActive = activeId === loc.id
        const color    = loc.access === 'private' ? '#b54b2a' : '#4a6741'
        const size     = isActive ? 22 : 16
        const bg       = isActive ? '#c4922a' : color
        const border   = isActive ? '3px' : '2px'

        const marker = L.marker([loc.lat, loc.lng], {
          icon: L.divIcon({
            className: '',
            html: `<div style="
              width:${size}px; height:${size}px; border-radius:50%;
              background:${bg}; border:${border} solid white;
              box-shadow:0 ${isActive ? '4px 14px' : '2px 6px'} rgba(0,0,0,.3);
              transition:all .25s; cursor:pointer;
            "></div>`,
            iconSize:   [size, size],
            iconAnchor: [size / 2, size / 2],
          }),
          zIndexOffset: isActive ? 1000 : 0,
        }).addTo(map)

        marker.on('click', () => onMarkerClick(loc.id))
        marker.bindPopup(
          `<strong>${loc.name}</strong><br>
           <span style="color:#6b5f52;font-size:12px;">📍 ${loc.city}</span><br>
           <span style="color:#c4922a;font-size:12px;">★ ${loc.rating}</span>`
        )

        markersRef.current[loc.id] = marker
      })
    })
  }, [locations, activeId, onMarkerClick])

  // ── Fly to active location when sidebar card is clicked ───────────────────
  useEffect(() => {
    if (!mapRef.current || !activeId) return
    const loc = locations.find(l => l.id === activeId)
    if (!loc) return
    mapRef.current.flyTo([loc.lat, loc.lng], 14, { duration: 0.8 })
  }, [activeId, locations])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}