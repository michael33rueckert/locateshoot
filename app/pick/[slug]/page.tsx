'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import ImageLightbox from '@/components/ImageLightbox'
import { useServerPlacePhotos } from '@/hooks/useServerPlacePhotos'
import { thumbUrl, mediumUrl } from '@/lib/image'
import type { ClientLocation } from '@/components/ClientMap'
import { resolveTemplate, googleFontHref, type PickTemplate, type LayoutKind } from '@/lib/pick-template'

const ClientMap = dynamic(() => import('@/components/ClientMap'), { ssr: false })

const BG_CYCLE = ['bg-1','bg-2','bg-3','bg-4','bg-5','bg-6']

// Open directions in whichever maps app the user prefers. iOS opens
// Apple Maps via the universal `maps.apple.com` URL (which the OS hands
// off to the Maps app automatically). Android uses the `geo:` URI so
// the system shows its app picker for the user's default. Desktop —
// where neither of those work — falls back to Google Maps in a new
// tab. The query is name + city + lat,lng so the destination resolves
// even if the spot's name is generic ("River trail").
function openDirections(loc: { name: string; city: string; lat: number; lng: number }) {
  const hasCoords = Number.isFinite(loc.lat) && Number.isFinite(loc.lng)
  const namePart  = [loc.name, loc.city].filter(Boolean).join(', ')
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isIOS     = /iPhone|iPad|iPod/.test(ua)
  const isAndroid = /Android/.test(ua)
  let url: string
  if (isIOS) {
    const daddr = hasCoords ? `${loc.lat},${loc.lng}` : namePart
    url = `https://maps.apple.com/?daddr=${encodeURIComponent(daddr)}&q=${encodeURIComponent(loc.name)}`
  } else if (isAndroid && hasCoords) {
    url = `geo:${loc.lat},${loc.lng}?q=${encodeURIComponent(`${loc.lat},${loc.lng}(${loc.name})`)}`
  } else if (hasCoords) {
    url = `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}&destination_place_id=${encodeURIComponent(loc.name)}`
  } else {
    url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(namePart)}`
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

// Haversine distance in miles. Used to enforce the photographer's
// max_pick_distance_miles setting on multi-location share links.
function distMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity
  const R = 3958.7613
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

type FullLocation = ClientLocation & {
  tags: string[]
  desc: string
  permitRequired: boolean | null
  permitNotes: string | null
  permitFee: string | null
  permitWebsite: string | null
  permitCertainty: string
  pinterestUrl: string | null
  blogUrl: string | null
  saves: number
  photoUrl: string | null
  photoUrls: string[]
  hideGooglePhotos: boolean
  // True when the photographer marked this location as a recommended
  // pick for this guide. Surfaces a "⭐ Recommended" badge + sorts the
  // location to the top of the list.
  highlighted: boolean
}

export default function ClientPickerPage() {
  const params = useParams()
  const slug   = params?.slug as string

  const [shareData,        setShareData]        = useState<any>(null)
  const [branding,         setBranding]         = useState<any>(null)
  // Pro-tier customizable template (font / colors / header / bg).
  // null when the photographer hasn't configured one or isn't on Pro
  // — we render the default Pick page in that case.
  const [pickTemplate,     setPickTemplate]     = useState<PickTemplate | null>(null)
  const [logoIsLight,      setLogoIsLight]      = useState<boolean | null>(null)
  const [lightboxSrc,      setLightboxSrc]      = useState<string | string[] | null>(null)
  const [lightboxStart,    setLightboxStart]    = useState(0)
  const [locations,        setLocations]        = useState<FullLocation[]>([])
  const [loading,          setLoading]          = useState(true)
  const [error,            setError]            = useState<string | null>(null)
  const [activeId,         setActiveId]         = useState<any>(null)
  const [chosenIds,        setChosenIds]        = useState<string[]>([])
  const [detailLoc,        setDetailLoc]        = useState<FullLocation | null>(null)
  const [confirmed,        setConfirmed]        = useState(false)
  const [showEmailPrompt,  setShowEmailPrompt]  = useState(false)
  const [clientFirstName,  setClientFirstName]  = useState('')
  const [clientLastName,   setClientLastName]   = useState('')
  const [clientEmail,      setClientEmail]      = useState('')
  const [emailError,       setEmailError]       = useState('')
  const [submitting,       setSubmitting]       = useState(false)
  const [mobileMapVisible, setMobileMapVisible] = useState(false)
  // Desktop (≥769px) always shows the map. Below that the sidebar takes the
  // screen and the map is hidden until `mobileMapVisible` flips. ClientMap
  // uses this combined signal to decide when to run the initial fitBounds —
  // otherwise the first fit happens while the container is display:none and
  // leaflet stays parked on the fallback center.
  const [isDesktopViewport, setIsDesktopViewport] = useState(true)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia('(min-width: 769px)')
    const apply = () => setIsDesktopViewport(mql.matches)
    apply()
    mql.addEventListener('change', apply)
    return () => mql.removeEventListener('change', apply)
  }, [])
  const mapContainerVisible = isDesktopViewport || mobileMapVisible
  const emailRef     = useRef<HTMLInputElement>(null)
  const firstNameRef = useRef<HTMLInputElement>(null)

  // Swipe-to-dismiss for the location detail panel. Only the drag handle
  // (the small bar at the top of the bottom sheet) participates — the rest
  // of the panel scrolls normally. `touch-action: none` on the handle stops
  // the browser from interpreting the gesture as a pull-to-refresh.
  const [detailDragY, setDetailDragY] = useState(0)
  const detailDragStart = useRef<number | null>(null)
  // Reset the drag offset when the detail panel switches to a new
  // location, so a half-dragged dismissal doesn't leak into the next open.
  useEffect(() => { setDetailDragY(0); detailDragStart.current = null }, [detailLoc?.id])
  function onDetailHandlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    detailDragStart.current = e.clientY
  }
  function onDetailHandlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (detailDragStart.current == null) return
    const delta = e.clientY - detailDragStart.current
    // Allow downward drag only — upward shouldn't push the panel above
    // its anchor at the bottom.
    setDetailDragY(Math.max(0, delta))
  }
  function onDetailHandlePointerUp() {
    if (detailDragStart.current == null) return
    detailDragStart.current = null
    // Threshold of ~120px to dismiss; anything less snaps back. Comfortable
    // enough to avoid accidental closes during light scroll attempts.
    if (detailDragY > 120) setDetailLoc(null)
    else                   setDetailDragY(0)
  }

  useEffect(() => {
    if (mobileMapVisible) setTimeout(() => window.dispatchEvent(new Event('resize')), 150)
  }, [mobileMapVisible])

  // Split-view mobile layout mounts both map and list at once — nudge Leaflet
  // once so it measures the map column correctly after the first paint.
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 400)
    return () => clearTimeout(t)
  }, [])

  // Share-view analytics. Once the share link's id is known, register a
  // view session, then tick a heartbeat every 15s while the tab is
  // visible. Pause when hidden so we don't count time the client spent
  // doing something else. Final beacon on unload via sendBeacon flushes
  // the last partial interval.
  useEffect(() => {
    const shareLinkId = shareData?.id
    if (!shareLinkId) return
    let cancelled = false
    let viewId: string | null = null
    let lastTickAt = Date.now()
    let intervalId: any = null

    function postHeartbeat(seconds: number) {
      if (!viewId || seconds <= 0) return
      const url = `/api/share-views/${viewId}/heartbeat`
      const body = JSON.stringify({ seconds })
      // sendBeacon for reliability on tab close. Falls back to fetch
      // when the browser doesn't support it (or returns false).
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          const ok = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
          if (ok) return
        }
      } catch { /* fall through */ }
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
    }

    function tick() {
      if (document.visibilityState !== 'visible') { lastTickAt = Date.now(); return }
      const now = Date.now()
      const seconds = Math.round((now - lastTickAt) / 1000)
      lastTickAt = now
      postHeartbeat(seconds)
    }

    fetch('/api/share-views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shareLinkId }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (cancelled || !j?.viewId) return
        viewId = j.viewId
        lastTickAt = Date.now()
        intervalId = setInterval(tick, 15000)
      })
      .catch(() => {})

    function onUnload() { tick() }
    window.addEventListener('pagehide', onUnload)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') lastTickAt = Date.now()
      else tick()
    })

    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
      window.removeEventListener('pagehide', onUnload)
      tick()
    }
  }, [shareData?.id])

  useEffect(() => {
    if (!slug) return
    fetch(`/api/pick-data/${slug}`)
      .then(async res => {
        const json = await res.json()
        if (!res.ok) {
          setError(json.error === 'expired'
            ? 'This Location Guide has expired. Please ask your photographer for a new one.'
            : 'This Location Guide could not be found.')
          return
        }
        const { share, branding, locations: locs, secrets, pickTemplate: tpl } = json
        setShareData(share)
        setBranding(branding)
        setPickTemplate(tpl ?? null)

        // Photographer's recommended picks for this guide. Stored as
        // portfolio_location ids on share_links.highlighted_location_ids
        // — when the migration hasn't landed yet the field is undefined,
        // which the Set treats as empty (no highlights surfaced).
        const highlightSet = new Set<string>(
          Array.isArray(share?.highlighted_location_ids) ? share.highlighted_location_ids.map((x: any) => String(x)) : []
        )

        const all: FullLocation[] = []

        ;(locs ?? []).forEach((loc: any, idx: number) => {
          // Prefer the real Google rating (already a 0–5 decimal). Fall back to
          // the legacy 0–100 quality_score scaled to 5 if rating isn't set.
          const ratingStr = loc.rating != null
            ? Number(loc.rating).toFixed(1)
            : (loc.quality_score ? (loc.quality_score / 20).toFixed(1) : '—')
          // Supabase-js surfaces `numeric` columns as strings, so coerce here
          // — the map's Number.isFinite check silently drops pins otherwise
          // and the viewport stays on the fallback center.
          const lat = typeof loc.latitude  === 'number' ? loc.latitude  : parseFloat(loc.latitude)
          const lng = typeof loc.longitude === 'number' ? loc.longitude : parseFloat(loc.longitude)
          all.push({
            id:     loc.id,
            name:   loc.name,
            city:   [loc.city, loc.state].filter(Boolean).join(', ') || 'Unknown',
            lat,
            lng,
            access: loc.access_type ?? 'public',
            rating: ratingStr,
            bg:     BG_CYCLE[idx % BG_CYCLE.length],
            type:   'favorite',
            tags:   loc.tags ?? [],
            desc:   loc.description ?? '',
            permitRequired:  loc.permit_required ?? null,
            permitNotes:     loc.permit_notes ?? null,
            permitFee:       loc.permit_fee ?? null,
            permitWebsite:   loc.permit_website ?? null,
            permitCertainty: loc.permit_certainty ?? 'unknown',
            pinterestUrl:    loc.pinterest_url ?? null,
            blogUrl:         loc.blog_url ?? null,
            saves:  loc.save_count ?? 0,
            photoUrl: loc.photo_url ?? null,
            photoUrls: loc.photo_urls ?? (loc.photo_url ? [loc.photo_url] : []),
            hideGooglePhotos: !!loc.hide_google_photos,
            highlighted: highlightSet.has(String(loc.id)),
          })
        })

        ;(secrets ?? []).forEach((s: any) => {
          all.push({
            id: s.id, name: s.name, city: s.area,
            lat: s.lat ?? 0, lng: s.lng ?? 0,
            access: 'public', rating: '—',
            bg: s.bg ?? 'bg-1', type: 'secret',
            tags: s.tags ?? [],
            desc: s.description ?? '',
            permitRequired: null, permitNotes: null, permitFee: null,
            permitWebsite: null, permitCertainty: 'unknown',
            pinterestUrl: null, blogUrl: null,
            saves: 0,
            hideGooglePhotos: true,
            highlighted: false,
            photoUrl: null,
            photoUrls: [],
          })
        })

        setLocations(all)
      })
      .catch(err => {
        console.error(err)
        setError('Something went wrong loading this link.')
      })
      .finally(() => setLoading(false))
  }, [slug])

  useEffect(() => {
    if (showEmailPrompt) setTimeout(() => firstNameRef.current?.focus(), 100)
  }, [showEmailPrompt])

  // Detect whether the photographer's logo is visually light or dark so we
  // can flip the header background + text colors for contrast.
  useEffect(() => {
    const url = branding?.logo_url
    if (!branding?.remove_ls_branding || !url) { setLogoIsLight(null); return }
    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (cancelled) return
      try {
        const w = Math.min(img.naturalWidth  || 100, 100)
        const h = Math.min(img.naturalHeight || 100, 100)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0, w, h)
        const { data } = ctx.getImageData(0, 0, w, h)
        let totalL = 0, totalA = 0
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3] / 255
          if (a < 0.1) continue
          const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
          totalL += l * a
          totalA += a
        }
        if (totalA > 0) setLogoIsLight((totalL / totalA) > 140)
      } catch {
        // Canvas was tainted by CORS or similar — fall back to default dark header.
        setLogoIsLight(null)
      }
    }
    img.onerror = () => { if (!cancelled) setLogoIsLight(null) }
    img.src = url
    return () => { cancelled = true }
  }, [branding?.logo_url, branding?.remove_ls_branding])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setDetailLoc(null); setShowEmailPrompt(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleMarkerClick = useCallback((id: any) => {
    const loc = locations.find(l => String(l.id) === String(id))
    if (loc) { setDetailLoc(loc); setActiveId(id); setMobileMapVisible(false) }
  }, [locations])

  const maxPicks         = Math.max(1, shareData?.max_picks ?? 1)
  const maxDistanceMiles = typeof shareData?.max_pick_distance_miles === 'number'
    ? shareData.max_pick_distance_miles
    : (shareData?.max_pick_distance_miles != null ? parseFloat(shareData.max_pick_distance_miles) : null)

  const chosenSet = new Set(chosenIds)
  const chosenLocs = chosenIds
    .map(id => locations.find(l => String(l.id) === String(id)))
    .filter((l): l is FullLocation => !!l)

  // Disable tiles that are too far from a location already picked, so the
  // client can't build an out-of-range set.
  const disabledIds: string[] = (() => {
    if (!maxDistanceMiles || chosenLocs.length === 0) return []
    return locations
      .filter(l => !chosenSet.has(String(l.id)))
      .filter(l => chosenLocs.some(c => distMiles(c.lat, c.lng, l.lat, l.lng) > maxDistanceMiles!))
      .map(l => String(l.id))
  })()
  const disabledSet = new Set(disabledIds)

  function toggleChoice(id: any) {
    const key = String(id)
    if (chosenSet.has(key)) {
      setChosenIds(prev => prev.filter(x => x !== key))
      return
    }
    if (disabledSet.has(key)) return
    if (chosenIds.length >= maxPicks) {
      // Replace the earliest pick if they're at the limit for a single-pick link.
      if (maxPicks === 1) setChosenIds([key])
      return
    }
    setChosenIds(prev => [...prev, key])
  }

  async function savePick(first: string | null, last: string | null, email: string | null) {
    if (!shareData || chosenLocs.length === 0) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/submit-pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shareLinkId:  shareData.id,
          firstName:    first ?? '',
          lastName:     last  ?? '',
          email:        email ?? '',
          picks:        chosenLocs.map(l => ({ id: String(l.id), name: l.name })),
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        console.error('submit-pick failed', j)
      }
    } catch (e) { console.error(e) }
    setSubmitting(false); setShowEmailPrompt(false); setConfirmed(true)
  }

  function confirmChoice() {
    if (chosenIds.length === 0) return
    setShowEmailPrompt(true)
  }

  function submitEmail() {
    const first = clientFirstName.trim()
    const last  = clientLastName.trim()
    const email = clientEmail.trim()
    if (!first || !last) { setEmailError('Please enter your first and last name.'); return }
    if (!email || !email.includes('@')) { setEmailError('Please enter a valid email.'); return }
    setEmailError(''); savePick(first, last, email)
  }

  // Kept for callers expecting a single primary selection (progress bar, etc.).
  const chosenLoc = chosenLocs[0] ?? null
  const isGoldAccent = !branding?.brand_accent
  const accentColor  = branding?.brand_accent ?? 'var(--gold)'

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: '100svh', background: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: '3px solid rgba(255,255,255,.1)', borderTop: '3px solid var(--gold)', borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto 1rem' }} />
          <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, color: 'rgba(245,240,232,.6)' }}>Loading…</div>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <ImageLightbox src={lightboxSrc} startIndex={lightboxStart} onClose={() => setLightboxSrc(null)} />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100svh', background: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ background: 'white', borderRadius: 16, padding: '2.5rem 2rem', maxWidth: 440, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: '1rem' }}>🔗</div>
          <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Link unavailable</div>
          <p style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.65 }}>{error}</p>
        </div>
      </div>
    )
  }

  if (confirmed && chosenLoc) {
    return (
      <div style={{ minHeight: '100svh', background: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ background: 'white', borderRadius: 16, padding: '2.5rem 2rem', maxWidth: 460, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: '1rem' }}>🎉</div>
          <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 28, fontWeight: 900, color: 'var(--ink)', marginBottom: '.5rem' }}>You&apos;re all set!</div>
          <div style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.65, marginBottom: '1.5rem' }}>
            Your photographer has been notified and will be in touch to confirm.
          </div>
          <div style={{ background: 'var(--cream)', border: '1px solid var(--cream-dark)', borderRadius: 10, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
            <div className={chosenLoc.bg} style={{ width: 56, height: 56, borderRadius: 8, flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
              {chosenLoc.photoUrl && <img
                src={thumbUrl(chosenLoc.photoUrl) ?? chosenLoc.photoUrl}
                alt=""
                decoding="async"
                onClick={() => setLightboxSrc(chosenLoc.photoUrl!)}
                onError={e => { if (e.currentTarget.src !== chosenLoc.photoUrl!) e.currentTarget.src = chosenLoc.photoUrl! }}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in' }}
              />}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>{chosenLoc.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 3 }}>📍 {chosenLoc.city}</div>
            </div>
          </div>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <ImageLightbox src={lightboxSrc} startIndex={lightboxStart} onClose={() => setLightboxSrc(null)} />
      </div>
    )
  }

  // Resolve the photographer's Pro template (or defaults if none).
  // Applied via CSS variable overrides + Google Fonts injection so we
  // don't have to thread template values through every nested style.
  const tpl = resolveTemplate(pickTemplate)
  const fontHref = googleFontHref(tpl.font)

  // Optional background image from the photographer's template — sits
  // behind the entire page. The header / sidebar / map all have their
  // own opaque backgrounds, so it only peeks through where they don't
  // (mostly between/around cards on desktop). Match the in-editor
  // preview: cover + center.
  const tplBgImage = tpl.background.type === 'image' && tpl.background.imageUrl
    ? `url(${tpl.background.imageUrl})`
    : 'none'

  return (
    <div
      style={{
        height: '100svh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        backgroundColor: 'var(--ink)',
        backgroundImage: tplBgImage,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        // Map template colors onto our existing CSS variables so all
        // the existing component styles (which use var(--cream),
        // var(--ink), var(--gold)) inherit the photographer's palette
        // without any per-element refactoring. Default values match
        // the originals, so an unconfigured template renders identically.
        ['--cream' as any]: tpl.colors.background,
        ['--ink' as any]: tpl.colors.text,
        ['--gold' as any]: tpl.colors.accent,
      }}
    >
      {/* Inject the chosen Google Font so the playfair var below picks
          it up. preconnect kicks the DNS earlier for faster paint. */}
      {fontHref && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="stylesheet" href={fontHref} />
        </>
      )}
      <style>{`
        /* Replace the playfair display var globally on the pick page so
           every header / location name / photographer name picks up the
           photographer's chosen font without per-element edits. */
        :root { --font-playfair: '${tpl.font.replace(/'/g, '')}', serif; }
        /* Accent button text — the existing CSS uses 'var(--ink)' for
           button labels on top of gold. Override per-button via inline
           style would be too invasive; this is close enough. */
      `}</style>

      {/* Header */}
      {(() => {
        const whiteLabel    = branding?.remove_ls_branding && branding?.logo_url
        // When the logo is visually dark (text/marks on transparent or light
        // bg), flip the header to a cream background so the logo stays legible.
        const lightHeader   = whiteLabel && logoIsLight === false
        const headerBg      = lightHeader ? '#f9f6f1' : 'var(--ink)'
        const headerBorder  = lightHeader ? '1px solid var(--cream-dark)' : '1px solid rgba(255,255,255,.08)'
        const primaryText   = lightHeader ? 'var(--ink)' : 'var(--cream)'
        const secondaryText = lightHeader ? 'var(--ink-soft)' : 'rgba(245,240,232,.55)'
        const mutedText     = lightHeader ? 'var(--ink-soft)' : 'rgba(245,240,232,.4)'
        const studioNameCol = lightHeader ? 'rgba(26,22,18,.75)' : 'rgba(245,240,232,.7)'

        const studioName = branding?.show_studio_name !== false ? branding?.studio_name : null
        const instagramRaw = branding?.instagram ? String(branding.instagram).trim() : ''
        const instagramHandle = instagramRaw.replace(/^@+/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, '')
        const instagramUrl = instagramHandle ? `https://instagram.com/${instagramHandle}` : null
        const websiteRaw = branding?.website ? String(branding.website).trim() : ''
        const websiteUrl = websiteRaw ? (websiteRaw.startsWith('http') ? websiteRaw : `https://${websiteRaw}`) : null
        const websiteLabel = websiteRaw.replace(/^https?:\/\//, '').replace(/\/$/, '')
        const meta = [
          shareData?.photographer_name ? { key: 'name', icon: '📷', label: shareData.photographer_name, href: null as string | null } : null,
          instagramHandle ? { key: 'ig', icon: '◎', label: `@${instagramHandle}`, href: instagramUrl } : null,
          websiteLabel ? { key: 'web', icon: '🌐', label: websiteLabel, href: websiteUrl } : null,
          shareData?.session_name ? { key: 'session', icon: '🗒', label: shareData.session_name, href: null } : null,
        ].filter(Boolean) as { key: string; icon: string; label: string; href: string | null }[]

        return (
          <div style={{ background: headerBg, padding: '1.25rem 1.5rem', flexShrink: 0, borderBottom: headerBorder, transition: 'background .2s' }}>
            {whiteLabel ? (
              <div style={{ marginBottom: '1rem' }}>
                <img src={branding.logo_url} alt={studioName ?? 'Studio logo'} style={{ display: 'block', maxHeight: 56, maxWidth: 260, width: 'auto', height: 'auto', objectFit: 'contain' }} />
                {studioName && <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 13, fontWeight: 600, color: studioNameCol, marginTop: 6 }}>{studioName}</div>}
              </div>
            ) : (
              <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 15, fontWeight: 900, color: 'rgba(245,240,232,.3)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: '1rem' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', display: 'inline-block' }} />LocateShoot
              </div>
            )}

            <h1 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 'clamp(22px,4vw,36px)', fontWeight: 900, lineHeight: 1.1, color: primaryText, marginBottom: '.4rem' }}>
              Choose your <em style={{ fontStyle: 'italic', color: isGoldAccent ? 'var(--gold)' : accentColor }}>perfect</em> spot
            </h1>
            {shareData?.message && <p style={{ fontSize: 14, fontWeight: 300, color: secondaryText, lineHeight: 1.6, maxWidth: 560, marginBottom: '.75rem' }}>{shareData.message}</p>}
            {meta.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontSize: 11, color: mutedText }}>
                {meta.map(m => {
                  const content = <><span style={{ marginRight: 4 }}>{m.icon}</span>{m.label}</>
                  return (
                    <span key={m.key} style={{ display: 'inline-flex', alignItems: 'center' }}>
                      {m.href
                        ? <a href={m.href} target="_blank" rel="noopener noreferrer" style={{ color: mutedText, textDecoration: 'none' }}>{content}</a>
                        : <span>{content}</span>}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* Progress bar */}
      <div style={{ height: 2, background: 'rgba(255,255,255,.08)', flexShrink: 0 }}>
        <div style={{ height: '100%', background: isGoldAccent ? 'var(--gold)' : accentColor, width: chosenIds.length > 0 ? `${Math.min(100, (chosenIds.length / maxPicks) * 100)}%` : '0%', transition: 'width .5s ease' }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', background: 'var(--cream)' }} className="pick-body">

        {/* Sidebar */}
        <div className={`pick-sidebar${mobileMapVisible ? ' pick-sidebar-hidden' : ''}`}
          style={{ background: 'white', borderRight: '1px solid var(--cream-dark)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          <div style={{ padding: '12px 1.25rem', borderBottom: '1px solid var(--cream-dark)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Browse locations</div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{locations.length} spot{locations.length !== 1 ? 's' : ''}</div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {locations.length === 0 ? (
              <div style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📍</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 6 }}>No locations yet</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.6 }}>
                  This link may have been created before a recent update.<br />Ask your photographer to send a new link.
                </div>
              </div>
            ) : (() => {
              // Sort highlighted (photographer-recommended) locations to
              // the top of the list while preserving the photographer's
              // saved order within each group. The list shows them with
              // a "⭐ Recommended" badge in PickListItem.
              const sorted = [...locations].sort((a, b) => Number(!!b.highlighted) - Number(!!a.highlighted))
              return (
                <div className="pick-loc-list" data-layout={tpl.layout}>
                  {sorted.map((loc, i) => {
                    const isChosen   = chosenSet.has(String(loc.id))
                    const isActive   = String(activeId) === String(loc.id)
                    const isDisabled = !isChosen && disabledSet.has(String(loc.id))
                    return (
                      <PickListItem
                        key={String(loc.id)}
                        loc={loc}
                        index={i}
                        layout={tpl.layout}
                        isChosen={isChosen}
                        isActive={isActive}
                        isDisabled={isDisabled}
                        onSelect={() => { setDetailLoc(loc); setActiveId(loc.id) }}
                        onToggleChoice={() => toggleChoice(loc.id)}
                      />
                    )
                  })}
                </div>
              )
            })()}
            <div style={{ height: 80 }} />
          </div>
        </div>

        {/* Map */}
        <div className={`pick-map-col${mobileMapVisible ? ' pick-map-visible' : ''}`} style={{ position: 'relative' }}>
          {mobileMapVisible && (
            <button onClick={() => setMobileMapVisible(false)} style={{ position: 'absolute', top: 12, left: 12, zIndex: 500, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 20, background: 'rgba(26,22,18,.9)', color: 'var(--cream)', border: '1px solid rgba(255,255,255,.15)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
              ← List
            </button>
          )}
          <ClientMap locations={locations} activeId={activeId} chosenIds={chosenIds} disabledIds={disabledIds} onMarkerClick={handleMarkerClick} visible={mapContainerVisible} />
        </div>
      </div>

      {/* Mobile map toggle — hidden on desktop via CSS, visible ≤768px */}
      <button className="pick-mobile-toggle" onClick={() => setMobileMapVisible(p => !p)}>
        {mobileMapVisible ? '☰ View List' : '🗺 View Map'}
      </button>

      {/* Confirm bar */}
      <div style={{ background: 'var(--ink)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', borderTop: '1px solid rgba(255,255,255,.08)', flexShrink: 0 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.07em', color: 'rgba(245,240,232,.35)', marginBottom: 3 }}>
            Your selection{maxPicks > 1 ? ` (${chosenLocs.length} of ${maxPicks})` : ''}
            {maxDistanceMiles ? <span style={{ marginLeft: 8, color: 'rgba(245,240,232,.25)' }}>· ≤ {maxDistanceMiles} mi apart</span> : null}
          </div>
          {chosenLocs.length > 0
            ? <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 15, fontWeight: 700, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {chosenLocs.map(l => l.name).join(' · ')}
              </div>
            : <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 14, color: 'rgba(245,240,232,.25)', fontStyle: 'italic' }}>
                {maxPicks > 1 ? `Tap up to ${maxPicks} locations` : 'Tap a location above'}
              </div>
          }
        </div>
        <button onClick={confirmChoice} disabled={chosenLocs.length === 0 || submitting}
          style={{
            padding: '12px 24px', borderRadius: 4, border: 'none', fontFamily: 'inherit',
            fontSize: 14, fontWeight: 600,
            cursor: chosenLocs.length > 0 ? 'pointer' : 'default',
            background: isGoldAccent ? 'var(--gold)' : accentColor,
            color: isGoldAccent ? 'var(--ink)' : 'white',
            opacity: chosenLocs.length > 0 ? 1 : 0.35,
            // Soft glow + lift when a pick is active so the photographer's
            // accent color reads as "ready to send" instead of just "darker".
            boxShadow: chosenLocs.length > 0 ? `0 0 0 3px ${isGoldAccent ? 'rgba(196,146,42,.25)' : 'rgba(255,255,255,.18)'}, 0 4px 12px rgba(0,0,0,.25)` : 'none',
            transform: chosenLocs.length > 0 ? 'translateY(-1px)' : 'none',
            transition: 'opacity .2s, box-shadow .2s, transform .2s',
            flexShrink: 0, whiteSpace: 'nowrap',
          }}>
          {submitting ? 'Sending…' : maxPicks > 1 ? 'Send my picks →' : 'Send my choice →'}
        </button>
      </div>

      {/* Detail panel */}
      {detailLoc && (
        <>
          {/* Z-index bumped above 800 so the detail panel sits above
              Leaflet's .leaflet-control (attribution + zoom), which
              otherwise pokes through the panel on tablet where the
              map column stays visible alongside the sidebar. */}
          <div onClick={() => setDetailLoc(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,.6)', backdropFilter: 'blur(4px)', zIndex: 1000 }} />
          <div style={{
            position: 'fixed', bottom: 0, left: '50%',
            transform: `translate(-50%, ${detailDragY}px)`,
            // No transition while finger is down (1:1 follow). When the
            // user releases without crossing the threshold, detailDragY
            // snaps back to 0 with this transition.
            transition: detailDragStart.current != null ? 'none' : 'transform .2s ease',
            width: '100%', maxWidth: 580, background: 'white',
            borderRadius: '16px 16px 0 0', zIndex: 1001,
            maxHeight: '85vh', overflowY: 'auto',
            boxShadow: '0 -8px 48px rgba(26,22,18,.3)',
          }}>
            <div
              onPointerDown={onDetailHandlePointerDown}
              onPointerMove={onDetailHandlePointerMove}
              onPointerUp={onDetailHandlePointerUp}
              onPointerCancel={onDetailHandlePointerUp}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                // Generous touch target — the gray bar is just the visual
                // affordance; the whole strip (~56px tall) is draggable so
                // users don't have to land on the bar exactly.
                minHeight: 56,
                padding: '4px 0',
                // Own the gesture so the browser doesn't fire pull-to-refresh.
                touchAction: 'none',
                cursor: detailDragStart.current != null ? 'grabbing' : 'grab',
              }}
            >
              <div style={{ width: 44, height: 5, borderRadius: 3, background: 'var(--sand)' }} />
            </div>
            <button onClick={() => setDetailLoc(null)} style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: '50%', background: 'rgba(26,22,18,.6)', border: 'none', cursor: 'pointer', fontSize: 16, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>✕</button>
            <DetailPhotoGallery
              loc={detailLoc}
              onOpenLightbox={(imgs, start) => { setLightboxSrc(imgs); setLightboxStart(start) }}
            />
            <div style={{ padding: '1.25rem' }}>
              <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 3 }}>{detailLoc.name}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: '1rem' }}>📍 {detailLoc.city}</div>
              {detailLoc.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: '1rem' }}>
                  {detailLoc.tags.map((t: string) => <span key={t} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, background: 'var(--cream-dark)', color: 'var(--ink-soft)', border: '1px solid var(--sand)' }}>{t}</span>)}
                </div>
              )}
              {detailLoc.desc && <p style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.7, marginBottom: '1.25rem' }}>{detailLoc.desc}</p>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: '1rem' }}>
                {(() => {
                  // Permit info is a Pro feature — Free photographers'
                  // shares come back with all permit_* fields nulled out
                  // by the pick-data API. Detect that and hide the
                  // permit cell entirely instead of showing a generic
                  // "Ask your photographer" placeholder, which would
                  // imply the data exists somewhere.
                  const hasPermitData = detailLoc.permitRequired != null
                    || detailLoc.permitNotes != null
                    || detailLoc.permitFee != null
                    || (detailLoc.permitCertainty && detailLoc.permitCertainty !== 'unknown')
                  const permitText =
                    detailLoc.permitRequired === true
                      ? `Permit required${detailLoc.permitNotes ? ' — ' + detailLoc.permitNotes : ''}${detailLoc.permitFee ? ' · ' + detailLoc.permitFee : ''}`
                      : detailLoc.permitRequired === false
                        ? 'No permit required'
                        : 'Ask your photographer'
                  const cells: Array<{ icon: string; label: string; value: string }> = [
                    { icon: '🔒', label: 'Access', value: detailLoc.access === 'public' ? 'Free public access' : detailLoc.access === 'private' ? 'Private — booking required' : 'Ask your photographer' },
                    { icon: '⭐', label: 'Rating', value: detailLoc.rating !== '—' ? `${detailLoc.rating} / 5` : 'Not yet rated' },
                  ]
                  if (hasPermitData) cells.push({ icon: '📋', label: 'Permit', value: permitText })
                  return cells
                })().map(item => (
                  <div key={item.label} style={{ background: 'var(--cream)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--cream-dark)' }}>
                    <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-soft)', marginBottom: 4 }}>{item.icon} {item.label}</div>
                    <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.4 }}>{item.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => openDirections(detailLoc)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 6, background: 'white', color: 'var(--ink)', border: '1px solid var(--cream-dark)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  🗺 Get Directions
                </button>
                {detailLoc.pinterestUrl && (
                  <a
                    href={detailLoc.pinterestUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 6, background: 'white', color: 'var(--ink)', border: '1px solid var(--cream-dark)', fontSize: 12, fontWeight: 500, textDecoration: 'none' }}
                  >
                    📌 Pinterest board
                  </a>
                )}
                {detailLoc.blogUrl && (
                  <a
                    href={detailLoc.blogUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 6, background: 'white', color: 'var(--ink)', border: '1px solid var(--cream-dark)', fontSize: 12, fontWeight: 500, textDecoration: 'none' }}
                  >
                    ✍ Blog post
                  </a>
                )}
                {detailLoc.permitWebsite && (
                  <a
                    href={detailLoc.permitWebsite}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 6, background: 'white', color: 'var(--ink)', border: '1px solid var(--cream-dark)', fontSize: 12, fontWeight: 500, textDecoration: 'none' }}
                  >
                    📋 Permit info
                  </a>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, paddingBottom: '1rem' }}>
                <button onClick={() => setDetailLoc(null)} style={{ flex: 1, padding: '12px', borderRadius: 4, border: '1px solid var(--sand)', background: 'transparent', color: 'var(--ink-soft)', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Back</button>
                {(() => {
                  const isSelected = chosenSet.has(String(detailLoc.id))
                  const isBlocked  = !isSelected && disabledSet.has(String(detailLoc.id))
                  const atLimit    = !isSelected && chosenIds.length >= maxPicks && maxPicks > 1
                  const disabled   = isBlocked || atLimit
                  const label = isSelected
                    ? (maxPicks > 1 ? '✓ Selected — tap to remove' : '✓ This is my choice')
                    : isBlocked ? 'Too far from your other pick'
                    : atLimit   ? `Max ${maxPicks} locations reached`
                    : maxPicks > 1 ? '+ Add to my picks' : 'Choose this spot →'
                  return (
                    <button
                      disabled={disabled}
                      onClick={() => { toggleChoice(detailLoc.id); setDetailLoc(null) }}
                      style={{
                        flex: 2, padding: '12px', borderRadius: 4, border: 'none',
                        background: isSelected ? 'var(--sage)' : disabled ? 'rgba(26,22,18,.25)' : isGoldAccent ? 'var(--gold)' : accentColor,
                        color: isSelected ? 'white' : disabled ? 'white' : isGoldAccent ? 'var(--ink)' : 'white',
                        fontSize: 14, fontWeight: 600,
                        cursor: disabled ? 'default' : 'pointer',
                        opacity: disabled ? 0.75 : 1,
                        fontFamily: 'inherit',
                      }}
                    >
                      {label}
                    </button>
                  )
                })()}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Email prompt */}
      {showEmailPrompt && (
        <>
          <div onClick={() => setShowEmailPrompt(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,.7)', backdropFilter: 'blur(6px)', zIndex: 600 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'white', borderRadius: 16, width: 440, maxWidth: '92vw', padding: '2rem', zIndex: 700 }}>
            <div style={{ fontSize: 36, marginBottom: 12, textAlign: 'center' }}>📍</div>
            <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 8, textAlign: 'center' }}>Almost done!</div>
            <div style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.6, marginBottom: '1.25rem', textAlign: 'center' }}>
              Share your details so <strong style={{ fontWeight: 600 }}>{shareData?.photographer_name ?? 'your photographer'}</strong> can confirm the location.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <input
                ref={firstNameRef}
                value={clientFirstName}
                onChange={e => { setClientFirstName(e.target.value); setEmailError('') }}
                onKeyDown={e => { if (e.key === 'Enter') submitEmail() }}
                placeholder="First name"
                autoComplete="given-name"
                style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '12px 14px', border: `1.5px solid var(--cream-dark)`, borderRadius: 8, fontFamily: 'inherit', fontSize: 15, color: 'var(--ink)', outline: 'none' }}
              />
              <input
                value={clientLastName}
                onChange={e => { setClientLastName(e.target.value); setEmailError('') }}
                onKeyDown={e => { if (e.key === 'Enter') submitEmail() }}
                placeholder="Last name"
                autoComplete="family-name"
                style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '12px 14px', border: `1.5px solid var(--cream-dark)`, borderRadius: 8, fontFamily: 'inherit', fontSize: 15, color: 'var(--ink)', outline: 'none' }}
              />
            </div>
            <input ref={emailRef} type="email" value={clientEmail} onChange={e => { setClientEmail(e.target.value); setEmailError('') }}
              onKeyDown={e => { if (e.key === 'Enter') submitEmail() }}
              placeholder="your@email.com"
              autoComplete="email"
              style={{ width: '100%', padding: '12px 14px', border: `1.5px solid ${emailError ? 'var(--rust)' : 'var(--cream-dark)'}`, borderRadius: 8, fontFamily: 'inherit', fontSize: 15, color: 'var(--ink)', outline: 'none', marginBottom: emailError ? 6 : 16 }} />
            {emailError && <div style={{ fontSize: 12, color: 'var(--rust)', marginBottom: 12, textAlign: 'center' }}>{emailError}</div>}
            <button onClick={submitEmail} disabled={submitting}
              style={{ width: '100%', padding: '13px', borderRadius: 8, background: isGoldAccent ? 'var(--gold)' : accentColor, color: isGoldAccent ? 'var(--ink)' : 'white', border: 'none', fontFamily: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 10, opacity: submitting ? 0.7 : 1 }}>
              {submitting ? 'Sending…' : 'Confirm my choice →'}
            </button>
            <button onClick={() => setShowEmailPrompt(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink-soft)', fontFamily: 'inherit', display: 'block', margin: '0 auto' }}>Go back</button>
          </div>
        </>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        /* Desktop ≥1024: sidebar + map side by side. */
        .pick-body { display: grid; grid-template-columns: 420px 1fr; }
        .pick-sidebar { overflow: hidden; }
        .pick-map-col { position: relative; }
        .pick-mobile-toggle { display: none; }

        /* Default 'card' layout — vertical-hero card with full-width
           photo + name/meta below. Photographer can switch to one of
           four other layouts via their template; per-layout overrides
           live further down via [data-layout="..."] selectors. The
           sizes hint on the <img> assumes ~420px sidebar on desktop/
           tablet and full viewport width on mobile. */
        .pick-loc-list { display: flex; flex-direction: column; }
        .pick-loc-card     { display: flex; flex-direction: column; gap: 0; padding: 0; align-items: stretch; border-bottom: 1px solid var(--cream-dark); }
        /* 4:3 aspect ratio on every viewport so a typical landscape
           photo fits without being cropped top/bottom. */
        .pick-loc-photo    { width: 100%; aspect-ratio: 4 / 3; border-radius: 0; overflow: hidden; position: relative; flex-shrink: 0; }
        .pick-loc-photo-strip {
          position: absolute; inset: 0;
          display: flex;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .pick-loc-photo-strip::-webkit-scrollbar { display: none; }
        .pick-loc-photo-strip > img { width: 100%; height: 100%; flex-shrink: 0; object-fit: cover; display: block; scroll-snap-align: start; scroll-snap-stop: always; }
        .pick-loc-photo-counter {
          display: block;
          position: absolute; bottom: 10px; right: 10px;
          padding: 3px 9px; border-radius: 999px;
          background: rgba(26,22,18,.72);
          color: white;
          font-size: 11px; font-weight: 600;
          backdrop-filter: blur(4px);
          z-index: 2;
        }
        .pick-loc-body     { flex: 1; min-width: 0; padding: 14px 1.25rem 4px; }
        .pick-loc-name     { font-family: var(--font-playfair),serif; font-size: 17px; font-weight: 600; color: var(--ink); margin-bottom: 4px; }
        .pick-loc-city     { font-size: 13px; color: var(--ink-soft); margin-bottom: 8px; }
        .pick-loc-cta      { align-self: flex-start; margin: 0 1.25rem 14px; padding: 8px 16px; font-size: 13px; flex-shrink: 0; }

        /* ── 'list' layout — compact row: small thumb left, text right.
           Photographer's choice when they want clients to scroll a long
           list quickly without scrolling past full-bleed hero photos.
           Hides the CTA arrow + photo-overlay badges so the row stays
           skinny. */
        .pick-loc-list[data-layout="list"] { padding: 8px; gap: 8px; }
        .pick-loc-list[data-layout="list"] .pick-loc-card {
          flex-direction: row; align-items: stretch; gap: 12px;
          padding: 10px; border: 1px solid var(--cream-dark); border-radius: 6px;
        }
        .pick-loc-list[data-layout="list"] .pick-loc-photo { width: 88px; aspect-ratio: 1 / 1; border-radius: 4px; flex-shrink: 0; }
        .pick-loc-list[data-layout="list"] .pick-loc-body  { padding: 2px 0; }
        .pick-loc-list[data-layout="list"] .pick-loc-name  { font-size: 15px; margin-bottom: 2px; }
        .pick-loc-list[data-layout="list"] .pick-loc-city  { font-size: 12px; margin-bottom: 6px; }
        .pick-loc-list[data-layout="list"] .pick-loc-cta   { align-self: center; flex-shrink: 0; margin: 0; padding: 8px 14px; font-size: 12px; }
        .pick-loc-list[data-layout="list"] .pick-loc-rec-badge { display: none; }
        .pick-loc-list[data-layout="list"] .pick-loc-rec-inline { display: inline !important; }

        /* ── 'grid' layout — 2-column grid of mini cards. Squarer than
           the default and shows two locations per row even on mobile. */
        .pick-loc-list[data-layout="grid"] { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 8px; }
        .pick-loc-list[data-layout="grid"] .pick-loc-card {
          flex-direction: column; border: 1px solid var(--cream-dark);
          border-radius: 6px; overflow: hidden;
        }
        .pick-loc-list[data-layout="grid"] .pick-loc-photo { aspect-ratio: 4 / 3; }
        .pick-loc-list[data-layout="grid"] .pick-loc-body  { padding: 8px 10px 4px; }
        .pick-loc-list[data-layout="grid"] .pick-loc-name  { font-size: 14px; margin-bottom: 2px; }
        .pick-loc-list[data-layout="grid"] .pick-loc-city  { font-size: 11px; margin-bottom: 6px; }
        .pick-loc-list[data-layout="grid"] .pick-loc-cta   { margin: 0 10px 10px; font-size: 12px; padding: 6px 10px; }

        /* ── 'magazine' layout — first card spans both columns as a
           hero, the rest fill a 2-up grid below. Reads like the cover
           of a print magazine. */
        .pick-loc-list[data-layout="magazine"] { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 8px; }
        .pick-loc-list[data-layout="magazine"] .pick-loc-card {
          flex-direction: column; border: 1px solid var(--cream-dark);
          border-radius: 6px; overflow: hidden;
        }
        .pick-loc-list[data-layout="magazine"] .pick-loc-card:first-child {
          grid-column: 1 / -1;
        }
        .pick-loc-list[data-layout="magazine"] .pick-loc-card:first-child .pick-loc-photo { aspect-ratio: 16 / 9; }
        .pick-loc-list[data-layout="magazine"] .pick-loc-card:first-child .pick-loc-name  { font-size: 19px; }
        .pick-loc-list[data-layout="magazine"] .pick-loc-photo { aspect-ratio: 4 / 3; }
        .pick-loc-list[data-layout="magazine"] .pick-loc-body  { padding: 8px 10px 4px; }
        .pick-loc-list[data-layout="magazine"] .pick-loc-name  { font-size: 14px; margin-bottom: 2px; }
        .pick-loc-list[data-layout="magazine"] .pick-loc-city  { font-size: 11px; margin-bottom: 6px; }
        .pick-loc-list[data-layout="magazine"] .pick-loc-cta   { margin: 0 10px 10px; font-size: 12px; padding: 6px 10px; }

        /* ── 'minimal' layout — bare row: tiny thumb, name only, faint
           separator. For photographers who want the photo to live in
           the detail view, not the list. */
        .pick-loc-list[data-layout="minimal"] .pick-loc-card {
          flex-direction: row; align-items: center; gap: 12px;
          padding: 10px 1.25rem; border: none;
          border-bottom: 1px solid var(--cream-dark);
        }
        .pick-loc-list[data-layout="minimal"] .pick-loc-photo { width: 44px; aspect-ratio: 1 / 1; border-radius: 4px; flex-shrink: 0; }
        .pick-loc-list[data-layout="minimal"] .pick-loc-body  { padding: 0; }
        .pick-loc-list[data-layout="minimal"] .pick-loc-name  { font-size: 14px; margin-bottom: 0; }
        .pick-loc-list[data-layout="minimal"] .pick-loc-city  { font-size: 11px; margin-bottom: 0; }
        .pick-loc-list[data-layout="minimal"] .pick-loc-body > div:last-child { display: none; }
        .pick-loc-list[data-layout="minimal"] .pick-loc-cta   { align-self: center; flex-shrink: 0; font-size: 12px; padding: 6px 12px; }
        .pick-loc-list[data-layout="minimal"] .pick-loc-rec-badge { display: none; }
        .pick-loc-list[data-layout="minimal"] .pick-loc-rec-inline { display: inline !important; }

        /* Mobile inherits the 4:3 aspect-ratio above — no override
           needed. The width naturally fills the viewport so the photo
           is taller on phones (where the viewport is narrow) and a bit
           shorter on desktop (where the sidebar is 420px), but the
           proportion stays correct everywhere. */

        /* Mobile map toggle (below, unchanged). */
        @media (max-width: 768px) {
          .pick-body { display: flex !important; flex-direction: column !important; }
          .pick-sidebar { flex: 1 !important; min-height: 0 !important; border-right: none !important; }
          .pick-sidebar.pick-sidebar-hidden { display: none !important; }
          .pick-map-col { display: none !important; }
          .pick-map-col.pick-map-visible {
            display: block !important;
            flex: 1 1 auto !important;
            min-height: 0 !important;
          }
          .pick-mobile-toggle {
            display: flex !important;
            position: fixed !important;
            bottom: calc(env(safe-area-inset-bottom, 0) + 82px) !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            z-index: 400 !important;
            align-items: center !important;
            gap: 8px !important;
            padding: 11px 22px !important;
            border-radius: 999px !important;
            border: none !important;
            font-family: var(--font-dm-sans), sans-serif !important;
            font-size: 13px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            box-shadow: 0 6px 24px rgba(0,0,0,.35) !important;
            white-space: nowrap !important;
            background: var(--ink) !important;
            color: var(--cream) !important;
          }
        }
      `}</style>
      <ImageLightbox src={lightboxSrc} startIndex={lightboxStart} onClose={() => setLightboxSrc(null)} />
    </div>
  )
}

// One row in the left sidebar's location list. On desktop this renders as a
// compact horizontal row (60px thumbnail + text). On mobile the same JSX
// reflows via CSS into a tall card with a full-width swipeable photo
// carousel — see the `.pick-loc-*` rules in the <style> block above.
function PickListItem({
  loc,
  index,
  layout,
  isChosen,
  isActive,
  isDisabled,
  onSelect,
  onToggleChoice,
}: {
  loc:            FullLocation
  index:          number
  layout:         LayoutKind
  isChosen:       boolean
  isActive:       boolean
  isDisabled:     boolean
  onSelect:       () => void
  onToggleChoice: () => void
}) {
  const photos = loc.photoUrls.length > 0
    ? loc.photoUrls
    : (loc.photoUrl ? [loc.photoUrl] : [])
  const [photoIdx, setPhotoIdx] = useState(0)
  const stripRef = useRef<HTMLDivElement>(null)

  // Compact layouts (list/minimal) show a single small thumb — a
  // swipeable carousel at 60–80px wide is meaningless and noisy.
  // Photo / grid / magazine all keep the multi-photo strip.
  const compact = layout === 'list' || layout === 'minimal'
  const visiblePhotos = compact ? photos.slice(0, 1) : photos

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    if (el.clientWidth === 0) return
    const next = Math.round(el.scrollLeft / el.clientWidth)
    if (next !== photoIdx) setPhotoIdx(next)
  }

  return (
    <div
      onClick={onSelect}
      className="pick-loc-card"
      style={{
        cursor: 'pointer',
        background: isActive ? 'rgba(196,146,42,.06)' : 'white',
        // Chosen/active accent stripe rendered as an inset box-shadow
        // on the left so it doesn't overwrite the per-layout border.
        // (Previously this was borderLeft, which clobbered the 1px
        // border on grid/magazine cards and made them look like the
        // left edge was cut off.)
        boxShadow: isChosen ? 'inset 3px 0 0 var(--sage)' : isActive ? 'inset 3px 0 0 var(--gold)' : 'none',
        transition: 'all .15s',
        opacity: isDisabled ? 0.45 : 1,
      }}
    >
      <div className={`pick-loc-photo${visiblePhotos.length === 0 ? ' ' + loc.bg : ''}`}>
        {visiblePhotos.length > 0 && (
          <div
            ref={stripRef}
            className="pick-loc-photo-strip"
            onScroll={handleScroll}
          >
            {visiblePhotos.map((src, i) => {
              // Non-compact layouts render the photo as a full-width hero
              // — phone uses the full viewport (~1200px on a 3× retina
              // device), tablet/desktop use the 420px sidebar (~1260px on
              // 3× retina). srcset lets the browser pick the right size
              // so it isn't upscaled from a 480-wide thumbnail.
              //
              // Compact layouts (list 88px, minimal 44px) render the
              // photo at thumbnail size — drop srcset and use a tight
              // sizes hint so the browser fetches only the small thumb,
              // not the 1200w medium. With ~10 cards each loading the
              // medium variant in parallel, the HTTP/1.1 6-connection
              // cap queues the rest and slow responses time out — that
              // was the 'random missing thumbnails' symptom.
              const thumb  = thumbUrl(src)  ?? src
              const medium = mediumUrl(src) ?? src
              // No onClick on the image — taps bubble up to the card's
              // onSelect so any tap on the tile (including the photo) opens
              // the location detail. Lightbox is reserved for the photo
              // gallery inside the detail view.
              return (
                <img
                  key={i}
                  src={thumb}
                  srcSet={compact ? undefined : `${thumb} 480w, ${medium} 1200w`}
                  sizes={compact ? '96px' : '(max-width: 768px) 100vw, 420px'}
                  alt=""
                  decoding="async"
                  loading="lazy"
                  // Render-endpoint fallback — see other thumbnails in this
                  // file. Both thumb + medium go through /render/image/, so
                  // when the picked variant fails we point at the original.
                  onError={e => { if (e.currentTarget.src !== src) { e.currentTarget.removeAttribute('srcset'); e.currentTarget.src = src } }}
                />
              )
            })}
          </div>
        )}
        {/* Tappable selection checkbox — toggles selection without
            opening the detail panel. Stops propagation so the card's
            onClick (which opens the detail) doesn't also fire.
            Doubles as the index pill when not chosen. */}
        <button
          onClick={e => { e.stopPropagation(); if (!isDisabled || isChosen) onToggleChoice() }}
          aria-label={isChosen ? 'Deselect this location' : 'Select this location'}
          style={{
            position: 'absolute', top: 8, left: 8,
            width: 32, height: 32, borderRadius: '50%',
            background: isChosen ? 'rgba(74,103,65,.95)' : 'rgba(255,255,255,.92)',
            color: isChosen ? 'white' : 'var(--ink)',
            fontSize: 14, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 2, backdropFilter: 'blur(4px)',
            border: isChosen ? '2px solid rgba(74,103,65,1)' : '2px solid rgba(26,22,18,.25)',
            cursor: isDisabled && !isChosen ? 'not-allowed' : 'pointer',
            padding: 0, fontFamily: 'inherit',
            boxShadow: '0 1px 4px rgba(0,0,0,.18)',
          }}
        >
          {isChosen ? '✓' : index + 1}
        </button>
        {/* Photographer-recommended badge (photo-overlay variant). Sits
            opposite the index pill on the photo. Hidden in compact
            layouts (list / minimal) where the photo is too small to
            host it without dominating — those layouts show an inline
            ★ pill in the body instead. */}
        {loc.highlighted && (
          <span className="pick-loc-rec-badge" style={{ position: 'absolute', top: 8, right: 8, padding: '3px 9px', borderRadius: 999, background: 'rgba(196,146,42,.95)', color: 'var(--ink)', fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', zIndex: 2, boxShadow: '0 1px 4px rgba(0,0,0,.18)', backdropFilter: 'blur(4px)' }}>
            ★ Recommended
          </span>
        )}
        {!compact && photos.length > 1 && (
          <span className="pick-loc-photo-counter">{photoIdx + 1} / {photos.length}</span>
        )}
      </div>
      <div className="pick-loc-body">
        <div className="pick-loc-name">
          {loc.highlighted && (
            <span className="pick-loc-rec-inline" title="Recommended by your photographer" style={{ display: 'none', marginRight: 6, fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--gold)', verticalAlign: '2px' }}>★ REC</span>
          )}
          {loc.name}
        </div>
        <div className="pick-loc-city">📍 {loc.city}</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: loc.access === 'public' ? 'rgba(74,103,65,.1)' : 'rgba(181,75,42,.1)', color: loc.access === 'public' ? 'var(--sage)' : 'var(--rust)', border: `1px solid ${loc.access === 'public' ? 'rgba(74,103,65,.2)' : 'rgba(181,75,42,.2)'}` }}>
            {loc.access === 'public' ? '● Public' : '🔒 Private'}
          </span>
          {isDisabled && <span style={{ fontSize: 10, color: 'var(--ink-soft)', fontStyle: 'italic' }}>Too far from your other pick</span>}
        </div>
      </div>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); if (!isDisabled || isChosen) onToggleChoice() }}
        disabled={isDisabled && !isChosen}
        className="pick-loc-cta"
        style={{
          background: isChosen ? 'rgba(74,103,65,.1)' : 'var(--gold)',
          color: isChosen ? 'var(--sage)' : 'var(--ink)',
          border: isChosen ? '1px solid rgba(74,103,65,.3)' : 'none',
          borderRadius: 4,
          fontWeight: 600, fontFamily: 'inherit',
          cursor: isDisabled && !isChosen ? 'not-allowed' : 'pointer',
          opacity: isDisabled && !isChosen ? 0.5 : 1,
        }}
      >
        {isChosen ? '✓ Selected' : 'Select'}
      </button>
    </div>
  )
}

// Photo hero + thumbnail strip + Photographer/Google tabs for the pick-page
// detail panel. Photographer's uploaded photos always take the default tab.
// When loc.hideGooglePhotos is true, the Google tab is hidden entirely.
function DetailPhotoGallery({
  loc,
  onOpenLightbox,
}: {
  loc: FullLocation
  onOpenLightbox: (imgs: string[], start: number) => void
}) {
  // Photographer-uploaded photos (already ordered by sort_order on the server).
  const photographerPhotos = loc.photoUrls.length > 0
    ? loc.photoUrls
    : (loc.photoUrl ? [loc.photoUrl] : [])

  // Only fetch Google photos when the photographer hasn't opted out per location.
  const { photos: googleFetch, loading: googleLoading } = useServerPlacePhotos(
    loc.hideGooglePhotos ? '' : loc.name,
    loc.hideGooglePhotos ? '' : loc.city,
    loc.lat,
    loc.lng,
  )
  const googlePhotos = loc.hideGooglePhotos ? [] : googleFetch.map(p => p.url)

  const hasPhotographer = photographerPhotos.length > 0
  const hasGoogle       = !loc.hideGooglePhotos && googlePhotos.length > 0

  type Tab = 'photographer' | 'google'
  const [tab, setTab] = useState<Tab>(hasPhotographer ? 'photographer' : 'google')
  const [idx, setIdx] = useState(0)

  // Re-seed the default tab + active index whenever the location changes.
  useEffect(() => { setIdx(0); setTab(hasPhotographer ? 'photographer' : 'google') }, [loc.id, hasPhotographer])

  // If the photographer-tab is selected but no photographer photos exist and
  // Google photos arrive, auto-flip so we show something.
  useEffect(() => {
    if (tab === 'photographer' && !hasPhotographer && hasGoogle) setTab('google')
  }, [tab, hasPhotographer, hasGoogle])

  const activePhotos = tab === 'photographer' ? photographerPhotos : googlePhotos
  const hasPhotos    = activePhotos.length > 0
  const hasMultiple  = activePhotos.length > 1
  // 4:3 aspect ratio matches the list-card thumbs and a typical
  // landscape photo, so neither the top of someone's head nor the
  // foreground gets cropped. Width follows the panel (max 580px), so
  // the rendered hero is ~280-435px tall depending on viewport.
  const heroAspect   = '4 / 3'
  const stripRef     = useRef<HTMLDivElement>(null)

  // Keep the idx counter + thumbnail-row highlight in sync with the hero's
  // scroll position. Division by clientWidth works because every image is
  // pinned to the container width via CSS.
  function handleHeroScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    if (el.clientWidth === 0) return
    const next = Math.round(el.scrollLeft / el.clientWidth)
    if (next !== idx) setIdx(next)
  }

  // When the strip already exists, snap the hero back to the first image
  // whenever the tab or location changes. Otherwise switching tabs would
  // leave the user mid-scroll on a different image than `idx=0` suggests.
  useEffect(() => {
    if (!stripRef.current) return
    stripRef.current.scrollTo({ left: 0, behavior: 'instant' as ScrollBehavior })
  }, [tab, loc.id])

  // Tapping a thumbnail below the hero should scroll-snap the hero to that
  // image (instead of only updating state, which would desync).
  function goToIdx(i: number) {
    const el = stripRef.current
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
    else setIdx(i)
  }

  return (
    <>
      <div className={hasPhotos ? undefined : loc.bg} style={{ width: '100%', aspectRatio: heroAspect, position: 'relative', overflow: 'hidden', background: hasPhotos ? '#1a1612' : undefined }}>
        {hasPhotos ? (
          <div
            ref={stripRef}
            onScroll={handleHeroScroll}
            style={{
              position: 'absolute', inset: 0,
              display: 'flex',
              overflowX: 'auto',
              overflowY: 'hidden',
              scrollSnapType: 'x mandatory',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
            }}
          >
            <style>{`.pick-hero-strip::-webkit-scrollbar { display: none; }`}</style>
            {activePhotos.map((src, i) => (
              <img
                key={i}
                // Photographer photos run through the medium-resize helper so
                // the hero renders a ~1200px JPEG instead of a 5–8 MB original.
                // Google URLs already come in resized and the helper no-ops.
                src={mediumUrl(src) ?? src}
                alt=""
                decoding="async"
                loading={i === 0 ? 'eager' : 'lazy'}
                onClick={() => onOpenLightbox(activePhotos, i)}
                onError={e => { if (e.currentTarget.src !== src) e.currentTarget.src = src }}
                style={{
                  width: '100%', height: '100%',
                  flexShrink: 0,
                  objectFit: 'cover',
                  cursor: 'zoom-in',
                  scrollSnapAlign: 'start',
                  scrollSnapStop: 'always',
                }}
              />
            ))}
          </div>
        ) : googleLoading && !hasPhotographer ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 24, height: 24, border: '2px solid rgba(255,255,255,.2)', borderTop: '2px solid rgba(255,255,255,.7)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
          </div>
        ) : null}
        <div style={{ position: 'absolute', top: 12, left: 12, padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: loc.access === 'public' ? 'rgba(74,103,65,.85)' : 'rgba(181,75,42,.85)', color: loc.access === 'public' ? '#c8e8c4' : '#ffd0c0', zIndex: 1, pointerEvents: 'none' }}>
          {loc.access === 'public' ? '● Public' : '🔒 Private'}
        </div>
        {hasMultiple && (
          <div style={{ position: 'absolute', bottom: 10, right: 10, background: 'rgba(26,22,18,.7)', borderRadius: 20, padding: '3px 10px', fontSize: 11, color: 'rgba(255,255,255,.85)', fontVariantNumeric: 'tabular-nums', zIndex: 2, pointerEvents: 'none' }}>
            {idx + 1} / {activePhotos.length}
          </div>
        )}
      </div>

      {/* Tab row — only shown when both sources have photos available. */}
      {(hasPhotographer || hasGoogle) && (hasPhotographer && hasGoogle) && (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--cream-dark)' }}>
          {([
            { key: 'photographer' as const, label: `Photographer${hasPhotographer ? ` (${photographerPhotos.length})` : ''}` },
            { key: 'google'       as const, label: `Google${hasGoogle ? ` (${googlePhotos.length})` : ''}` },
          ]).map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setIdx(0) }}
              style={{
                padding: '9px 16px', fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
                border: 'none',
                borderBottom: `2px solid ${tab === t.key ? 'var(--gold)' : 'transparent'}`,
                background: 'white',
                color: tab === t.key ? 'var(--ink)' : 'var(--ink-soft)',
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {hasMultiple && (
        <div style={{ display: 'flex', gap: 5, padding: '8px 1.25rem', overflowX: 'auto', borderBottom: '1px solid var(--cream-dark)' }}>
          {activePhotos.map((url, i) => (
            <div
              key={i}
              onClick={() => goToIdx(i)}
              style={{ width: 56, height: 56, borderRadius: 6, flexShrink: 0, overflow: 'hidden', cursor: 'pointer', border: `2px solid ${idx === i ? 'var(--gold)' : 'transparent'}` }}
            >
              <img
                src={thumbUrl(url) ?? url}
                alt=""
                decoding="async"
                onError={e => { if (e.currentTarget.src !== url) e.currentTarget.src = url }}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          ))}
        </div>
      )}
    </>
  )
}