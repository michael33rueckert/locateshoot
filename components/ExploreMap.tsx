'use client'

import { useEffect, useRef } from 'react'
import { getTileConfig } from '@/lib/map-tiles'
import { getCategoryVisual } from '@/lib/map-categories'

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
  // Location's category label (e.g. 'Parks & Nature'). Drives the
  // Google-Maps-style icon overlay at close zoom — see
  // lib/map-categories.ts for the icon+color mapping. Missing /
  // unrecognized values fall back to a neutral pin icon.
  category?: string | null
  // Per-location label rendering — admin picks in LocationEditModal:
  //   'dot'       → circle only, no label at any zoom (default)
  //   'name'      → circle + text label appears at zoom >= 13
  //   'featured'  → circle + text label + tiny image thumb, zoom >= 11
  //   'portfolio' → same shape as 'featured' but with a gold ring +
  //                 badge marking it as one of THIS user's own spots
  // Undefined behaves like 'dot' to stay backward-compat with any
  // caller that hasn't populated the field yet.
  mapDisplayMode?: 'dot' | 'name' | 'featured' | 'portfolio'
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
  // Optional lookup of location_id → first photo URL. Used to render the
  // tiny image thumb inside 'featured' labels. Missing entries fall back
  // to a name-only label.
  photoMap?: Record<string, string>
  onMarkerClick: (id: number) => void
  // Fires on Leaflet's moveend (pan or zoom finished). Parent uses this to
  // decide whether to show a "Search this area" button. Debounced to
  // moveend so we don't fire on every intermediate frame during a pan.
  onMapMove?: (center: { lat: number; lng: number }, zoom: number) => void
}

// USA-wide framing — center of the contiguous 48, zoomed out enough to show
// roughly Maine to LA without spilling into Mexico/Canada at common viewport
// widths. Used when no home city is saved.
const USA_VIEW = { center: [39.5, -98.5] as [number, number], zoom: 4 }
const HOME_CITY_ZOOM = 11

// Per-mode zoom thresholds. Featured labels light up earlier
// (roughly city zoom) so the admin's hand-picked spots appear from
// further out; name-only labels wait until the map is zoomed in
// far enough that the density is manageable.
const ZOOM_THRESHOLD_NAME     = 13
const ZOOM_THRESHOLD_FEATURED = 11
// Google-Maps-style rich category icons (green tree for parks,
// blue building for urban, etc.) appear once the map is zoomed in
// past a comfortable neighborhood view. Below this every dot pin
// is a plain colored circle for the calm wide-zoom look. Only
// pins CURRENTLY in the viewport get an icon overlay — panning
// keeps the DOM count bounded.
const ZOOM_THRESHOLD_ICONS    = 13

// Options passed to marker.bindTooltip on label activation. Kept
// as a module-level constant so the shape is stable across binds
// and doesn't allocate a new object per marker per zoom event. The
// name variant is text-only; featured swaps in HTML with a thumb.
const LABEL_OPTS_NAME = {
  permanent:   true,
  direction:   'top' as const,
  offset:      [0, -8] as [number, number],
  className:   'explore-map-label',
  interactive: true,
}
const LABEL_OPTS_FEATURED = {
  permanent:   true,
  direction:   'top' as const,
  offset:      [0, -8] as [number, number],
  className:   'explore-map-label explore-map-label-featured',
  interactive: true,
}
const LABEL_OPTS_PORTFOLIO = {
  permanent:   true,
  direction:   'top' as const,
  offset:      [0, -8] as [number, number],
  // Portfolio pins share the featured pill shape but add a class
  // for the gold-ring + badge treatment defined in globals.css.
  className:   'explore-map-label explore-map-label-featured explore-map-label-portfolio',
  interactive: true,
}
// Hover tooltip — bound to every 'dot' marker (and used as a
// fallback for name/featured markers when they're below their
// zoom threshold). Non-permanent, so it only shows while the
// pointer is over the marker; no DOM created until then.
const LABEL_OPTS_HOVER = {
  permanent:   false,
  direction:   'top' as const,
  offset:      [0, -8] as [number, number],
  className:   'explore-map-label',
  sticky:      false,
}

