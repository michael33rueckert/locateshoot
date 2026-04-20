'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

export interface AddressResult {
  lat: number
  lng: number
  label: string
  shortLabel: string
}

interface AddressSearchProps {
  onSelect: (result: AddressResult) => void
  placeholder?: string
  autoFocus?: boolean
}

declare global {
  interface Window {
    google: any
    _googleMapsLoading?: boolean
    _googleMapsLoaded?: boolean
    _googleMapsCallbacks?: (() => void)[]
  }
}

function loadGoogleMaps(apiKey: string): Promise<void> {
  return new Promise((resolve) => {
    if (window._googleMapsLoaded) { resolve(); return }
    if (!window._googleMapsCallbacks) window._googleMapsCallbacks = []
    window._googleMapsCallbacks.push(resolve)
    if (window._googleMapsLoading) return
    window._googleMapsLoading = true
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
    script.async = true
    script.defer = true
    script.onload = () => {
      window._googleMapsLoaded  = true
      window._googleMapsLoading = false
      window._googleMapsCallbacks?.forEach(cb => cb())
      window._googleMapsCallbacks = []
    }
    document.head.appendChild(script)
  })
}

export default function AddressSearch({
  onSelect,
  placeholder = 'Search for a place or address…',
  autoFocus = false,
}: AddressSearchProps) {
  const [query,       setQuery]       = useState('')
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [loading,     setLoading]     = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [activeIdx,   setActiveIdx]   = useState(-1)
  const [gmLoaded,    setGmLoaded]    = useState(false)

  const inputRef     = useRef<HTMLInputElement>(null)
  const wrapRef      = useRef<HTMLDivElement>(null)
  const sessionToken = useRef<any>(null)
  const autocomplete = useRef<any>(null)
  // PlacesService needs a DOM element to attach to
  const mapDivRef    = useRef<HTMLDivElement | null>(null)
  const placesService= useRef<any>(null)
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY

  // ── Load Google Maps script ───────────────────────────────────────────────
  useEffect(() => {
    if (!apiKey) { console.error('NEXT_PUBLIC_GOOGLE_PLACES_KEY is not set'); return }
    loadGoogleMaps(apiKey).then(() => setGmLoaded(true))
  }, [apiKey])

  // ── Set up services once script is loaded ─────────────────────────────────
  useEffect(() => {
    if (!gmLoaded || !window.google) return
    sessionToken.current = new window.google.maps.places.AutocompleteSessionToken()
    autocomplete.current = new window.google.maps.places.AutocompleteService()

    // PlacesService requires a map or a div element
    if (!mapDivRef.current) {
      mapDivRef.current = document.createElement('div')
    }
    placesService.current = new window.google.maps.places.PlacesService(mapDivRef.current)
  }, [gmLoaded])

  // ── Debounced autocomplete search ─────────────────────────────────────────
  const search = useCallback((q: string) => {
    if (!autocomplete.current || !q.trim() || q.length < 2) {
      setSuggestions([]); setShowResults(false); return
    }
    setLoading(true)
    autocomplete.current.getPlacePredictions(
      {
        input:        q,
        sessionToken: sessionToken.current,
        componentRestrictions: { country: 'us' },
      },
      (predictions: any[] | null, status: string) => {
        setLoading(false)
        if (status === 'OK' && predictions) {
          setSuggestions(predictions)
          setShowResults(true)
          setActiveIdx(-1)
        } else {
          setSuggestions([])
          setShowResults(false)
        }
      }
    )
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, search])

  // ── Close on outside click ────────────────────────────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ── Select — use PlacesService.getDetails to get lat/lng ─────────────────
  // This uses the Places API only — no Geocoding API needed
  function handleSelect(prediction: any) {
    if (!placesService.current) return
    setQuery(prediction.description)
    setShowResults(false)
    setSuggestions([])
    setLoading(true)

    placesService.current.getDetails(
      {
        placeId: prediction.place_id,
        fields:  ['geometry', 'name', 'formatted_address'],
        sessionToken: sessionToken.current,
      },
      (place: any, status: string) => {
        setLoading(false)
        if (status === 'OK' && place?.geometry?.location) {
          const lat = place.geometry.location.lat()
          const lng = place.geometry.location.lng()
          const label     = prediction.description
          const parts     = label.split(',')
          const shortLabel = parts.slice(0, 2).join(',').trim()

          // Refresh session token after each completed selection
          sessionToken.current = new window.google.maps.places.AutocompleteSessionToken()

          onSelect({ lat, lng, label, shortLabel })
        } else {
          console.error('PlacesService getDetails failed:', status)
        }
      }
    )
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showResults || suggestions.length === 0) return
    if (e.key === 'ArrowDown')  { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); handleSelect(suggestions[activeIdx]) }
    else if (e.key === 'Escape') setShowResults(false)
  }

  function handleClear() {
    setQuery(''); setSuggestions([]); setShowResults(false)
    inputRef.current?.focus()
  }

  function splitDescription(description: string) {
    const parts = description.split(',')
    return { main: parts[0].trim(), sub: parts.slice(1).join(',').trim() }
  }

  function renderHighlighted(prediction: any) {
    const text  = prediction.description.split(',')[0]
    const parts = (prediction.matched_substrings ?? []).filter(
      (m: any) => m.offset < text.length
    )
    if (parts.length === 0) return <span>{text}</span>
    const elements: React.ReactNode[] = []
    let cursor = 0
    parts.forEach((match: { offset: number; length: number }, i: number) => {
      if (match.offset > cursor) elements.push(<span key={`pre-${i}`}>{text.slice(cursor, match.offset)}</span>)
      elements.push(<strong key={`m-${i}`} style={{ color: 'var(--ink)', fontWeight: 600 }}>{text.slice(match.offset, match.offset + match.length)}</strong>)
      cursor = match.offset + match.length
    })
    if (cursor < text.length) elements.push(<span key="rest">{text.slice(cursor)}</span>)
    return <>{elements}</>
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setShowResults(true)}
          placeholder={!gmLoaded ? 'Loading search…' : placeholder}
          disabled={!gmLoaded}
          autoFocus={autoFocus}
          style={{
            width: '100%', padding: '9px 36px 9px 12px',
            border: '1px solid var(--cream-dark)', borderRadius: 4,
            fontFamily: 'var(--font-dm-sans), sans-serif',
            fontSize: 14, color: 'var(--ink)', background: 'white', outline: 'none',
            transition: 'border-color 0.18s',
            opacity: !gmLoaded ? 0.6 : 1,
          }}
          onFocusCapture={e => (e.target.style.borderColor = 'var(--gold)')}
          onBlurCapture={e  => (e.target.style.borderColor = 'var(--cream-dark)')}
        />

        <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', color: 'var(--ink-soft)' }}>
          {loading ? (
            <div style={{ width: 14, height: 14, border: '2px solid var(--cream-dark)', borderTop: '2px solid var(--gold)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          ) : query ? (
            <button onClick={handleClear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 14, lineHeight: 1, padding: 0 }}>✕</button>
          ) : (
            <span style={{ fontSize: 14 }}>🔍</span>
          )}
        </div>
      </div>

      {/* Dropdown */}
      {showResults && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
          background: 'white', border: '1px solid var(--cream-dark)',
          borderRadius: 8, marginTop: 4,
          boxShadow: '0 8px 32px rgba(26,22,18,0.14)',
          overflow: 'hidden',
        }}>
          {suggestions.map((prediction, idx) => {
            const isActive = idx === activeIdx
            const { main, sub } = splitDescription(prediction.description)
            return (
              <div
                key={prediction.place_id}
                onMouseDown={() => handleSelect(prediction)}
                onMouseEnter={() => setActiveIdx(idx)}
                style={{
                  padding: '10px 14px',
                  borderBottom: idx < suggestions.length - 1 ? '1px solid var(--cream-dark)' : 'none',
                  cursor: 'pointer',
                  background: isActive ? 'var(--cream)' : 'white',
                  transition: 'background 0.1s',
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}
              >
                <span style={{ fontSize: 14, flexShrink: 0, marginTop: 2, color: 'var(--ink-soft)' }}>📍</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {renderHighlighted(prediction)}
                  </div>
                  {sub && (
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {sub}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* Required Google attribution */}
          <div style={{ padding: '5px 14px', fontSize: 10, color: 'var(--sand)', textAlign: 'right', borderTop: '1px solid var(--cream-dark)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
            Powered by
            <img src="https://developers.google.com/static/maps/documentation/images/google_on_white.png" alt="Google" style={{ height: 12, opacity: 0.5 }} />
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}