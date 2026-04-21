'use client'

import { useEffect, useRef } from 'react'

export interface MapLocation {
  id: number | string
  name: string
  city: string
  lat: number
  lng: number
  d: number | null
  access: string
  rating: string
  bg: string
  type: 'favorite' | 'recommended' | 'secret'
}

interface ShareMapProps {
  locations: MapLocation[]
  selectedIds: Set<number | string>
  radius: number
  pinLocation: { lat: number; lng: number } | null
  onPinDrop: (lat: number, lng: number) => void
}

export default function ShareMap({
  locations,
  selectedIds,
  radius,
  pinLocation,
  onPinDrop,
}: ShareMapProps) {
  const containerRef    = useRef<HTMLDivElement>(null)
  const mapRef          = useRef<any>(null)
  const dropMarkerRef   = useRef<any>(null)
  const radiusCircleRef = useRef<any>(null)
  const locMarkersRef = useRef<Record<number | string, any>>({})

  // ── Init map once ──────────────────────────────────────────────────────────
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

      const map = L.map(container, { zoomControl: true })
        .setView([39.09, -94.58], 11)

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap © CARTO',
      }).addTo(map)

      map.on('click', (e: any) => {
        onPinDrop(e.latlng.lat, e.latlng.lng)
      })

      mapRef.current = map
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Drop pin + radius circle + fly to location ────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !pinLocation) return

    import('leaflet').then(L => {
      const map = mapRef.current
      if (!map) return

      if (dropMarkerRef.current)   map.removeLayer(dropMarkerRef.current)
      if (radiusCircleRef.current) map.removeLayer(radiusCircleRef.current)

      dropMarkerRef.current = L.marker([pinLocation.lat, pinLocation.lng], {
        icon: L.divIcon({
          className: '',
          html: `
            <div style="position:relative;width:18px;height:18px;">
              <div style="
                width:18px;height:18px;border-radius:50%;
                background:#c4922a;border:3px solid white;
                box-shadow:0 3px 10px rgba(196,146,42,.55);
                position:relative;z-index:2;
              "></div>
              <div style="
                position:absolute;top:50%;left:50%;
                transform:translate(-50%,-50%);
                width:36px;height:36px;border-radius:50%;
                border:2px solid rgba(196,146,42,.4);
                animation:pinripple 1.6s ease-out infinite;
              "></div>
            </div>
            <style>
              @keyframes pinripple {
                0%   { transform:translate(-50%,-50%) scale(1); opacity:1; }
                100% { transform:translate(-50%,-50%) scale(2.8); opacity:0; }
              }
            </style>`,
          iconSize:   [18, 18],
          iconAnchor: [9, 9],
        }),
      })
        .addTo(map)
        .bindPopup('<strong>Client area</strong><br><span style="color:#6b5f52;font-size:12px;">Searching within radius</span>')
        .openPopup()

      radiusCircleRef.current = L.circle([pinLocation.lat, pinLocation.lng], {
        radius:      radius * 1609.34,
        color:       '#c4922a',
        weight:      1.5,
        opacity:     0.5,
        fillColor:   '#c4922a',
        fillOpacity: 0.04,
      }).addTo(map)

      // Fly to the pin so it's always visible
      map.flyTo([pinLocation.lat, pinLocation.lng], 12, { duration: 1.0 })
    })
  }, [pinLocation]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resize radius circle when slider changes ───────────────────────────────
  useEffect(() => {
    if (!radiusCircleRef.current) return
    radiusCircleRef.current.setRadius(radius * 1609.34)
  }, [radius])

  // ── Redraw location markers ────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return

    import('leaflet').then(L => {
      const map = mapRef.current
      if (!map) return

      Object.values(locMarkersRef.current).forEach((m: any) => map.removeLayer(m))
      locMarkersRef.current = {}

      locations.forEach(loc => {
        const inRange  = loc.d !== null ? loc.d <= radius : true
        const isSel    = selectedIds.has(loc.id)
        const isRec    = loc.type === 'recommended'

        // Color logic:
        // selected (any type) = green
        // recommended in range = sky blue
        // favorite in range    = sand
        // out of range         = dark/faded
        let color   = '#d4c9b0'
        let opacity = 0.8
        let size    = 12

        if (!inRange)       { color = '#3d352c'; opacity = 0.3; size = 10 }
        else if (isSel)     { color = '#4a6741'; opacity = 1;   size = 14 }
        else if (isRec)     { color = '#3d6e8c'; opacity = 0.85; size = 12 }

        const marker = L.marker([loc.lat, loc.lng], {
          icon: L.divIcon({
            className: '',
            html: `<div style="
              width:${size}px;height:${size}px;border-radius:50%;
              background:${color};border:2px solid white;
              box-shadow:0 2px 6px rgba(0,0,0,.3);
              opacity:${opacity};transition:all .25s;
            "></div>`,
            iconSize:   [size, size],
            iconAnchor: [size / 2, size / 2],
          }),
        }).addTo(map)

        const distText = loc.d != null
          ? `<br><span style="color:#c4922a;font-size:12px;">${loc.d.toFixed(1)} mi away</span>`
          : ''
        const typeLabel = isRec
          ? '<br><span style="color:#3d6e8c;font-size:11px;">📌 Recommended</span>'
          : ''
        marker.bindPopup(
          `<strong>${loc.name}</strong><br>
           <span style="color:#6b5f52;font-size:12px;">📍 ${loc.city}</span>
           ${typeLabel}${distText}`
        )

        locMarkersRef.current[loc.id] = marker
      })
    })
  }, [locations, selectedIds, radius])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}