'use client'

import { useEffect, useRef, useState } from 'react'
import { getTileConfig, needsDarkFilter } from '@/lib/map-tiles'
import { getCategoryVisual } from '@/lib/map-categories'

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
  // 'recommended' triggers the featured-style pill (thumbnail +
  // "Recommended" subtitle) on the map. 'favorite' is the ordinary
  // numbered dot every other portfolio spot gets.
  type: 'favorite' | 'recommended' | 'secret'
  // Category powers the Google-Maps-style icon (colored circle +
  // emoji) that replaces the plain numbered dot once the client
  // zooms in past ZOOM_THRESHOLD_ICONS. Optional — an unrecognized
  // or missing category falls back to tag-based inference (see
  // lib/map-categories.ts) or the default pin icon.
  category?: string | null
  // Tags used to infer a category visual when `category` is null
  // or unrecognized — most seeded rows have no category set. The
  // matcher scans for keywords ("Waterfall", "Sunrise", "Historic",
  // etc.) and picks the closest fit.
  tags?: string[] | null
  // First photo (portfolio own upload preferred, source-location
  // photo otherwise). Used for the "Recommended" thumbnail — the
  // pin drops back to a name-only pill if there's no photo.
  photoUrl?: string | null
}

// Once the client zooms in past this level the plain numbered dots
// swap to Google-Maps-style category icons (colored circle + emoji)
// so parks / urban / waterfront reads at a glance. Same threshold
// the Explore map uses so both maps behave consistently.
const ZOOM_THRESHOLD_ICONS = 14

interface ClientMapProps {
  locations: ClientLocation[]
  activeId: number | null
  chosenIds: Array<number | string>
  disabledIds?: Array<number | string>
  onMarkerClick: (id: number) => void
  /** Set false while the container is hidden (e.g. mobile map toggle). When it
   *  flips back to true we run invalidateSize + re-fit so the map shows the
   *  full pin spread instead of the Kansas City fallback center. */
  visible?: boolean
}

