'use client'

import { useEffect, useRef } from 'react'

// Leaflet throws "Invalid LatLng object: (NaN, NaN)" when flyTo/setView run while the
// map container has zero width/height — which happens on mobile because the map column
// is hidden until the user taps "View Map". These guards skip those calls until the
// container is real and the coordinates are actually numbers.
function mapHasSize(map: any): boolean {
  if (!map) return false
  try {
    const size = map.getSize()
    return size.x > 0 && size.y > 0
  } catch { return false }
}
function isFiniteLatLng(lat: any, lng: any): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng)
}

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
  // The signed-in photographer's saved home city (from profile preferences).
  // When set, the map opens centered on it at city zoom. When null we fall
  // back to a USA-wide view instead of the old St-Joseph default — much
  // better for users who haven't told us where they shoot yet.
  homeLocation: { lat: number; lng: number } | null
  onMarkerClick: (id: number) => void
}

// USA-wide framing — center of the contiguous 48, zoomed out enough to show
// roughly Maine to LA without spilling into Mexico/Canada at common viewport
// widths. Used when no home city is saved.
const USA_VIEW = { center: [39.5, -98.5] as [number, number], zoom: 4 }
const HOME_CITY_ZOOM = 11

export default function ExploreMap({
  locations,
  activeId,
  userLocation,
  homeLocation,
  onMarkerClick,
}: ExploreMapProps) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<any>(null)
  const markersRef    = useRef<Record<number, any>>({})
  const userMarkerRef = useRef<any>(null)
  // Whether the initial view has already been applied. Without this guard,
  // the home-location effect below would re-center the map every time the
  // photographer pans away — annoying instead of helpful.
  const initialViewApplied = useRef(false)

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

      // Open on the home city when we already know it, otherwise the
      // USA-wide fallback. The home-location effect below also handles the
      // case where the profile preferences arrive after the map has mounted
      // (async load).
      const initial = homeLocation && isFiniteLatLng(homeLocation.lat, homeLocation.lng)
        ? { center: [homeLocation.lat, homeLocation.lng] as [number, number], zoom: HOME_CITY_ZOOM }
        : USA_VIEW
      const map = L.map(container, {
        zoomControl: false,
        // Render markers + vector layers to a single canvas instead of
        // a DOM element each. With ~700 markers, the previous divIcon
        // approach created 700 HTML elements that the browser had to
        // reposition every frame of zoom. canvas rendering pushes all
        // of them to the GPU as one layer.
        preferCanvas: true,
      }).setView(initial.center, initial.zoom)
      if (homeLocation) initialViewApplied.current = true

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
    // homeLocation is intentionally read once at mount — see the dedicated
    // effect below for the late-arriving case.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Apply home city when profile prefs load after the map mounts ──────────
  useEffect(() => {
    if (initialViewApplied.current) return
    if (!mapRef.current || !homeLocation) return
    if (!mapHasSize(mapRef.current)) return
    if (!isFiniteLatLng(homeLocation.lat, homeLocation.lng)) return
    mapRef.current.setView([homeLocation.lat, homeLocation.lng], HOME_CITY_ZOOM)
    initialViewApplied.current = true
  }, [homeLocation])

  // ── Fly to user location when it arrives ──────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !userLocation) return
    if (!mapHasSize(mapRef.current)) return
    if (!isFiniteLatLng(userLocation.lat, userLocation.lng)) return
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
        if (!isFiniteLatLng(loc.lat, loc.lng)) return
        const isActive = activeId === loc.id
        const color    = loc.access === 'private' ? '#b54b2a' : '#4a6741'
        const fill     = isActive ? '#c4922a' : color

        // CircleMarker renders to the map's preferred renderer (canvas
        // here), so 700 markers stay smooth during pan + zoom — the
        // earlier divIcon version ran 700 separate DOM repositions per
        // frame and choked. The visual is essentially the same: a
        // colored circle with a white outline; active markers grow +
        // turn gold. The previous CSS box-shadow can't cross from DOM
        // to canvas, but the size + color difference still reads as
        // "this one is selected".
        const marker = L.circleMarker([loc.lat, loc.lng], {
          radius:      isActive ? 10 : 6,
          fillColor:   fill,
          color:       'white',
          weight:      isActive ? 3 : 2,
          fillOpacity: 1,
          opacity:     1,
        }).addTo(map)

        marker.on('click', () => onMarkerClick(loc.id))
        marker.bindPopup(
          `<strong>${loc.name}</strong><br>
           <span style="color:#6b5f52;font-size:12px;">📍 ${loc.city}</span><br>
           <span style="color:#c4922a;font-size:12px;">★ ${loc.rating}</span>`
        )
        if (isActive) marker.bringToFront()

        markersRef.current[loc.id] = marker
      })
    })
  }, [locations, activeId, onMarkerClick])

  // ── Fly to active location when sidebar card is clicked ───────────────────
  useEffect(() => {
    if (!mapRef.current || !activeId) return
    if (!mapHasSize(mapRef.current)) return
    const loc = locations.find(l => l.id === activeId)
    if (!loc || !isFiniteLatLng(loc.lat, loc.lng)) return
    mapRef.current.flyTo([loc.lat, loc.lng], 14, { duration: 0.8 })
  }, [activeId, locations])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}