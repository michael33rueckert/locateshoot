'use client'

import { useEffect, useRef } from 'react'

interface HomeMapProps {
  variant: 'hero' | 'main'
  flyTo: [number, number] | null
}

const LOCATIONS = [
  { lat: 39.3542, lng: -94.8467, name: 'Whispering Pines Grove',  type: 'public',   rating: '4.9' },
  { lat: 39.0997, lng: -94.5786, name: 'The Meridian Rooftop',    type: 'featured', rating: '4.8' },
  { lat: 38.9717, lng: -95.2353, name: 'Clinton Lake Shoreline',  type: 'public',   rating: '4.6' },
  { lat: 39.2014, lng: -96.5716, name: 'Flint Hills Prairie',     type: 'public',   rating: '5.0' },
  { lat: 39.7684, lng: -86.1581, name: 'Indy Warehouse District', type: 'featured', rating: '4.7' },
  { lat: 38.2527, lng: -85.7585, name: 'Louisville Waterfront',   type: 'public',   rating: '4.5' },
]

export default function HomeMap({ variant, flyTo }: HomeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Capture container in a local variable so cleanup can reference it
    const container = containerRef.current

    import('leaflet').then(L => {
      // If container was removed or already has a Leaflet map, stop here
      if (!container) return
      if ((container as any)._leaflet_id) return

      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      })

      const isHero = variant === 'hero'

      const map = L.map(container, {
        zoomControl:        !isHero,
        attributionControl: !isHero,
        dragging:           !isHero,
        scrollWheelZoom:    !isHero,
      }).setView([39.5, -95.5], isHero ? 6 : 7)

      L.tileLayer(
        isHero
          ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
          : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        { maxZoom: 19, attribution: '© OpenStreetMap © CARTO' }
      ).addTo(map)

      LOCATIONS.forEach(loc => {
        const isFeatured = loc.type === 'featured'
        const size  = isHero ? (isFeatured ? 11 : 9) : (isFeatured ? 18 : 14)
        const color = isFeatured ? '#c4922a' : '#4a6741'

        const icon = L.divIcon({
          className: '',
          html: `<div style="
            width:${size}px; height:${size}px; border-radius:50%;
            background:${color}; border:2px solid white;
            box-shadow:0 2px 6px rgba(0,0,0,.35);
          "></div>`,
          iconSize:   [size, size],
          iconAnchor: [size / 2, size / 2],
        })

        const marker = L.marker([loc.lat, loc.lng], { icon }).addTo(map)

        if (!isHero) {
          const label = isFeatured ? '⭐ Featured Venue' : '● Public Location'
          marker.bindPopup(
            `<strong>${loc.name}</strong><br>
             <span style="color:#6b5f52;font-size:12px;">${label}</span><br>
             <span style="color:#c4922a;font-size:12px;">★ ${loc.rating}</span>`
          )
        }
      })

      mapRef.current = map
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [variant])

  useEffect(() => {
    if (!flyTo || !mapRef.current) return
    mapRef.current.flyTo(flyTo, 12, { duration: 1.2 })
  }, [flyTo])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
    />
  )
}