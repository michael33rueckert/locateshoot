'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AddressSearch, { type AddressResult } from '@/components/AddressSearch'
import type { MapLocation } from '@/components/ShareMap'

const ShareMap = dynamic(() => import('@/components/ShareMap'), { ssr: false })

interface DBFavorite {
  id: number; location_id: number | string
  locations: { id: number | string; name: string; city: string; latitude: number; longitude: number; access_type: string; rating: number | null }
}
interface DBSecret  { id: string; name: string; area: string; description: string | null; tags: string[]; bg: string; lat: number | null; lng: number | null }
interface DBTemplate{ id: string; name: string; body: string }

function calcDist(la1: number, lo1: number, la2: number, lo2: number) {
  const R = 3958.8, dLa = (la2-la1)*Math.PI/180, dLo = (lo2-lo1)*Math.PI/180
  const a = Math.sin(dLa/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))
}

function generateSlug(sessionName: string, photographerName: string) {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,30)
  return `${clean(photographerName)}-${clean(sessionName)}-${Date.now().toString(36)}`
}

const BG_CYCLE    = ['bg-1','bg-2','bg-3','bg-4','bg-5','bg-6']
const STEP_LABELS = ['Drop pin','Select','Message','Share']

export default function SharePage() {
  const [userId,       setUserId]       = useState<string | null>(null)
  const [dbFavorites,  setDbFavorites]  = useState<DBFavorite[]>([])
  const [dbSecrets,    setDbSecrets]    = useState<DBSecret[]>([])
  const [dbTemplates,  setDbTemplates]  = useState<DBTemplate[]>([])
  const [dataLoading,  setDataLoading]  = useState(true)
  const [allDbLocs,    setAllDbLocs]    = useState<MapLocation[]>([])
  const [locSearch,    setLocSearch]    = useState('')
  const [step,             setStep]             = useState(1)
  const [pin,              setPin]              = useState<{ lat: number; lng: number } | null>(null)
  const [radius,           setRadius]           = useState(15)
  const [selected,         setSelected]         = useState<Set<string>>(new Set())
  const [toast,            setToast]            = useState<string | null>(null)
  const [sessionName,      setSessionName]      = useState('')
  const [message,          setMessage]          = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [photographerName, setPhotographerName] = useState('')
  const [expiry,           setExpiry]           = useState('14')
  const [myPhotosOnly,     setMyPhotosOnly]     = useState(false)
  const [generatedSlug,    setGeneratedSlug]    = useState<string | null>(null)
  const [isSaving,         setIsSaving]         = useState(false)
  const [mobileMenuOpen,   setMobileMenuOpen]   = useState(false)

  // Handle ?step=3 from explore page
  (() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('step') === '3') {
      const stored = sessionStorage.getItem('sharePreselectedLocation')
      if (stored) {
        try {
          const loc = JSON.parse(stored)
          setSelected(new Set([String(loc.id)]))
          sessionStorage.removeItem('sharePreselectedLocation')
        } catch {}
      }
      setStep(3)
    }
  }, [])

  const loadData = useCallback(async () => {
    setDataLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/'; return }
      setUserId(user.id)
      const [favsRes, secretsRes, templatesRes, profileRes] = await Promise.all([
        supabase.from('favorites').select('id,location_id,locations(id,name,city,latitude,longitude,access_type,rating)').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('secret_locations').select('id,name,area,description,tags,bg,lat,lng').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('message_templates').select('id,name,body').eq('user_id', user.id).order('created_at', { ascending: true }),
        supabase.from('profiles').select('full_name').eq('id', user.id).single(),
      ])
      if (favsRes.data)      setDbFavorites(favsRes.data as any)
      if (secretsRes.data)   setDbSecrets(secretsRes.data)
      if (templatesRes.data) setDbTemplates(templatesRes.data)
      if (profileRes.data?.full_name) setPhotographerName(profileRes.data.full_name)
    } catch (err) { console.error(err) }
    finally { setDataLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Load all published locations
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('step') === '3') {
      const stored = sessionStorage.getItem('sharePreselectedLocation')
      if (stored) {
        // Only jump to step 3 when we actually have a preselected location
        try {
          const loc = JSON.parse(stored)
          setSelected(new Set([String(loc.id)]))
          setStep(3)
        } catch {}
        sessionStorage.removeItem('sharePreselectedLocation')
      }
      // If no stored location, ignore the ?step=3 param and stay on step 1
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2800)
    return () => clearTimeout(id)
  }, [toast])

  // Build MapLocation lists with distances
  const favorites: MapLocation[] = useMemo(() =>
    dbFavorites.filter(f => f.locations?.latitude && f.locations?.longitude).map((f,idx) => ({
      id:     f.location_id,
      name:   f.locations.name,
      city:   f.locations.city,
      lat:    f.locations.latitude,
      lng:    f.locations.longitude,
      access: f.locations.access_type ?? 'public',
      rating: f.locations.rating?.toString() ?? '—',
      bg:     `bg-${(idx%6)+1}`,
      type:   'favorite' as const,
      d:      pin ? calcDist(pin.lat, pin.lng, f.locations.latitude, f.locations.longitude) : null,
    })).sort((a,b) => (a.d??999)-(b.d??999)),
  [dbFavorites, pin])

  const secretLocs: MapLocation[] = useMemo(() =>
    dbSecrets.filter(s => s.lat && s.lng).map(s => ({
      id:     s.id,
      name:   s.name,
      city:   s.area,
      lat:    s.lat!,
      lng:    s.lng!,
      access: 'public',
      rating: '—',
      bg:     s.bg,
      type:   'secret' as const,
      d:      pin ? calcDist(pin.lat, pin.lng, s.lat!, s.lng!) : null,
    })).sort((a,b) => (a.d??999)-(b.d??999)),
  [dbSecrets, pin])

  // All locations with distances, non-favorites only (to avoid duplicates in list)
  const favIdSet = useMemo(() => new Set(favorites.map(f => String(f.id))), [favorites])

  const allLocsWithDist: MapLocation[] = useMemo(() =>
    allDbLocs
      .filter(l => !favIdSet.has(String(l.id))) // exclude already-shown favorites
      .map(l => ({ ...l, d: pin ? calcDist(pin.lat, pin.lng, l.lat, l.lng) : null }))
      .sort((a,b) => (a.d??999)-(b.d??999)),
  [allDbLocs, favIdSet, pin])

  // For map display only
  const allMapLocations = useMemo(() => [...favorites, ...secretLocs], [favorites, secretLocs])

  const favsInRange   = favorites.filter(f => f.d !== null && f.d <= radius)
  const favsOutRange  = favorites.filter(f => f.d === null || f.d > radius)
  const secretInRange = secretLocs.filter(s => s.d !== null && s.d <= radius)

  // All selected locations (for step 3 summary and generate)
  const allSelectableLocs = useMemo(() => {
    const seen = new Set<string>()
    return [...favorites, ...secretLocs, ...allDbLocs].filter(l => {
      const key = String(l.id)
      if (seen.has(key)) return false
      seen.add(key)useEffect
      return true
    })
  }, [favorites, secretLocs, allDbLocs])

  const selectedLocs = allSelectableLocs.filter(l => selected.has(String(l.id)))

  // ── Handlers ────────────────────────────────────────────────────────────
  function handleAddressSelect(result: AddressResult) { setPin({ lat: result.lat, lng: result.lng }); setToast('📍 Pin dropped!') }
  function handlePinDrop(lat: number, lng: number) { setPin({ lat, lng }) }
  function applyTemplate(id: string) { const t = dbTemplates.find(t => t.id === id); if (!t) return; setSelectedTemplate(id); setMessage(t.body) }

  function toggleSelect(id: number | string) {
    const key = String(id)
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function selectAllFavsInRange() {
    setSelected(prev => {
      const next = new Set(prev)
      favsInRange.forEach(f => next.add(String(f.id)))
      return next
    })
  }

  function goToStep(n: number) {
    if (n === 2 && !pin) return
    if (n === 3 && selected.size === 0) return
    if (n <= step || n === step + 1) setStep(n)
  }

  function nextStep() {
    if (step === 1 && !pin) { setToast('📍 Search or click the map to drop a pin first'); return }
    if (step === 2 && selected.size === 0) { setToast('Select at least one location'); return }
    if (step < 4) setStep(s => s + 1)
  }

  function prevStep() { if (step > 1) setStep(s => s - 1) }

  async function generateLink() {
    if (!userId || !sessionName.trim()) {
      setToast(userId ? 'Please enter a session name' : '⚠ Not signed in — please refresh')
      return
    }
    if (selected.size === 0) { setToast('Please select at least one location'); return }
    setIsSaving(true)
    try {
      const slug = generateSlug(sessionName, photographerName || 'photographer')

      // FIX: use type !== 'secret' (not typeof === 'number') and convert to Number for DB
      const locationIds = selectedLocs.filter(l => l.type !== 'secret').map(l => Number(l.id))
      const secretIds   = selectedLocs.filter(l => l.type === 'secret').map(l => String(l.id))

      let expiresAt: string | null = null
      if (expiry !== '0') { const d = new Date(); d.setDate(d.getDate() + parseInt(expiry)); expiresAt = d.toISOString() }

      const { error } = await supabase.from('share_links').insert({
        user_id:           userId,
        slug,
        session_name:      sessionName.trim(),
        message:           message.trim() || null,
        photographer_name: photographerName.trim() || null,
        my_photos_only:    myPhotosOnly,
        location_ids:      locationIds,
        secret_ids:        secretIds,
        expires_at:        expiresAt,
      })
      if (error) { console.error('Supabase error:', error); throw error }
      setGeneratedSlug(slug); setStep(4); setToast('🔗 Share link created!')
    } catch (err: any) {
      console.error('generateLink error:', err)
      setToast(`⚠ ${err?.message ?? 'Could not create link — please try again'}`)
    } finally { setIsSaving(false) }
  }

  function copyLink() {
    if (!generatedSlug) return
    navigator.clipboard?.writeText(`${window.location.origin}/pick/${generatedSlug}`).catch(() => {})
    setToast('📋 Link copied!')
  }

  function resetAll() {
    setStep(1); setPin(null); setSelected(new Set()); setMyPhotosOnly(false)
    setGeneratedSlug(null); setSessionName(''); setMessage(''); setSelectedTemplate('')
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const rowStyle = (sel: boolean, isSecret = false): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 9, padding: 9, borderRadius: 4, cursor: 'pointer',
    border: `1.5px solid ${sel ? 'rgba(196,146,42,.35)' : isSecret ? 'rgba(124,92,191,.2)' : 'transparent'}`,
    background: sel ? 'rgba(196,146,42,.06)' : isSecret ? 'rgba(124,92,191,.03)' : 'var(--cream)',
    marginBottom: 5, transition: 'all .15s',
  })
  const checkStyle = (sel: boolean): React.CSSProperties => ({
    width: 17, height: 17, borderRadius: 4, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: `1.5px solid ${sel ? 'var(--gold)' : 'var(--sand)'}`,
    background: sel ? 'var(--gold)' : 'transparent',
    fontSize: 10, fontWeight: 700, color: 'var(--ink)', transition: 'all .15s',
  })
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', border: '1px solid var(--cream-dark)', borderRadius: 4,
    fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 14, color: 'var(--ink)', background: 'white', outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 500, textTransform: 'uppercase',
    letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 5,
  }

  function LocationRow({ loc, isFav = false }: { loc: MapLocation, isFav?: boolean }) {
    const sel      = selected.has(String(loc.id))
    const isSecret = loc.type === 'secret'
    return (
      <div onClick={() => toggleSelect(loc.id)} style={rowStyle(sel, isSecret)}>
        <div style={checkStyle(sel)}>{sel ? '✓' : ''}</div>
        <div className={loc.bg} style={{ width: 42, height: 42, borderRadius: 6, flexShrink: 0, position: 'relative' }}>
          {isSecret && <div style={{ position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: '50%', background: 'rgba(124,92,191,.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8 }}>🤫</div>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>
            {loc.name}
            {isFav && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--gold)', fontWeight: 400 }}>★ saved</span>}
            {isSecret && <span style={{ marginLeft: 6, fontSize: 10, color: '#7c5cbf', fontWeight: 500 }}>🤫 Secret</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>📍 {loc.city}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {loc.d !== null && loc.d !== undefined
            ? <><div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{loc.d.toFixed(1)}</div><div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>mi</div></>
            : <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>★ {loc.rating}</div>
          }
        </div>
      </div>
    )
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (dataLoading) {
    return (
      <div style={{ height: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cream)' }}>
        <div style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 14, fontWeight: 300 }}>Loading…</div>
      </div>
    )
  }

  return (
    <div className="share-outer">

      {/* SIDEBAR — flex column so footer stays pinned at bottom */}
      <div className="share-sidebar" style={{ background: 'white', borderRight: '1px solid var(--cream-dark)', display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

        {/* ── Header (fixed) ── */}
        <div style={{ padding: '1.25rem 1.5rem 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <Link href="/" style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 17, fontWeight: 900, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)', display: 'inline-block' }} />LocateShoot
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Link href="/dashboard" style={{ fontSize: 12, color: 'var(--ink-soft)', textDecoration: 'none' }}>← Dashboard</Link>
              <button
                className="hamburger-btn"
                onClick={() => setMobileMenuOpen(p => !p)}
                style={{ background: 'rgba(26,22,18,.08)', border: '1px solid rgba(26,22,18,.15)', color: 'var(--ink)' }}
              >
                {mobileMenuOpen ? '✕' : '☰'}
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div style={{ background: 'var(--cream)', border: '1px solid var(--cream-dark)', borderRadius: 8, padding: '0.5rem', marginBottom: '1rem' }}>
              <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} style={{ display: 'block', padding: '10px', fontSize: 14, color: 'var(--ink)', textDecoration: 'none', borderBottom: '1px solid var(--cream-dark)' }}>← Dashboard</Link>
              <Link href="/explore" onClick={() => setMobileMenuOpen(false)} style={{ display: 'block', padding: '10px', fontSize: 14, color: 'var(--ink)', textDecoration: 'none' }}>Browse map</Link>
            </div>
          )}

          <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, lineHeight: 1.15, color: 'var(--ink)', marginBottom: 4 }}>
            Share locations<br />with your client
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.55, marginBottom: '1rem' }}>
            Drop a pin, choose locations, and send a link.
          </div>

          {/* Step tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--cream-dark)', margin: '0 -1.5rem', padding: '0 1.5rem', overflowX: 'auto' }}>
            {STEP_LABELS.map((label, i) => {
              const n = i+1, active = step === n, done = step > n
              return (
                <div key={n} onClick={() => goToStep(n)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '9px 0', marginRight: 14, fontSize: 12, fontWeight: 500, cursor: 'pointer', color: active ? 'var(--ink)' : done ? 'var(--sage)' : 'var(--ink-soft)', borderBottom: `2px solid ${active ? 'var(--gold)' : 'transparent'}`, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  <span style={{ width: 17, height: 17, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, background: active ? 'var(--gold)' : done ? 'var(--sage)' : 'var(--cream-dark)', color: active ? 'var(--ink)' : done ? 'white' : 'var(--ink-soft)' }}>
                    {done ? '✓' : n}
                  </span>
                  {label}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Scrollable step content ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>

          {/* STEP 1 */}
          {step === 1 && (
            <>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={labelStyle}>Search for your client&apos;s area</label>
                <AddressSearch onSelect={handleAddressSelect} placeholder="Try 'Loose Park Kansas City' or an address…" />
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 6, fontWeight: 300 }}>Or click directly on the map (desktop)</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.25rem' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--cream-dark)' }} />
                <span style={{ fontSize: 11, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>then set radius</span>
                <div style={{ flex: 1, height: 1, background: 'var(--cream-dark)' }} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)' }}>Search radius</span>
                  <span style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 20, fontWeight: 700, color: 'var(--gold)' }}>{radius} mi</span>
                </div>
                <input type="range" min={2} max={50} value={radius} step={1} onChange={e => setRadius(parseInt(e.target.value))} style={{ width: '100%', accentColor: 'var(--gold)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--ink-soft)', marginTop: 2 }}><span>2 mi</span><span>50 mi</span></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', borderRadius: 4, fontSize: 13, marginBottom: '1.25rem', background: pin ? 'rgba(74,103,65,.08)' : 'var(--cream-dark)', color: pin ? 'var(--sage)' : 'var(--ink-soft)', border: pin ? '1px solid rgba(74,103,65,.2)' : 'none' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
                {pin ? `Pin placed — ${pin.lat.toFixed(4)}°N, ${Math.abs(pin.lng).toFixed(4)}°W` : 'No pin placed yet'}
              </div>
              {dbFavorites.length > 0 ? (
                <>
                  <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 8 }}>
                    Your saved favorites ({dbFavorites.length})
                  </div>
                  {dbFavorites.slice(0,5).map((f,idx) => (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: 9, borderRadius: 4, background: 'var(--cream)', marginBottom: 5 }}>
                      <div className={`bg-${(idx%6)+1}`} style={{ width: 38, height: 38, borderRadius: 6, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{f.locations?.name}</div><div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>📍 {f.locations?.city}</div></div>
                    </div>
                  ))}
                  {dbFavorites.length > 5 && <div style={{ fontSize: 12, color: 'var(--ink-soft)', textAlign: 'center', padding: '4px 0' }}>+{dbFavorites.length - 5} more in Step 2</div>}
                </>
              ) : (
                <div style={{ padding: '1rem', background: 'var(--cream)', borderRadius: 8, fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic', textAlign: 'center' }}>
                  No favorites saved yet — you can browse all locations in Step 2.
                </div>
              )}
            </>
          )}

          {/* STEP 2 — single flat list, favorites first */}
          {step === 2 && (
            <>
              {/* Search + selection summary */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
                  {selected.size > 0 ? `${selected.size} selected` : 'Choose locations'}
                </div>
                {favsInRange.length > 0 && (
                  <button onClick={selectAllFavsInRange} style={{ fontSize: 12, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    Select all favorites
                  </button>
                )}
              </div>

              <input
                type="text"
                value={locSearch}
                onChange={e => setLocSearch(e.target.value)}
                placeholder="Search by name or city…"
                style={{ ...inputStyle, marginBottom: '1rem', fontSize: 13 }}
              />

              {/* Favorites in range — always at top */}
              {favsInRange.filter(f => {
                if (!locSearch.trim()) return true
                const q = locSearch.toLowerCase()
                return f.name.toLowerCase().includes(q) || f.city.toLowerCase().includes(q)
              }).length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--gold)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)', display: 'inline-block' }} />
                    Your favorites near this area
                    <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--ink-soft)', marginLeft: 2 }}>within {radius} mi</span>
                  </div>
                  {favsInRange
                    .filter(f => { if (!locSearch.trim()) return true; const q = locSearch.toLowerCase(); return f.name.toLowerCase().includes(q) || f.city.toLowerCase().includes(q) })
                    .map(f => <LocationRow key={String(f.id)} loc={f} isFav />)
                  }
                </>
              )}

              {/* Secret spots in range */}
              {secretInRange.filter(s => { if (!locSearch.trim()) return true; const q = locSearch.toLowerCase(); return s.name.toLowerCase().includes(q) || s.city.toLowerCase().includes(q) }).length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '1rem 0 6px' }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--cream-dark)' }} />
                    <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: '#7c5cbf', whiteSpace: 'nowrap' }}>🤫 Your secret spots</div>
                    <div style={{ flex: 1, height: 1, background: 'var(--cream-dark)' }} />
                  </div>
                  {secretInRange
                    .filter(s => { if (!locSearch.trim()) return true; const q = locSearch.toLowerCase(); return s.name.toLowerCase().includes(q) || s.city.toLowerCase().includes(q) })
                    .map(s => <LocationRow key={String(s.id)} loc={s} />)
                  }
                </>
              )}

              {/* All other published locations */}
              {(() => {
                const filtered = allLocsWithDist.filter(l => {
                  if (!locSearch.trim()) return true
                  const q = locSearch.toLowerCase()
                  return l.name.toLowerCase().includes(q) || l.city.toLowerCase().includes(q)
                })
                if (filtered.length === 0 && locSearch.trim()) {
                  return <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic', textAlign: 'center', padding: '1rem 0' }}>No locations match &quot;{locSearch}&quot;</div>
                }
                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '1rem 0 6px' }}>
                      <div style={{ flex: 1, height: 1, background: 'var(--cream-dark)' }} />
                      <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
                        {pin ? 'All locations by distance' : `All locations (${filtered.length})`}
                      </div>
                      <div style={{ flex: 1, height: 1, background: 'var(--cream-dark)' }} />
                    </div>
                    {filtered.slice(0, 100).map(loc => <LocationRow key={String(loc.id)} loc={loc} />)}
                    {filtered.length > 100 && <div style={{ fontSize: 12, color: 'var(--ink-soft)', textAlign: 'center', padding: '8px 0', fontStyle: 'italic' }}>Search to find more locations</div>}
                  </>
                )
              })()}

              {/* Favorites out of range — collapsed */}
              {favsOutRange.length > 0 && !locSearch.trim() && (
                <div style={{ marginTop: '1rem', padding: '10px 12px', background: 'var(--cream)', borderRadius: 8, border: '1px solid var(--cream-dark)', fontSize: 12, color: 'var(--ink-soft)' }}>
                  {favsOutRange.length} favorite{favsOutRange.length !== 1 ? 's' : ''} outside the {radius} mi radius
                </div>
              )}
            </>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Session name *</label>
                <input value={sessionName} onChange={e => setSessionName(e.target.value)} style={inputStyle} placeholder="e.g. Smith Family Fall Photos" />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Message to your client</label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <select value={selectedTemplate} onChange={e => applyTemplate(e.target.value)} style={{ ...inputStyle, appearance: 'none', paddingRight: 28, cursor: 'pointer', background: 'var(--cream)', fontSize: 13, color: 'var(--ink-soft)' }}>
                      <option value="">Choose a template…</option>
                      {dbTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 10, color: 'var(--ink-soft)' }}>▾</div>
                  </div>
                  <Link href="/profile#templates" style={{ display: 'flex', alignItems: 'center', padding: '0 12px', borderRadius: 4, whiteSpace: 'nowrap', fontSize: 12, fontWeight: 500, textDecoration: 'none', color: 'var(--ink-soft)', border: '1px solid var(--cream-dark)', background: 'white' }}>✏️ Edit</Link>
                </div>
                <textarea value={message} onChange={e => { setMessage(e.target.value); setSelectedTemplate('') }} rows={5} placeholder="Write a message to your client…" style={{ ...inputStyle, resize: 'vertical' }} />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Your name / studio</label>
                <input value={photographerName} onChange={e => setPhotographerName(e.target.value)} style={inputStyle} />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={labelStyle}>Link expires after</label>
                <select value={expiry} onChange={e => setExpiry(e.target.value)} style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' }}>
                  <option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option><option value="0">Never</option>
                </select>
              </div>

              <div onClick={() => setMyPhotosOnly(p => !p)} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', background: myPhotosOnly ? 'rgba(196,146,42,.06)' : 'var(--cream)', border: `1px solid ${myPhotosOnly ? 'rgba(196,146,42,.3)' : 'var(--cream-dark)'}`, borderRadius: 8, marginBottom: '1.25rem', cursor: 'pointer' }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1, border: `1.5px solid ${myPhotosOnly ? 'var(--gold)' : 'var(--sand)'}`, background: myPhotosOnly ? 'var(--gold)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--ink)' }}>{myPhotosOnly ? '✓' : ''}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>Only show photos I uploaded</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.5 }}>Client will only see your personal photos.</div>
                </div>
              </div>

              <div style={{ padding: '12px 14px', background: 'var(--cream-dark)', borderRadius: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 8 }}>
                  {selectedLocs.length} location{selectedLocs.length !== 1 ? 's' : ''} in this share
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {selectedLocs.map(l => (
                    <span key={String(l.id)} style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, background: l.type === 'secret' ? 'rgba(124,92,191,.1)' : 'white', color: l.type === 'secret' ? '#7c5cbf' : 'var(--ink-soft)', border: `1px solid ${l.type === 'secret' ? 'rgba(124,92,191,.2)' : 'var(--sand)'}` }}>
                      {l.type === 'secret' && '🤫 '}{l.name}
                    </span>
                  ))}
                  {selectedLocs.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontStyle: 'italic' }}>No locations selected</span>}
                </div>
              </div>
            </>
          )}

          {/* STEP 4 */}
          {step === 4 && generatedSlug && (
            <>
              <div style={{ textAlign: 'center', padding: '0.5rem 0 1.25rem' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🔗</div>
                <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Link is ready!</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.55 }}>Send this to your client and they&apos;ll pick their favorite spot.</div>
              </div>

              <label style={labelStyle}>Client link</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--cream)', border: '1px solid var(--sand)', borderRadius: 4, padding: '7px 7px 7px 12px', marginBottom: '1.25rem' }}>
                <span style={{ fontSize: 11, color: 'var(--sky)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                  {typeof window !== 'undefined' && `${window.location.host}/pick/${generatedSlug}`}
                </span>
                <button onClick={copyLink} style={{ background: 'var(--ink)', color: 'var(--cream)', padding: '5px 12px', borderRadius: 4, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Copy</button>
              </div>

              {[{ icon: '💬', label: 'Text message' }, { icon: '📧', label: 'Email' }, { icon: '🔗', label: 'Copy link' }].map(opt => (
                <div key={opt.label} onClick={() => opt.label === 'Copy link' ? copyLink() : setToast(`Opening ${opt.label}…`)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', borderRadius: 4, border: '1px solid var(--cream-dark)', background: 'white', cursor: 'pointer', marginBottom: 7 }}>
                  <span style={{ fontSize: 17 }}>{opt.icon}</span>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{opt.label}</div>
                </div>
              ))}

              <div style={{ background: 'var(--ink)', borderRadius: 10, padding: '1rem 1.1rem', display: 'flex', gap: 10, marginTop: '1rem' }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>🔔</span>
                <div style={{ fontSize: 12, color: 'rgba(245,240,232,.65)', lineHeight: 1.55, fontWeight: 300 }}><strong style={{ color: 'var(--cream)', fontWeight: 500 }}>You&apos;ll be notified</strong> the moment your client picks a location.</div>
              </div>
              <Link href="/dashboard" style={{ display: 'block', textAlign: 'center', marginTop: '1rem', padding: '9px 18px', borderRadius: 4, border: '1px solid var(--sand)', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>Back to dashboard →</Link>
              <button onClick={resetAll} style={{ width: '100%', marginTop: 8, padding: '9px 18px', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--ink-soft)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Create another share link</button>
            </>
          )}
        </div>

        {/* ── Footer nav (always visible, never scrolls away) ── */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--cream-dark)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: 'white' }}>
          <button
            onClick={prevStep}
            style={{ visibility: step > 1 && step < 4 ? 'visible' : 'hidden', background: 'transparent', border: '1px solid var(--sand)', color: 'var(--ink-soft)', padding: '8px 16px', borderRadius: 4, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            ← Back
          </button>

          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
            {step === 1 && (pin ? '✓ Pin placed' : 'Step 1 of 4')}
            {step === 2 && (selected.size > 0 ? `${selected.size} selected` : 'Select at least one')}
            {step === 3 && 'Step 3 of 4'}
            {step === 4 && '✓ Done!'}
          </span>

          {step < 3 && (
            <button
              onClick={nextStep}
              style={{ background: 'var(--gold)', color: 'var(--ink)', padding: '8px 18px', borderRadius: 4, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: (step === 1 && !pin) || (step === 2 && selected.size === 0) ? 0.4 : 1 }}
            >
              Next →
            </button>
          )}
          {step === 3 && (
            <button
              onClick={generateLink}
              disabled={!sessionName.trim() || isSaving}
              style={{ background: 'var(--gold)', color: 'var(--ink)', padding: '8px 18px', borderRadius: 4, border: 'none', fontSize: 13, fontWeight: 600, cursor: !sessionName.trim() || isSaving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: !sessionName.trim() || isSaving ? 0.4 : 1 }}
            >
              {isSaving ? 'Saving…' : 'Generate link →'}
            </button>
          )}
        </div>
      </div>

      {/* MAP — hidden on mobile via CSS */}
      <div className="share-map-col">
        <ShareMap locations={allMapLocations} selectedIds={selected} radius={radius} pinLocation={pin} onPinDrop={handlePinDrop} />
        <div className="share-legend" style={{ background: 'white', borderRadius: 10, padding: '.9rem 1rem', border: '1px solid var(--cream-dark)', boxShadow: '0 4px 20px rgba(26,22,18,.1)', minWidth: 180 }}>
          <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 8 }}>Legend</div>
          {[{ color: '#c4922a', label: 'Client pin' },{ color: '#4a6741', label: 'Selected' },{ color: '#7c5cbf', label: '🤫 Secret' },{ color: '#d4c9b0', label: 'Favorite' },{ color: '#3d352c', label: 'Out of range', dim: true }].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--ink)', marginBottom: 4, opacity: (item as any).dim ? 0.4 : 1 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, border: '2px solid white', flexShrink: 0 }} />{item.label}
            </div>
          ))}
        </div>
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', background: 'var(--ink)', color: 'var(--cream)', padding: '10px 18px', borderRadius: 10, fontSize: 13, border: '1px solid rgba(255,255,255,.1)', zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,.3)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}