// Guard on the URL we drop into the tooltip HTML — Leaflet passes
// the string straight through to innerHTML, so a malformed value
// could break out of the src attribute.
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export default function ExploreMap({
  locations,
  activeId,
  userLocation,
  homeLocation,
  photoMap,
  onMarkerClick,
  onMapMove,
}: ExploreMapProps) {
  // Held in a ref so the label-applier reads the latest photo map
  // without needing to re-run the marker-refresh useEffect when
  // photos stream in (they load async as the sidebar scrolls).
  const photoMapRef = useRef<Record<string, string>>(photoMap ?? {})
  useEffect(() => {
    photoMapRef.current = photoMap ?? {}
    // A featured pin may have been rendered as name-only because its
    // thumb hadn't loaded yet. When photoMap grows (either from the
    // bulk location_photos query or the viewport-driven Google Places
    // fetches), re-run the applier so any pin that just gained a
    // thumb switches from 'name' → 'featured' shape.
    applyLabelsForCurrentZoomRef.current?.()
  }, [photoMap])
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<any>(null)
  const markersRef    = useRef<Record<number, any>>({})
  const userMarkerRef = useRef<any>(null)
  // Keep the onMapMove callback in a ref so the moveend handler always
  // sees the latest one without needing to detach/reattach when the
  // parent passes a new closure.
  const onMapMoveRef  = useRef(onMapMove)
  useEffect(() => { onMapMoveRef.current = onMapMove }, [onMapMove])
  // Whether the initial view has already been applied. Without this guard,
  // the home-location effect below would re-center the map every time the
  // photographer pans away — annoying instead of helpful.
  const initialViewApplied = useRef(false)
  // Applier ref — the marker-refresh useEffect calls this after
  // rebuilding markers so per-marker labels get bound/unbound to
  // match current zoom without re-running the init useEffect. The
  // applier itself walks every marker each zoomend since bind state
  // is now per-marker (mode + zoom combo).
  const applyLabelsForCurrentZoomRef = useRef<(() => void) | null>(null)
  // Category-icon overlay layer — keyed by pin id. At zoom >=
  // ZOOM_THRESHOLD_ICONS we add a DivIcon marker per dot-mode pin
  // in the viewport that draws a colored-circle-with-emoji icon
  // (Google Maps style). At wider zoom or off-viewport, the entry
  // is removed. applyCategoryIcons handles the sync; ref lets the
  // marker-refresh useEffect trigger it after the underlying
  // CircleMarkers get rebuilt.
  const iconOverlaysRef            = useRef<Record<string, any>>({})
  const applyCategoryIconsRef      = useRef<(() => void) | null>(null)

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
        // Whole-level zoom snap — fractional levels (0.25) forced
        // Leaflet to redraw tiles at intermediate scales and
        // reproject markers more often, which was hurting mobile.
        // Sticking with 1 lets the compositor own the in-between
        // animation with a single transform on the tile pane.
        zoomSnap: 1,
        // Half-step +/- buttons still feel finer than default
        // (which was 1) without paying the fractional-tile cost.
        zoomDelta: 0.5,
        // Slower wheel-per-zoom-level = smoother trackpad + mouse
        // wheel zoom. Default is 60; 120 nearly halves the zoom
        // speed and reads as smooth on precision trackpads.
        wheelPxPerZoomLevel: 120,
        wheelDebounceTime: 40,
        // Soft bounce when hitting min/max zoom rather than a hard
        // stop — matches Google Maps' feel.
        bounceAtZoomLimits: true,
        // Markers animate their positions along with the zoom
        // instead of snapping at zoomend.
        markerZoomAnimation: true,
        // Inertia (pan-fling) — Leaflet doesn't ship pinch-zoom
        // inertia, but pan inertia here makes drag gestures feel
        // continuous with the zoom animation.
        inertia: true,
        inertiaDeceleration: 3000,
      }).setView(initial.center, initial.zoom)
      if (homeLocation) initialViewApplied.current = true

      // Basemap tiles routed through lib/map-tiles.ts — Stadia
      // Alidade Smooth when NEXT_PUBLIC_STADIA_API_KEY is set,
      // OpenStreetMap standard as a keyless fallback.
      const tiles = getTileConfig('light')
      L.tileLayer(tiles.url, { maxZoom: tiles.maxZoom, attribution: tiles.attribution }).addTo(map)

      L.control.zoom({ position: 'bottomright' }).addTo(map)

      // moveend fires after pan or zoom settles. Debounced by Leaflet
      // itself so a drag emits one event, not one per frame. onMapMove
      // is read from a ref so a caller-provided closure that changes
      // identity between renders doesn't need to re-init the map.
      map.on('moveend', () => {
        if (!onMapMoveRef.current) return
        const c = map.getCenter()
        onMapMoveRef.current({ lat: c.lat, lng: c.lng }, map.getZoom())
      })

      // Zoom-responsive label scale. Publishes --label-scale on the
      // map container; globals.css applies transform:scale(var(...))
      // to .explore-map-label-inner (a wrapper INSIDE each tooltip,
      // never on .leaflet-tooltip itself — Leaflet uses that
      // element's `transform` for pin-anchor positioning).
      //
      // Previously this ran every frame of the zoom animation via
      // 'zoom' event + rAF, which forced a style recalc on every
      // visible label per frame — the single biggest source of zoom
      // lag with ~30 in-view labels. Now the CSS var only updates
      // on zoomend, and globals.css transitions transform smoothly
      // via CSS (see .explore-map-label-inner). Result: labels
      // still animate to their new size, but the browser owns the
      // interpolation on the compositor thread instead of the main
      // thread re-computing 30 transforms per frame.
      const ZOOM_SCALE_MIN = 11
      const ZOOM_SCALE_MAX = 16
      const MIN_SCALE      = 0.55
      const MAX_SCALE      = 1
      let lastScaleWritten = ''
      const writeLabelScale = () => {
        const z = map.getZoom()
        const t = (z - ZOOM_SCALE_MIN) / (ZOOM_SCALE_MAX - ZOOM_SCALE_MIN)
        const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, MIN_SCALE + t * (MAX_SCALE - MIN_SCALE)))
        const s = clamped.toFixed(3)
        if (s === lastScaleWritten) return
        lastScaleWritten = s
        container.style.setProperty('--label-scale', s)
      }
      map.on('zoomend', writeLabelScale)
      writeLabelScale()

      // ── Pinch-zoom momentum ──
      // Google Maps-style fling: after a fast pinch release the
      // zoom keeps going briefly in the same direction, then
      // decelerates. We sample zoom on 'zoom' events during the
      // pinch, then on touchend fire ONE Leaflet setZoom call
      // toward the extrapolated target zoom. Leaflet's own
      // animation owns the interpolation — much cheaper on mobile
      // than driving setZoom every rAF frame (which was
      // reprojecting all markers 60x/second).
      let touchActive = false
      const touchStart = () => { touchActive = true }
      const touchEnd   = () => { touchActive = false; scheduleMomentum() }
      container.addEventListener('touchstart', touchStart, { passive: true })
      container.addEventListener('touchend',   touchEnd,   { passive: true })
      container.addEventListener('touchcancel', touchEnd,  { passive: true })

      // Rolling window of {t, zoom} samples from the last ~120ms
      // of pinch activity — enough resolution to estimate velocity
      // without over-weighting a single jittery frame.
      const zoomSamples: { t: number; z: number }[] = []
      const VELOCITY_WINDOW_MS = 120
      map.on('zoom', () => {
        if (!touchActive) return
        const now = performance.now()
        zoomSamples.push({ t: now, z: map.getZoom() })
        while (zoomSamples.length > 0 && now - zoomSamples[0].t > VELOCITY_WINDOW_MS) {
          zoomSamples.shift()
        }
      })

      const MOMENTUM_MS         = 350
      const MIN_VELOCITY        = 2.5    // zoom levels / second
      const MAX_MOMENTUM_DELTA  = 1.0    // don't fling farther than 1 zoom level
      const scheduleMomentum = () => {
        if (zoomSamples.length < 2) return
        const first = zoomSamples[0]
        const last  = zoomSamples[zoomSamples.length - 1]
        const dt    = (last.t - first.t) / 1000
        zoomSamples.length = 0
        if (dt <= 0) return
        const velocity = (last.z - first.z) / dt   // z per s
        if (Math.abs(velocity) < MIN_VELOCITY) return

        // Extrapolate the fling. Round to whole zoom levels since
        // zoomSnap:1 will snap to them anyway — no point paying
        // for an intermediate animate that immediately snaps.
        const rawDelta   = velocity * (MOMENTUM_MS / 1000) * 0.55
        const clamped    = Math.max(-MAX_MOMENTUM_DELTA, Math.min(MAX_MOMENTUM_DELTA, rawDelta))
        const targetZoom = Math.round(map.getZoom() + clamped)
        if (targetZoom === map.getZoom()) return

        // Single Leaflet-native animated setZoom — the tile pane
        // + markers + labels all animate together on one
        // compositor pass, no per-frame JS work.
        map.setZoom(targetZoom, { animate: true, duration: MOMENTUM_MS / 1000, easeLinearity: 0.25 })
      }

      // Google-Maps-style label reveal — labels are bound to markers
      // on-demand based on per-marker mode + current zoom. Previous
      // version bound a permanent tooltip to every marker at init,
      // which meant 700 hidden DOM nodes lived on the page all the
      // time — creation stalled the initial load and every zoom
      // animation had to reposition all of them even when invisible.
      // Dynamic bind keeps the map at zero tooltip DOM until it's
      // actually useful, and each pin honors its own mapDisplayMode:
      //   'dot'       → never labeled
      //   'name'      → labeled at zoom >= ZOOM_THRESHOLD_NAME
      //   'featured'  → labeled with thumb at ZOOM_THRESHOLD_FEATURED+
      //   'portfolio' → same as featured w/ gold ring + badge marker
      // Each marker's tooltip is chosen by (mode, zoom, has-thumb):
      //   dot mode                    → 'hover'    (non-permanent)
      //   name mode, zoom >= 13       → 'name'     (permanent, text)
      //   featured, zoom >= 11, thumb → 'featured' (permanent, img+text)
      //   featured, zoom >= 11, no thumb → 'name' fallback until the
      //     photoMap effect re-runs the applier once the thumb loads
      //   name/featured below threshold → 'hover' fallback so a mouse
      //     over on desktop can still surface the name
      // We track (__tooltipType, __tooltipHasThumb) per marker so the
      // applier only unbinds+rebinds when the desired shape actually
      // changed — cheap zoom passes over 700 markers stay flat.
      // Per-marker bind logic. Same shape it always had; extracted
      // so the split-processing scheduler below can call it for one
      // marker at a time regardless of which pass (in-view / off-view)
      // that marker landed in.
      const bindMarker = (m: any, zoom: number, pm: Record<string, string>) => {
        const mode = m.__mode as 'dot' | 'name' | 'featured' | 'portfolio'
        const name = m.__label as string
        if (!name) return

        const canShowFeatured  = mode === 'featured'  && zoom >= ZOOM_THRESHOLD_FEATURED
        const canShowPortfolio = mode === 'portfolio' && zoom >= ZOOM_THRESHOLD_FEATURED
        const canShowName      = mode === 'name'      && zoom >= ZOOM_THRESHOLD_NAME
        const thumb            = (canShowFeatured || canShowPortfolio) ? pm[String(m.__id)] : undefined
        const wantType: 'hover' | 'name' | 'featured' | 'portfolio' =
          canShowPortfolio && thumb ? 'portfolio'
          : canShowPortfolio        ? 'name'
          : canShowFeatured && thumb ? 'featured'
          : canShowFeatured          ? 'name'
          : canShowName              ? 'name'
          : 'hover'

        if (m.__tooltipType === wantType) return
        if (m.getTooltip()) m.unbindTooltip()

        if (wantType === 'portfolio') {
          m.bindTooltip(
            `<span class="explore-map-label-inner"><img class="explore-map-label-thumb" src="${escapeAttr(thumb!)}" alt="" loading="lazy" /><span class="explore-map-label-text"><span class="explore-map-label-name">${escapeText(name)}</span><span class="explore-map-label-sub">In your portfolio</span></span><span class="explore-map-label-badge" aria-hidden="true">📷</span></span>`,
            LABEL_OPTS_PORTFOLIO,
          )
        } else if (wantType === 'featured') {
          m.bindTooltip(
            `<span class="explore-map-label-inner"><img class="explore-map-label-thumb" src="${escapeAttr(thumb!)}" alt="" loading="lazy" /><span class="explore-map-label-name">${escapeText(name)}</span></span>`,
            LABEL_OPTS_FEATURED,
          )
        } else if (wantType === 'name') {
          m.bindTooltip(escapeText(name), LABEL_OPTS_NAME)
        } else {
          m.bindTooltip(escapeText(name), LABEL_OPTS_HOVER)
        }
        const tt = m.getTooltip()
        if (tt && wantType !== 'hover' && m.__onLabelClick) tt.on('click', m.__onLabelClick)
        m.__tooltipType = wantType
      }

      // Threshold-crossing lag fix. When zoom crosses the featured /
      // portfolio threshold (11) or the name threshold (13), a large
      // batch of pins flip mode at once — each bind creates a DOM
      // tooltip, and doing 50-100 of them in one frame was visibly
      // stalling the map.
      //
      // Two-pass scheduler:
      //   1. Bind every marker CURRENTLY IN THE MAP VIEWPORT
      //      synchronously. These are the ones the user actually
      //      sees, so we want them right now.
      //   2. Bind the remaining off-viewport markers in chunks of
      //      OFFVIEW_CHUNK per rAF tick. Off-viewport tooltips paint
      //      to nothing (browser cull), so binding them later is
      //      invisible. This spreads the DOM-create cost across
      //      several frames and unblocks the main thread between
      //      chunks. offviewRafId is cancelled if another zoomend
      //      arrives while we're mid-flight so we don't stack work.
      const OFFVIEW_CHUNK = 40
      let offviewRafId: number | null = null
      const applyLabelsForCurrentZoom = () => {
        const zoom = map.getZoom()
        const pm   = photoMapRef.current
        const bounds = map.getBounds()

        // Cancel any deferred off-view work still in flight — the
        // fresh call will restart it with current zoom state.
        if (offviewRafId !== null) { cancelAnimationFrame(offviewRafId); offviewRafId = null }

        const offView: any[] = []
        for (const m of Object.values(markersRef.current) as any[]) {
          if (bounds.contains(m.getLatLng())) bindMarker(m, zoom, pm)
          else                                 offView.push(m)
        }

        if (offView.length === 0) return
        let cursor = 0
        const step = () => {
          offviewRafId = null
          const end = Math.min(cursor + OFFVIEW_CHUNK, offView.length)
          for (; cursor < end; cursor++) bindMarker(offView[cursor], zoom, pm)
          if (cursor < offView.length) offviewRafId = requestAnimationFrame(step)
        }
        offviewRafId = requestAnimationFrame(step)
      }
      applyLabelsForCurrentZoomRef.current = applyLabelsForCurrentZoom
      map.on('zoomend', applyLabelsForCurrentZoom)
      applyLabelsForCurrentZoom()

      // Category-icon overlay sync. At zoom >= ZOOM_THRESHOLD_ICONS
      // every dot-mode pin currently in the viewport gets a DivIcon
      // marker overlay (colored circle + emoji, Google-Maps-style).
      // Below the threshold, or when a pin leaves the viewport, the
      // overlay is removed. The underlying CircleMarker is faded to
      // opacity 0 when its icon is showing so we don't get a
      // colored dot peeking out from under the pill.
      //
      // Perf notes:
      //   1. Coalesced via rAF — Leaflet fires zoomend AND moveend
      //      per zoom (zooming moves the map), and moveend fires per
      //      pan segment. Without coalescing every pan/zoom did the
      //      full walk twice back-to-back.
      //   2. Add pass is CHUNKED across rAF frames. Threshold-
      //      crossing at dense metro zoom bound ~100 overlays
      //      synchronously — visible stall. Now we bind
      //      SYNC_BUDGET the first frame, defer the rest.
      //   3. Any newly-scheduled apply cancels an in-flight chunk
      //      loop so a fast wheel-zoom that lands somewhere else
      //      doesn't keep painting stale overlays.
      const ICON_CHUNK   = 30
      let iconAddRafId: number | null = null
      let iconApplyRafId: number | null = null
      const applyCategoryIconsImpl = () => {
        iconApplyRafId = null
        const zoom = map.getZoom()
        const bounds = map.getBounds()
        const showIcons = zoom >= ZOOM_THRESHOLD_ICONS

        // Cancel any deferred add-chunk work still in flight — this
        // pass sets fresh state; the leftover chunks would be stale.
        if (iconAddRafId !== null) { cancelAnimationFrame(iconAddRafId); iconAddRafId = null }

        // First pass — remove overlays that no longer belong. A pin
        // needs its overlay gone when: zoom dropped below threshold,
        // pin left the viewport, its mode is no longer 'dot', or the
        // underlying marker has been rebuilt (missing from
        // markersRef).
        for (const [id, overlay] of Object.entries(iconOverlaysRef.current)) {
          const m = markersRef.current[id as any] as any
          const keep = showIcons
            && m
            && m.__mode === 'dot'
            && bounds.contains(m.getLatLng())
          if (!keep) {
            map.removeLayer(overlay as any)
            delete iconOverlaysRef.current[id]
            // Restore the CircleMarker underneath (only when it
            // still exists — during a marker rebuild the CircleMarker
            // might be gone too).
            if (m && typeof m.setStyle === 'function') m.setStyle({ opacity: 1, fillOpacity: 1 })
          }
        }
        if (!showIcons) return

        // Collect the pins that need overlays added.
        const toAdd: [string, any][] = []
        for (const [id, m] of Object.entries(markersRef.current) as [string, any][]) {
          if (m.__mode !== 'dot') continue
          if (iconOverlaysRef.current[id]) continue
          if (!bounds.contains(m.getLatLng())) continue
          toAdd.push([id, m])
        }
        if (toAdd.length === 0) return

        const addOne = ([id, m]: [string, any]) => {
          if (iconOverlaysRef.current[id]) return
          const visual = getCategoryVisual(m.__category, m.__access, m.__tags)
          const overlay = L.marker(m.getLatLng(), {
            icon: L.divIcon({
              className: 'explore-map-cat-icon',
              html: `<span class="explore-map-cat-icon-inner" style="background:${visual.color}">${visual.emoji}</span>`,
              iconSize:   [30, 30],
              iconAnchor: [15, 15],
            }),
            interactive:  true,
            keyboard:     false,
            riseOnHover:  true,
            // Assemble at zIndex that puts the icon above the
            // CircleMarker but below any tooltip/label pill.
            zIndexOffset: 100,
          }).addTo(map)
          const onClick = m.__onLabelClick
          if (onClick) overlay.on('click', onClick)
          iconOverlaysRef.current[id] = overlay
          // Hide the CircleMarker below the icon so we don't get a
          // colored dot peeking out from the sides.
          m.setStyle({ opacity: 0, fillOpacity: 0 })
        }

        // Bind up to ICON_CHUNK overlays right away so the visible
        // pins swap immediately after zoom settles. Anything past
        // that gets deferred across successive rAF frames to keep
        // any one frame from stalling.
        const firstEnd = Math.min(ICON_CHUNK, toAdd.length)
        for (let i = 0; i < firstEnd; i++) addOne(toAdd[i])
        if (firstEnd >= toAdd.length) return
        let cursor = firstEnd
        const step = () => {
          iconAddRafId = null
          const end = Math.min(cursor + ICON_CHUNK, toAdd.length)
          for (; cursor < end; cursor++) addOne(toAdd[cursor])
          if (cursor < toAdd.length) iconAddRafId = requestAnimationFrame(step)
        }
        iconAddRafId = requestAnimationFrame(step)
      }
      const scheduleApplyCategoryIcons = () => {
        if (iconApplyRafId !== null) return
        iconApplyRafId = requestAnimationFrame(applyCategoryIconsImpl)
      }
      applyCategoryIconsRef.current = scheduleApplyCategoryIcons
      // moveend alone covers both cases — Leaflet fires it after zoom
      // AND after pan. Listening on zoomend too would just double-fire
      // per zoom event (the rAF guard would coalesce them, but we
      // save the redundant scheduling entirely by not binding both).
      map.on('moveend', scheduleApplyCategoryIcons)
      scheduleApplyCategoryIcons()

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
  // setView (not flyTo): flyTo animates over 1.2s and Leaflet has
  // to reproject ~700 markers every frame during the fly, which
  // was the perf hit users reported as "search lags the map".
  // setView with animate:true does a linear pan/zoom in ~0.5s and
  // avoids flyTo's zoom-out-then-zoom-in path (which crosses many
  // extra tile boundaries and marker positions along the way).
  useEffect(() => {
    if (!mapRef.current || !userLocation) return
    if (!mapHasSize(mapRef.current)) return
    if (!isFiniteLatLng(userLocation.lat, userLocation.lng)) return
    mapRef.current.setView(
      [userLocation.lat, userLocation.lng],
      13,
      { animate: true, duration: 0.5, easeLinearity: 0.25 },
    )
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

        const onClick = () => onMarkerClick(loc.id)
        marker.on('click', onClick)
        marker.bindPopup(
          `<strong>${loc.name}</strong><br>
           <span style="color:#6b5f52;font-size:12px;">📍 ${loc.city}</span><br>
           <span style="color:#c4922a;font-size:12px;">★ ${loc.rating}</span>`
        )
        // Stash the label + mode + id + category + access + its
        // click handler on the marker for dynamic bind/unbind in
        // applyLabelsForCurrentZoom AND applyCategoryIcons. Tooltip
        // + icon overlay aren't created here — they only get added
        // when the current zoom crosses the relevant threshold, so
        // at wide zoom we have zero tooltip / DivIcon DOM nodes.
        ;(marker as any).__id           = loc.id
        ;(marker as any).__label        = loc.name
        ;(marker as any).__mode         = (loc as any).mapDisplayMode ?? 'dot'
        ;(marker as any).__category     = (loc as any).category ?? null
        ;(marker as any).__access       = loc.access
        ;(marker as any).__tags         = Array.isArray(loc.tags) ? loc.tags : null
        ;(marker as any).__onLabelClick = onClick
        if (isActive) marker.bringToFront()

        markersRef.current[loc.id] = marker
      })

      // Rebuilding markers wipes any tooltips + icon overlays that
      // were bound to the OLD marker objects. Icon overlay refs
      // still point at Leaflet layers on the map though — clear
      // them so applyCategoryIcons sees a clean slate and re-adds
      // for the new markers. Labels are per-marker on __tooltipType,
      // so applyLabelsForCurrentZoom just re-runs.
      const map2 = mapRef.current
      if (map2) {
        for (const overlay of Object.values(iconOverlaysRef.current)) {
          try { map2.removeLayer(overlay as any) } catch {}
        }
      }
      iconOverlaysRef.current = {}
      applyLabelsForCurrentZoomRef.current?.()
      applyCategoryIconsRef.current?.()
    })
  }, [locations, activeId, onMarkerClick])

  // ── Fly to active location when sidebar card is clicked ───────────────────
  // Only fly on activeId transitions, not on `locations` changes. The
  // parent regenerates `locations` (the filtered array) on every
  // filter / sort tweak, so without the ref guard the map would yank
  // back to the active marker every time the sidebar list changes —
  // including when the user clears the click-anchor banner.
  const lastActiveIdRef = useRef<number | null>(null)
  useEffect(() => {
    if (!mapRef.current) return
    if (activeId === lastActiveIdRef.current) return
    lastActiveIdRef.current = activeId ?? null
    if (!activeId) return
    if (!mapHasSize(mapRef.current)) return
    const loc = locations.find(l => l.id === activeId)
    if (!loc || !isFiniteLatLng(loc.lat, loc.lng)) return
    // setView (not flyTo) so the marker-click jump doesn't stall
    // while Leaflet reprojects every marker for 0.8s of zoom-out /
    // zoom-in animation — same perf fix as the search flyTo above.
    mapRef.current.setView([loc.lat, loc.lng], 14, { animate: true, duration: 0.5, easeLinearity: 0.25 })
  }, [activeId, locations])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}