export default function ClientMap({
  locations,
  activeId,
  chosenIds,
  disabledIds = [],
  onMarkerClick,
  visible = true,
}: ClientMapProps) {
  const chosenSet   = new Set(chosenIds.map(String))
  const disabledSet = new Set(disabledIds.map(String))
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<any>(null)
  const markersRef   = useRef<Record<number, any>>({})
  const didInitialFitRef = useRef(false)
  // Which "icon tier" the markers are currently drawn at. Flips
  // when the map crosses ZOOM_THRESHOLD_ICONS so the marker-render
  // effect knows to rebuild the divIcons with category emojis
  // instead of numbered dots (and back). Held in state so the
  // effect re-runs; we throttle the flip via the zoom handler
  // below so mid-animation zooms don't thrash marker DOM.
  const [iconTier, setIconTier] = useState<'wide' | 'close'>('wide')
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

      // attributionControl:false here — we add our own at bottomleft below so
      // the default bottom-right placement doesn't tuck up under the
      // "View List" pill on mobile.
      const map = L.map(container, { zoomControl: false, attributionControl: false })
        .setView([39.09, -94.58], 11)

      // Basemap via lib/map-tiles.ts — Stadia Alidade Smooth Dark
      // when the key is set (a proper dark tileset), OSM standard
      // + CSS invert filter as a fallback.
      const tiles = getTileConfig('dark')
      L.tileLayer(tiles.url, { maxZoom: tiles.maxZoom, attribution: tiles.attribution }).addTo(map)
      if (needsDarkFilter('dark')) {
        const tilePane = map.getPane('tilePane')
        if (tilePane) tilePane.style.filter = 'invert(1) hue-rotate(180deg) brightness(.95) contrast(.9)'
      }

      L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map)
      L.control.zoom({ position: 'bottomright' }).addTo(map)

      // Flip iconTier on zoomend when the zoom crosses
      // ZOOM_THRESHOLD_ICONS. Using zoomend (not zoom) keeps the
      // rebuild off the animation frame — mid-zoom the pins hold
      // their old shape, then swap in one hop when the animation
      // settles. That's smoother than rebuilding the divIcon HTML
      // on every intermediate zoom level.
      map.on('zoomend', () => {
        setIconTier(map.getZoom() >= ZOOM_THRESHOLD_ICONS ? 'close' : 'wide')
      })

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

  // ── Fit bounds when the map is ready, visible, and locations are loaded ──
  //
  // Three things race: leaflet's dynamic import, the /api/pick-data fetch,
  // and on mobile the map container going from display:none → display:block
  // when the user taps "View Map". This effect waits on all three and then
  // fits the bounds exactly once, so clients land on a view that shows every
  // pin instead of the fallback center.
  //
  // Including `visible` in deps is the mobile piece: React re-runs the effect
  // when the parent flips the flag, we call invalidateSize so leaflet notices
  // the container just gained a box, and then fitBounds with the real
  // viewport.
  useEffect(() => {
    if (!visible || !mapReady || !mapRef.current) return
    if (didInitialFitRef.current) return
    const map = mapRef.current
    const valid = locations.filter(l => isFiniteLatLng(l.lat, l.lng))
    if (valid.length === 0) return

    import('leaflet').then(L => {
      // Give the browser a frame so layout settles after display:none → block.
      requestAnimationFrame(() => {
        if (didInitialFitRef.current) return
        map.invalidateSize()
        if (!mapHasSize(map)) return
        const bounds = L.latLngBounds(valid.map(l => [l.lat, l.lng] as [number, number]))
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15, animate: true })
        didInitialFitRef.current = true
      })
    })
  }, [visible, mapReady, locations])

  // ── Redraw markers ─────────────────────────────────────────────────────────
  // Including `mapReady` in deps is load-bearing: when `locations` arrive
  // before leaflet's dynamic import resolves, this effect would otherwise
  // skip (mapRef.current is still null) and never re-run, leaving the map
  // blank until some other state change (like a marker click) forced it.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return

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
        // Recommended pins with a photo get the Explore-style
        // featured pill (thumbnail + name + "Recommended" subtitle).
        // Without a photo we fall back to the plain-dot render so a
        // photographer who hasn't uploaded photos to their recommended
        // spot doesn't end up with a broken image.
        const showRecPill = isRec && !!loc.photoUrl && !isChosen && !isActive
        // Close-zoom category icon (colored circle + emoji) replaces
        // the plain numbered dot once the client zooms in. Chosen /
        // active pins keep the accent-colored dot so the current
        // selection stays visually obvious regardless of zoom.
        const showCatIcon = iconTier === 'close' && !isChosen && !isActive && !isDisabled && !showRecPill

        const labelText = escapeHtml(loc.name)

        let html: string
        let iconW: number
        let iconH: number
        let anchorX: number
        let anchorY: number

        if (showRecPill) {
          // Featured-style pill — mirrors the Explore map's featured
          // pin so photographers' recommended picks read the same way
          // on both surfaces. Gold "Recommended" subtitle sits under
          // the location name.
          const thumb = escapeHtml(loc.photoUrl!)
          html = `<span class="pick-map-label-inner">
            <img class="pick-map-label-thumb" src="${thumb}" alt="" loading="lazy" />
            <span class="pick-map-label-text">
              <span class="pick-map-label-name">${labelText}</span>
              <span class="pick-map-label-sub">Recommended</span>
            </span>
          </span>`
          iconW = 240; iconH = 52
          anchorX = 26; anchorY = 26
        } else if (showCatIcon) {
          // Colored circle + category emoji, with the name label
          // beside it (same layout as the numbered-dot render so the
          // list-order badge and the icon occupy the same footprint).
          const visual = getCategoryVisual(loc.category, loc.access, loc.tags)
          html = `<div style="display:flex;align-items:center;gap:6px;">
            <span class="pick-map-cat-icon-inner" style="background:${visual.color}">${visual.emoji}</span>
            <div style="
              max-width:180px; padding:3px 8px; border-radius:6px;
              background:rgba(26,22,18,.88); color:white;
              font-family:var(--font-dm-sans), sans-serif;
              font-size:11px; font-weight:600;
              white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
              box-shadow:0 2px 6px rgba(0,0,0,.3);
              line-height:1.25;
            ">${labelText}</div>
          </div>`
          iconW = 30 + 6 + 180
          iconH = 30
          anchorX = 15
          anchorY = 15
        } else {
          // Ordinary numbered dot + name label — same shape the map
          // has always used, so chosen / active / disabled states
          // keep their existing accent colors.
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

          const labelBg   = isChosen ? '#4a6741' : isActive ? '#c4922a' : isDisabled ? 'rgba(26,22,18,.35)' : 'rgba(26,22,18,.88)'
          const labelFg   = isActive && !isChosen ? '#1a1612' : 'white'
          const totalW    = size + 8 + 180
          const dotOpacity = isDisabled ? 0.55 : 1

          html = `<div style="display:flex;align-items:center;gap:6px;transition:all .25s;opacity:${dotOpacity};">
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
          </div>`
          iconW = totalW
          iconH = size
          anchorX = size / 2
          anchorY = size / 2
        }

        const marker = L.marker([loc.lat, loc.lng], {
          icon: L.divIcon({
            className: showRecPill ? 'pick-map-label pick-map-label-recommended' : '',
            html,
            iconSize:   [iconW, iconH],
            iconAnchor: [anchorX, anchorY],
          }),
          zIndexOffset: showRecPill ? 800 : (isActive || isChosen ? 1000 : 0),
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
  }, [mapReady, locations, activeId, chosenIds, disabledIds, onMarkerClick, iconTier]) // eslint-disable-line react-hooks/exhaustive-deps

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