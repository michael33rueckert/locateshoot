'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AddressSearch, { type AddressResult } from '@/components/AddressSearch'
import type { MapLocation } from '@/components/ShareMap'

const ShareMap = dynamic(() => import('@/components/ShareMap'), { ssr: false })

interface DBPortfolio {
  id: string; source_location_id: string | null
  name: string; city: string | null; state: string | null
  latitude: number | null; longitude: number | null; access_type: string | null
}
interface DBTemplate { id: string; name: string; body: string }

function calcDist(la1: number, lo1: number, la2: number, lo2: number) {
  const R = 3958.8, dLa = (la2-la1)*Math.PI/180, dLo = (lo2-lo1)*Math.PI/180
  const a = Math.sin(dLa/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function generateSlug(sessionName: string, photographerName: string) {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,30)
  return `${clean(photographerName)}-${clean(sessionName)}-${Date.now().toString(36)}`
}

const BG_CYCLE    = ['bg-1','bg-2','bg-3','bg-4','bg-5','bg-6']
const STEP_LABELS = ['Drop pin','Select','Message','Share']

export default function SharePage() {
  const [userId,           setUserId]           = useState<string | null>(null)
  const [portfolio,        setPortfolio]        = useState<DBPortfolio[]>([])
  const [dbTemplates,      setDbTemplates]      = useState<DBTemplate[]>([])
  const [dataLoading,      setDataLoading]      = useState(true)
  const [locSearch,        setLocSearch]        = useState('')
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

  // Handle ?step=3 from explore page — wait for portfolio, then translate
  // the preselected public-location id into the matching portfolio_location id.
  useEffect(() => {
    if (dataLoading) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('step') !== '3') return
    const stored = sessionStorage.getItem('sharePreselectedLocation')
    if (!stored) return
    try {
      const loc = JSON.parse(stored)
      const id = String(loc.id)
      const match = portfolio.find(p => String(p.id) === id)
        ?? portfolio.find(p => String(p.source_location_id ?? '') === id)
      if (match) {
        setSelected(new Set([String(match.id)]))
        setStep(3)
      } else {
        setToast('Add this location to your portfolio from Explore first')
        setStep(2)
      }
    } catch {}
    sessionStorage.removeItem('sharePreselectedLocation')
  }, [dataLoading, portfolio])

  const loadData = useCallback(async () => {
    setDataLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/'; return }
      setUserId(user.id)
      const [portfolioRes, templatesRes, profileRes] = await Promise.all([
        supabase.from('portfolio_locations').select('id,source_location_id,name,city,state,latitude,longitude,access_type').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('message_templates').select('id,name,body').eq('user_id', user.id).order('created_at', { ascending: true }),
        supabase.from('profiles').select('full_name').eq('id', user.id).single(),
      ])
      if (portfolioRes.data) setPortfolio(portfolioRes.data)
      if (templatesRes.data) setDbTemplates(templatesRes.data)
      if (profileRes.data?.full_name) setPhotographerName(profileRes.data.full_name)
    } catch (err) { console.error(err) }
    finally { setDataLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2800)
    return () => clearTimeout(id)
  }, [toast])

  const portfolioMapLocs: MapLocation[] = useMemo(() =>
    portfolio
      .filter(p => p.latitude != null && p.longitude != null)
      .map((p, idx) => ({
        id:     p.id,
        name:   p.name,
        city:   p.city && p.state ? `${p.city}, ${p.state}` : (p.city ?? p.state ?? ''),
        lat:    p.latitude!,
        lng:    p.longitude!,
        access: p.access_type ?? 'public',
        rating: '—',
        bg:     BG_CYCLE[idx % BG_CYCLE.length],
        type:   'favorite' as const,
        d:      pin ? calcDist(pin.lat, pin.lng, p.latitude!, p.longitude!) : null,
      }))
      .sort((a, b) => (a.d ?? 999) - (b.d ?? 999)),
  [portfolio, pin])

  const allMapLocations = portfolioMapLocs

  const portfolioInRange  = portfolioMapLocs.filter(l => l.d !== null && l.d <= radius)
  const portfolioOutRange = portfolioMapLocs.filter(l => l.d === null || l.d > radius)

  const selectedLocs = portfolioMapLocs.filter(l => selected.has(String(l.id)))

  function handleAddressSelect(result: AddressResult) {
    setPin({ lat: result.lat, lng: result.lng })
    setToast('📍 Pin dropped!')
  }
  function handlePinDrop(lat: number, lng: number) { setPin({ lat, lng }) }
  function applyTemplate(id: string) {
    const t = dbTemplates.find(t => t.id === id)
    if (!t) return
    setSelectedTemplate(id); setMessage(t.body)
  }
  function toggleSelect(id: number | string) {
    const key = String(id)
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }
  function selectAllInRange() {
    setSelected(prev => {
      const next = new Set(prev)
      portfolioInRange.forEach(l => next.add(String(l.id)))
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
      const portfolioLocationIds = selectedLocs.map(l => String(l.id))
      let expiresAt: string | null = null
      if (expiry !== '0') {
        const d = new Date()
        d.setDate(d.getDate() + parseInt(expiry))
        expiresAt = d.toISOString()
      }
      const { error } = await supabase.from('share_links').insert({
        user_id:                userId,
        slug,
        session_name:           sessionName.trim(),
        message:                message.trim() || null,
        photographer_name:      photographerName.trim() || null,
        my_photos_only:         myPhotosOnly,
        portfolio_location_ids: portfolioLocationIds,
        location_ids:           [],
        secret_ids:             [],
        expires_at:             expiresAt,
      })
      if (error) throw error
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

  if (dataLoading) {
    return (
      <div style={{ height: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cream)' }}>
        <div style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 14, fontWeight: 300 }}>Loading…</div>
      </div>
    )
  }

  return (
    <div className="share-outer">

      {/* SIDEBAR */}
      <div className="share-sidebar" style={{ background: 'white', borderRight: '1px solid var(--cream-dark)', display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

        {/* Header */}
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
              const n = i + 1, active = step === n, done = step > n
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

        {/* Scrollable step content */}
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
              {portfolio.length > 0 ? (
                <>
                  <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 8 }}>Your portfolio ({portfolio.length})</div>
                  {portfolio.slice(0,5).map((p, idx) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: 9, borderRadius: 4, background: 'var(--cream)', marginBottom: 5 }}>
                      <div className={`bg-${(idx%6)+1}`} style={{ width: 38, height: 38, borderRadius: 6, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>📍 {p.city && p.state ? `${p.city}, ${p.state}` : (p.city ?? p.state ?? '')}</div>
                      </div>
                    </div>
                  ))}
                  {portfolio.length > 5 && <div style={{ fontSize: 12, color: 'var(--ink-soft)', textAlign: 'center', padding: '4px 0' }}>+{portfolio.length - 5} more in Step 2</div>}
                </>
              ) : (
                <div style={{ padding: '1rem', background: 'var(--cream)', borderRadius: 8, fontSize: 13, color: 'var(--ink-soft)', textAlign: 'center' }}>
                  <div style={{ fontStyle: 'italic', marginBottom: 8 }}>Your portfolio is empty.</div>
                  <Link href="/explore" style={{ display: 'inline-block', padding: '7px 14px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', fontSize: 12, fontWeight: 500, textDecoration: 'none' }}>Add locations from Explore →</Link>
                </div>
              )}
            </>
          )}

          {/* STEP 2 — portfolio locations only */}
          {step === 2 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
                  {selected.size > 0 ? `${selected.size} selected` : 'Choose locations'}
                </div>
                {portfolioInRange.length > 0 && (
                  <button onClick={selectAllInRange} style={{ fontSize: 12, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    Select all in range
                  </button>
                )}
              </div>

              <input
                type="text"
                value={locSearch}
                onChange={e => setLocSearch(e.target.value)}
                placeholder="Search your portfolio by name or city…"
                style={{ ...inputStyle, marginBottom: '1rem', fontSize: 13 }}
              />

              {portfolio.length === 0 ? (
                <div style={{ padding: '2rem 1rem', background: 'var(--cream)', borderRadius: 8, border: '1px dashed var(--cream-dark)', textAlign: 'center' }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📍</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 6 }}>Your portfolio is empty</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.6, marginBottom: 14 }}>Browse locations on the Explore page and add them to your portfolio to share with clients.</div>
                  <Link href="/explore" style={{ display: 'inline-block', padding: '9px 18px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>Browse Explore →</Link>
                </div>
              ) : (() => {
                const inRange = portfolioInRange.filter(l => { if (!locSearch.trim()) return true; const q = locSearch.toLowerCase(); return l.name.toLowerCase().includes(q) || l.city.toLowerCase().includes(q) })
                const outRange = portfolioOutRange.filter(l => { if (!locSearch.trim()) return true; const q = locSearch.toLowerCase(); return l.name.toLowerCase().includes(q) || l.city.toLowerCase().includes(q) })
                return (
                  <>
                    {inRange.length > 0 && (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--gold)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)', display: 'inline-block' }} />
                          Locations in your portfolio
                          <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--ink-soft)' }}>within {radius} mi</span>
                        </div>
                        {inRange.map(l => <LocationRow key={String(l.id)} loc={l} isFav />)}
                      </>
                    )}
                    {outRange.length > 0 && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '1rem 0 6px' }}>
                          <div style={{ flex: 1, height: 1, background: 'var(--cream-dark)' }} />
                          <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>Outside {radius} mi radius</div>
                          <div style={{ flex: 1, height: 1, background: 'var(--cream-dark)' }} />
                        </div>
                        {outRange.map(l => <LocationRow key={String(l.id)} loc={l} />)}
                      </>
                    )}
                    {inRange.length === 0 && outRange.length === 0 && locSearch.trim() && (
                      <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic', textAlign: 'center', padding: '1rem 0' }}>No portfolio locations match &quot;{locSearch}&quot;</div>
                    )}
                    <div style={{ marginTop: '1.25rem', padding: '12px 14px', background: 'var(--cream)', borderRadius: 8, border: '1px solid var(--cream-dark)', textAlign: 'center' }}>
                      <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8 }}>Need more spots?</div>
                      <Link href="/explore" style={{ display: 'inline-block', padding: '7px 14px', borderRadius: 4, background: 'var(--ink)', color: 'var(--cream)', fontSize: 12, fontWeight: 500, textDecoration: 'none' }}>+ Add more from Explore</Link>
                    </div>
                  </>
                )
              })()}
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
                  <option value="7">7 days</option>
                  <option value="14">14 days</option>
                  <option value="30">30 days</option>
                  <option value="0">Never</option>
                </select>
              </div>
              <div
                onClick={() => setMyPhotosOnly(prev => !prev)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', background: myPhotosOnly ? 'rgba(196,146,42,.06)' : 'var(--cream)', border: `1px solid ${myPhotosOnly ? 'rgba(196,146,42,.3)' : 'var(--cream-dark)'}`, borderRadius: 8, marginBottom: '1.25rem', cursor: 'pointer' }}
              >
                <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1, border: `1.5px solid ${myPhotosOnly ? 'var(--gold)' : 'var(--sand)'}`, background: myPhotosOnly ? 'var(--gold)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--ink)' }}>
                  {myPhotosOnly ? '✓' : ''}
                </div>
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
                    <span key={String(l.id)} style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, background: 'white', color: 'var(--ink-soft)', border: '1px solid var(--sand)' }}>
                      {l.name}
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

        {/* Footer — always visible, never scrolls */}
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
            <button onClick={nextStep} style={{ background: 'var(--gold)', color: 'var(--ink)', padding: '8px 18px', borderRadius: 4, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: (step === 1 && !pin) || (step === 2 && selected.size === 0) ? 0.4 : 1 }}>
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

      {/* MAP */}
      <div className="share-map-col">
        <ShareMap locations={allMapLocations} selectedIds={selected} radius={radius} pinLocation={pin} onPinDrop={handlePinDrop} />
        <div className="share-legend" style={{ background: 'white', borderRadius: 10, padding: '.9rem 1rem', border: '1px solid var(--cream-dark)', boxShadow: '0 4px 20px rgba(26,22,18,.1)', minWidth: 180 }}>
          <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 8 }}>Legend</div>
          {[
            { color: '#c4922a', label: 'Client pin' },
            { color: '#4a6741', label: 'Selected'   },
            { color: '#7c5cbf', label: '🤫 Secret'  },
            { color: '#d4c9b0', label: 'Favorite'   },
            { color: '#3d352c', label: 'Out of range', dim: true },
          ].map(item => (
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