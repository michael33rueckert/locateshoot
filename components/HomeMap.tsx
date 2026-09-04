'use client'

import { useEffect, useRef } from 'react'
import { Map as MLMap, NavigationControl, Popup, setWorkerCount } from 'maplibre-gl'

// See ExploreMap.tsx for context — forces main-thread tile
// processing so the map isn't stalled by Turbopack's failure
// to serve the off-main-thread worker script.
if (typeof window !== 'undefined') {
  try { setWorkerCount(0) } catch { /* older maplibre — no-op */ }
}
import { getVectorStyle } from '@/lib/map-tiles'

// ── HomeMap (WebGL, MapLibre GL JS) ─────────────────────────────────
//
// Landing-page decorative map. Same MapLibre engine + Stadia
// Alidade Smooth style used by ExploreMap so the whole app is on
// one map stack now.
//
// Hero variant = the background layer behind the marketing hero:
// dark style, non-interactive, no controls. Main variant = a
// standard interactive map with popups on the sample locations.

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
  const mapRef       = useRef<MLMap | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const isHero = variant === 'hero'

    const map = new MLMap({
      container: containerRef.current,
      style: getVectorStyle(isHero ? 'dark' : 'light'),
      center: [-95.5, 39.5],
      zoom: isHero ? 6 : 7,
      interactive: !isHero,
      // Hero background — no attribution or zoom controls.
      attributionControl: isHero ? false : { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    })
    mapRef.current = map
    if (!isHero) {
      map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
    }

    map.on('load', () => {
      const features: GeoJSON.Feature[] = LOCATIONS.map(loc => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [loc.lng, loc.lat] },
        properties: {
          name:   loc.name,
          rating: loc.rating,
          featured: loc.type === 'featured',
        },
      }))
      map.addSource('home-locations', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
      })

      // Colored circles. Featured spots are gold + larger; public
      // are sage green + smaller. Hero variant scales down since
      // the map is decorative background, not a focus.
      map.addLayer({
        id: 'home-points',
        type: 'circle',
        source: 'home-locations',
        paint: {
          'circle-color': [
            'case', ['get', 'featured'], '#c4922a', '#4a6741',
          ],
          'circle-radius': isHero
            ? ['case', ['get', 'featured'], 6, 5]
            : ['case', ['get', 'featured'], 10, 8],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })

      // Popups on the main variant only.
      if (!isHero) {
        map.on('click', 'home-points', (e: any) => {
          const feat = e.features?.[0]
          if (!feat) return
          const { name, rating, featured } = feat.properties
          const label = featured ? '⭐ Featured Venue' : '● Public Location'
          new Popup({ offset: 12 })
            .setLngLat((feat.geometry as GeoJSON.Point).coordinates as [number, number])
            .setHTML(`
              <strong>${name}</strong><br>
              <span style="color:#6b5f52;font-size:12px;">${label}</span><br>
              <span style="color:#c4922a;font-size:12px;">★ ${rating}</span>
            `)
            .addTo(map)
        })
        map.on('mouseenter', 'home-points', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'home-points', () => { map.getCanvas().style.cursor = '' })
      }
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [variant])

  // Fly to a passed-in [lat, lng] (called from the marketing page's
  // "See a location" CTA). MapLibre uses [lng, lat] so the input
  // pair is swapped at the boundary.
  useEffect(() => {
    if (!flyTo || !mapRef.current) return
    mapRef.current.flyTo({ center: [flyTo[1], flyTo[0]], zoom: 12, duration: 1200 })
  }, [flyTo])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
