'use client'

import { useEffect, useRef, useState } from 'react'

// Leaflet throws "Invalid LatLng object: (NaN, NaN)" when flyTo/setView/fitBounds
// run while the map container has zero width/height. On mobile the map column is
// hidden until the user taps "View Map", so these guards skip the calls in that
// state and on any row missing real coordinates.
function mapHasSize(map: any): boolean {
  if (!map) return false
  try { const s = map.getSize(); return s.x > 0 && s.y > 0 } catch { return false }
}
function isFiniteLatLng(lat: any, lng: any): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng)
}
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
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
}

interface ClientMapProps {
  locations: ClientLocation[]
  activeId: number | null
  chosenIds: Array<number | string>
  disabledIds?: Array<number | string>
  onMarkerClick: (id: number) => void
}

export default function ClientMap({
  locations,
  activeId,
  chosenIds,
  disabledIds = [],
  onMarkerClick,
}: ClientMapProps) {
  const chosenSet   = new Set(chosenIds.map(String))
  const disabledSet = new Set(disabledIds.map(String))
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<any>(null)
  const markersRef   = useRef<Record<number, any>>({})
  const didInitialFitRef = useRef(false)
  // React state (not ref) so the fit-bounds effect below re-runs when the
  // leaflet dynamic import resolves. Using a ref here would miss the transition
  // and leave the map parked on the fallback center.
  const [mapReady, setMapReady] = useState(false)

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
      setMapReady(true)
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      setMapReady(false)
      didInitialFitRef.current = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fit bounds when the map is ready, has size, and locations are loaded ──
  //
  // Three things race on this page: the leaflet dynamic import, the
  // /api/pick-data fetch, and on mobile the map container going from
  // `display:none` to `display:block` when the user taps "View Map". This
  // effect waits for all three and then fits the bounds exactly once, which
  // is what makes clients land on a view that shows every pin.
  //
  // The ResizeObserver is the mobile piece: `display:none` → block leaves
  // leaflet sized 0×0 until the container actually gains dimensions, so we
  // re-trigger on the first real size event and also call `invalidateSize`
  // so tiles render against the correct viewport.
  useEffect(() => {
    if (!mapReady || !mapRef.current || !containerRef.current) return
    const map = mapRef.current
    const valid = locations.filter(l => isFiniteLatLng(l.lat, l.lng))
    if (valid.length === 0) return

    function attemptFit() {
      if (didInitialFitRef.current) return
      if (!mapHasSize(map)) return
      import('leaflet').then(L => {
        map.invalidateSize()
        const bounds = L.latLngBounds(valid.map(l => [l.lat, l.lng] as [number, number]))
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15, animate: true })
        didInitialFitRef.current = true
      })
    }

    attemptFit()
    if (didInitialFitRef.current) return

    // Container might be 0×0 right now (hidden on mobile). Watch for the
    // transition to non-zero and re-try.
    const ro = new ResizeObserver(() => attemptFit())
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [mapReady, locations])

  // ── Redraw markers ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return

    import('leaflet').then(L => {
      const map = mapRef.current
      if (!map) return

      Object.values(markersRef.current).forEach((m: any) => map.removeLayer(m))
      markersRef.current = {}

      locations.forEach((loc, i) => {
        if (!isFiniteLatLng(loc.lat, loc.lng)) return
        const isActive   = activeId === loc.id
        const isChosen   = chosenSet.has(String(loc.id))
        const isDisabled = !isChosen && disabledSet.has(String(loc.id))
        const isRec      = loc.type === 'recommended'

        let bg     = isRec ? 'rgba(61,110,140,0.95)' : 'rgba(245,240,232,0.95)'
        let color  = isRec ? 'white' : '#1a1612'
        let size   = 28
        let border = '2.5px solid white'

        if (isChosen) {
          bg = '#4a6741'; color = 'white'; size = 32; border = '3px solid white'
        } else if (isActive) {
          bg = '#c4922a'; color = '#1a1612'; size = 32; border = '3px solid white'
        } else if (isDisabled) {
          bg = 'rgba(180,175,165,.7)'; color = '#6b5f52'; border = '2px solid rgba(255,255,255,.6)'
        }

        // Name label sits to the right of the numbered dot so clients can scan
        // the map without having to tap every marker. Icon anchor keeps the dot
        // centered on the actual coordinate.
        const labelText = escapeHtml(loc.name)
        const labelBg   = isChosen ? '#4a6741' : isActive ? '#c4922a' : isDisabled ? 'rgba(26,22,18,.35)' : 'rgba(26,22,18,.88)'
        const labelFg   = isActive && !isChosen ? '#1a1612' : 'white'
        const totalW    = size + 8 + 180   // dot + gap + max label width
        const dotOpacity = isDisabled ? 0.55 : 1

        const marker = L.marker([loc.lat, loc.lng], {
          icon: L.divIcon({
            className: '',
            html: `<div style="display:flex;align-items:center;gap:6px;transition:all .25s;opacity:${dotOpacity};">
              <div style="
                width:${size}px; height:${size}px; border-radius:50%;
                background:${bg}; border:${border};
                box-shadow:0 3px 10px rgba(0,0,0,.4);
                display:flex; align-items:center; justify-content:center;
                font-size:12px; font-weight:700; color:${color};
                flex-shrink:0;
              ">${isChosen ? '✓' : i + 1}</div>
              <div style="
                max-width:180px; padding:3px 8px; border-radius:6px;
                background:${labelBg}; color:${labelFg};
                font-family:var(--font-dm-sans), sans-serif;
                font-size:11px; font-weight:600;
                white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
                box-shadow:0 2px 6px rgba(0,0,0,.3);
                line-height:1.25;
              ">${labelText}</div>
            </div>`,
            iconSize:   [totalW, size],
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
  }, [locations, activeId, chosenIds, disabledIds, onMarkerClick]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fly to active location ─────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !activeId) return
    if (!mapHasSize(mapRef.current)) return
    const loc = locations.find(l => l.id === activeId)
    if (!loc || !isFiniteLatLng(loc.lat, loc.lng)) return
    mapRef.current.flyTo([loc.lat, loc.lng], 14, { duration: 0.8 })
  }, [activeId, locations])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}