'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AddressSearch, { type AddressResult } from '@/components/AddressSearch'
import type { MapLocation } from '@/components/ShareMap'
import { useSearchParams } from 'next/navigation'

const ShareMap = dynamic(() => import('@/components/ShareMap'), { ssr: false })

// ── Types ─────────────────────────────────────────────────────────────────────

interface DBFavorite {
  id: number
  location_id: number
  locations: {
    id: number
    name: string
    city: string
    latitude: number
    longitude: number
    access_type: string
    rating: number | null
  }
}

interface DBSecret {
  id: string
  name: string
  area: string
  description: string | null
  tags: string[]
  bg: string
  lat: number | null
  lng: number | null
}

interface DBTemplate {
  id: string
  name: string
  body: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcDist(la1: number, lo1: number, la2: number, lo2: number) {
  const R = 3958.8
  const dLa = (la2 - la1) * Math.PI / 180
  const dLo = (lo2 - lo1) * Math.PI / 180
  const a =
    Math.sin(dLa / 2) ** 2 +
    Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) *
    Math.sin(dLo / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function generateSlug(sessionName: string, photographerName: string) {
  const clean = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30)
  return `${clean(photographerName)}-${clean(sessionName)}-${Date.now().toString(36)}`
}

// ── Mock recommended (replace with AI scout data later) ───────────────────────
const BASE_RECOMMENDED = [
  { id:101, name:'Berkley Riverfront Park',   city:'Kansas City, MO', lat:39.1097, lng:-94.5783, access:'public', rating:'4.5', bg:'bg-2', tags:['Waterfront','Skyline','Urban']    },
  { id:102, name:'Penn Valley Park',          city:'Kansas City, MO', lat:39.0820, lng:-94.5895, access:'public', rating:'4.4', bg:'bg-1', tags:['Park','Lake','Open fields']       },
  { id:103, name:'Swope Park Trails',         city:'Kansas City, MO', lat:38.9998, lng:-94.5369, access:'public', rating:'4.7', bg:'bg-5', tags:['Forest','Nature','Trails']        },
  { id:104, name:'Liberty Memorial & Mall',   city:'Kansas City, MO', lat:39.0762, lng:-94.5821, access:'public', rating:'4.6', bg:'bg-3', tags:['Historic','Architecture','Views'] },
  { id:105, name:'Riverfront Heritage Trail', city:'Kansas City, MO', lat:39.1064, lng:-94.5741, access:'public', rating:'4.3', bg:'bg-4', tags:['Trail','River','Urban']           },
]

const STEP_LABELS = ['Drop pin', 'Select', 'Message', 'Share']

export default function SharePage() {
  // ── Auth & data ────────────────────────────────────────────────────────────
  const [userId,      setUserId]      = useState<string | null>(null)
  const [dbFavorites, setDbFavorites] = useState<DBFavorite[]>([])
  const [dbSecrets,   setDbSecrets]   = useState<DBSecret[]>([])
  const [dbTemplates, setDbTemplates] = useState<DBTemplate[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  // ── Step state ─────────────────────────────────────────────────────────────
  const [step,             setStep]             = useState(1)
  const [pin,              setPin]              = useState<{ lat: number; lng: number } | null>(null)
  const [radius,           setRadius]           = useState(15)
  const [selected,         setSelected]         = useState<Set<number | string>>(new Set())
  const [toast,            setToast]            = useState<string | null>(null)
  const [sessionName,      setSessionName]      = useState('')
  const [message,          setMessage]          = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [photographerName, setPhotographerName] = useState('')
  const [expiry,           setExpiry]           = useState('14')
  const [myPhotosOnly,     setMyPhotosOnly]     = useState(false)
  const [generatedSlug,    setGeneratedSlug]    = useState<string | null>(null)
  const [isSaving,         setIsSaving]         = useState(false)

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setDataLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/'; return }
      setUserId(user.id)

      const [favsRes, secretsRes, templatesRes, profileRes] = await Promise.all([
        supabase.from('favorites')
          .select('id, location_id, locations(id, name, city, latitude, longitude, access_type, rating)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase.from('secret_locations')
          .select('id, name, area, description, tags, bg, lat, lng')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase.from('message_templates')
          .select('id, name, body')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true }),
        supabase.from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single(),
      ])

      if (favsRes.data)      setDbFavorites(favsRes.data as any)
      if (secretsRes.data)   setDbSecrets(secretsRes.data)
      if (templatesRes.data) setDbTemplates(templatesRes.data)
      if (profileRes.data?.full_name) setPhotographerName(profileRes.data.full_name)
    } catch (err) {
      console.error('Share page load error:', err)
    } finally {
      setDataLoading(false)
    }
  }, [])

const searchParams = useSearchParams()

useEffect(() => {
  // Jump to step 3 if coming from explore page
  const stepParam = searchParams.get('step')
  if (stepParam === '3') {
    const stored = sessionStorage.getItem('sharePreselectedLocation')
    if (stored) {
      try {
        const loc = JSON.parse(stored)
        setSelected(new Set([loc.id]))
        sessionStorage.removeItem('sharePreselectedLocation')
      } catch {}
    }
    setStep(3)
  }
}, [searchParams])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2800)
    return () => clearTimeout(id)
  }, [toast])

  // ── Computed map locations ─────────────────────────────────────────────────
  const favorites: MapLocation[] = useMemo(() =>
    dbFavorites
      .filter(f => f.locations?.latitude && f.locations?.longitude)
      .map((f, idx) => ({
        id:     f.location_id,
        name:   f.locations.name,
        city:   f.locations.city,
        lat:    f.locations.latitude,
        lng:    f.locations.longitude,
        access: f.locations.access_type ?? 'public',
        rating: f.locations.rating?.toString() ?? '—',
        bg:     `bg-${(idx % 6) + 1}`,
        type:   'favorite' as const,
        d:      pin ? calcDist(pin.lat, pin.lng, f.locations.latitude, f.locations.longitude) : null,
      }))
      .sort((a, b) => (a.d ?? 999) - (b.d ?? 999)),
  [dbFavorites, pin])

  const secretLocs: MapLocation[] = useMemo(() =>
    dbSecrets
      .filter(s => s.lat && s.lng)
      .map(s => ({
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
      }))
      .sort((a, b) => (a.d ?? 999) - (b.d ?? 999)),
  [dbSecrets, pin])

  const recommended: MapLocation[] = useMemo(() =>
    BASE_RECOMMENDED.map(r => ({
      ...r,
      type: 'recommended' as const,
      d:    pin ? calcDist(pin.lat, pin.lng, r.lat, r.lng) : null,
    })).sort((a, b) => (a.d ?? 999) - (b.d ?? 999)),
  [pin])

  const allLocations = useMemo(() => [...favorites, ...secretLocs, ...recommended], [favorites, secretLocs, recommended])

  const favsInRange   = favorites.filter(f => f.d !== null && f.d <= radius)
  const favsOutRange  = favorites.filter(f => f.d === null || f.d > radius)
  const secretInRange = secretLocs.filter(s => s.d !== null && s.d <= radius)
  const recInRange    = recommended.filter(r => r.d !== null && r.d <= radius)
  const selectedLocs  = allLocations.filter(l => selected.has(l.id))

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleAddressSelect(result: AddressResult) {
    setPin({ lat: result.lat, lng: result.lng })
    setToast('📍 Pin dropped!')
  }

  function handlePinDrop(lat: number, lng: number) {
    setPin({ lat, lng })
  }

  function applyTemplate(id: string) {
    const t = dbTemplates.find(t => t.id === id)
    if (!t) return
    setSelectedTemplate(id)
    setMessage(t.body)
  }

  function toggleSelect(id: number | string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAllFavs() {
    setSelected(prev => {
      const next = new Set(prev)
      favsInRange.forEach(f => next.add(f.id))
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
    if (!userId || !sessionName.trim()) { setToast('Please enter a session name'); return }
    setIsSaving(true)
    try {
      const slug        = generateSlug(sessionName, photographerName || 'photographer')
      const locationIds = [...selected].filter(id => typeof id === 'number') as number[]
      const secretIds   = [...selected].filter(id => typeof id === 'string') as string[]
      let expiresAt: string | null = null
      if (expiry !== '0') {
        const d = new Date()
        d.setDate(d.getDate() + parseInt(expiry))
        expiresAt = d.toISOString()
      }
      const { error } = await supabase.from('share_links').insert({
        user_id: userId, slug, session_name: sessionName.trim(),
        message: message.trim() || null,
        photographer_name: photographerName.trim() || null,
        my_photos_only: myPhotosOnly,
        location_ids: locationIds, secret_ids: secretIds,
        expires_at: expiresAt,
      })
      if (error) throw error
      setGeneratedSlug(slug)
      setStep(4)
      setToast('🔗 Share link created!')
    } catch (err) {
      console.error(err)
      setToast('⚠ Could not create link — please try again')
    } finally {
      setIsSaving(false)
    }
  }

  function copyLink() {
    if (!generatedSlug) return
    const url = `${window.location.origin}/pick/${generatedSlug}`
    navigator.clipboard?.writeText(url).catch(() => {})
    setToast('📋 Link copied to clipboard!')
  }

  function resetAll() {
    setStep(1); setPin(null); setSelected(new Set())
    setMyPhotosOnly(false); setGeneratedSlug(null)
    setSessionName(''); setMessage(''); setSelectedTemplate('')
  }

  // ── Shared styles ──────────────────────────────────────────────────────────
  const rowStyle = (sel: boolean, isSecret = false): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 9,
    padding: 9, borderRadius: 4, cursor: 'pointer',
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
    width: '100%', padding: '9px 12px',
    border: '1px solid var(--cream-dark)', borderRadius: 4,
    fontFamily: 'var(--font-dm-sans), sans-serif',
    fontSize: 14, color: 'var(--ink)', background: 'white', outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 500,
    textTransform: 'uppercase', letterSpacing: '.07em',
    color: 'var(--ink-soft)', marginBottom: 5,
  }

  function LocationRow({ loc, showTags = false }: { loc: MapLocation & { tags?: string[] }, showTags?: boolean }) {
    const sel      = selected.has(loc.id)
    const isSecret = loc.type === 'secret'
    const isRec    = loc.type === 'recommended'
    return (
      <div onClick={() => toggleSelect(loc.id)} style={rowStyle(sel, isSecret)}>
        <div style={checkStyle(sel)}>{sel ? '✓' : ''}</div>
        <div className={loc.bg} style={{ width: 42, height: 42, borderRadius: 6, flexShrink: 0, position: 'relative' }}>
          {isSecret && (
            <div style={{ position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: '50%', background: 'rgba(124,92,191,.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8 }}>🤫</div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>
            {loc.name}
            {isRec    && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--sky)',   fontWeight: 400 }}>Recommended</span>}
            {isSecret && <span style={{ marginLeft: 6, fontSize: 10, color: '#7c5cbf',      fontWeight: 500 }}>🤫 Secret spot</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>📍 {loc.city}</div>
          {showTags && (loc as any).tags && (
            <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
              {((loc as any).tags as string[]).slice(0, 3).map((t: string) => (
                <span key={t} style={{ padding: '2px 6px', borderRadius: 20, fontSize: 10, background: 'white', color: 'var(--ink-soft)', border: '1px solid var(--sand)' }}>{t}</span>
              ))}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-playfair), serif', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
            {loc.d?.toFixed(1) ?? '—'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>mi</div>
        </div>
      </div>
    )
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (dataLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cream)' }}>
        <div style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 14, fontWeight: 300 }}>Loading your locations…</div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '440px 1fr', height: '100vh', overflow: 'hidden' }}>

      {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
      <div style={{ background: 'white', borderRight: '1px solid var(--cream-dark)', display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <Link href="/" style={{ fontFamily: 'var(--font-playfair), serif', fontSize: 17, fontWeight: 900, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)', display: 'inline-block' }} />
              LocateShoot
            </Link>
            <Link href="/dashboard" style={{ fontSize: 12, color: 'var(--ink-soft)', textDecoration: 'none' }}>← Dashboard</Link>
          </div>

          <div style={{ fontFamily: 'var(--font-playfair), serif', fontSize: 22, fontWeight: 700, lineHeight: 1.15, color: 'var(--ink)', marginBottom: 4 }}>
            Share locations<br />with your client
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.55, marginBottom: '1.25rem' }}>
            Drop a pin, choose locations, and send your client a link to pick their favorite.
          </div>

          {/* Step tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--cream-dark)', margin: '0 -1.5rem', padding: '0 1.5rem' }}>
            {STEP_LABELS.map((label, i) => {
              const n = i + 1, active = step === n, done = step > n
              return (
                <div
                  key={n}
                  onClick={() => goToStep(n)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '9px 0', marginRight: 16, fontSize: 12, fontWeight: 500, cursor: 'pointer', color: active ? 'var(--ink)' : done ? 'var(--sage)' : 'var(--ink-soft)', borderBottom: `2px solid ${active ? 'var(--gold)' : 'transparent'}`, whiteSpace: 'nowrap' }}
                >
                  <span style={{ width: 17, height: 17, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, background: active ? 'var(--gold)' : done ? 'var(--sage)' : 'var(--cream-dark)', color: active ? 'var(--ink)' : done ? 'white' : 'var(--ink-soft)' }}>
                    {done ? '✓' : n}
                  </span>
                  {label}
                </div>
              )
            })}
          </div>
        </div>

        {/* Step body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>

          {/* ── STEP 1: Pin ── */}
          {step === 1 && (
            <>
              {/* Mapbox address search */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={labelStyle}>Search for your client&apos;s area</label>
                <AddressSearch
                  onSelect={handleAddressSelect}
                  placeholder="Try 'Loose Park Kansas City' or a full address…"
                />
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 6, fontWeight: 300 }}>
                  Or click directly on the map ↓
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.25rem' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--cream-dark)' }} />
                <span style={{ fontSize: 11, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>then set radius</span>
                <div style={{ flex: 1, height: 1, background: 'var(--cream-dark)' }} />
              </div>

              {/* Radius slider */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)' }}>Search radius</span>
                  <span style={{ fontFamily: 'var(--font-playfair), serif', fontSize: 20, fontWeight: 700, color: 'var(--gold)' }}>{radius} mi</span>
                </div>
                <input
                  type="range" min={2} max={50} value={radius} step={1}
                  onChange={e => setRadius(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--gold)' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--ink-soft)', marginTop: 2 }}>
                  <span>2 mi</span><span>50 mi</span>
                </div>
              </div>

              {/* Pin status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', borderRadius: 4, fontSize: 13, marginBottom: '1.25rem', background: pin ? 'rgba(74,103,65,.08)' : 'var(--cream-dark)', color: pin ? 'var(--sage)' : 'var(--ink-soft)', border: pin ? '1px solid rgba(74,103,65,.2)' : 'none' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
                {pin ? `Pin placed at ${pin.lat.toFixed(4)}°N, ${Math.abs(pin.lng).toFixed(4)}°W` : 'No pin placed yet'}
              </div>

              {/* Favorites preview */}
              {dbFavorites.length > 0 ? (
                <>
                  <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 8 }}>
                    Your saved favorites ({dbFavorites.length})
                  </div>
                  {dbFavorites.slice(0, 5).map((f, idx) => (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: 9, borderRadius: 4, background: 'var(--cream)', marginBottom: 5 }}>
                      <div className={`bg-${(idx % 6) + 1}`} style={{ width: 38, height: 38, borderRadius: 6, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{f.locations?.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>📍 {f.locations?.city}</div>
                      </div>
                      {f.locations?.rating && (
                        <span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: 'rgba(196,146,42,.12)', color: 'var(--gold)', border: '1px solid rgba(196,146,42,.25)', flexShrink: 0 }}>
                          ★ {f.locations.rating}
                        </span>
                      )}
                    </div>
                  ))}
                  {dbFavorites.length > 5 && (
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)', textAlign: 'center', padding: '4px 0' }}>
                      +{dbFavorites.length - 5} more — all shown in Step 2
                    </div>
                  )}
                </>
              ) : (
                <div style={{ padding: '1rem', background: 'var(--cream)', borderRadius: 8, fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic', textAlign: 'center' }}>
                  No favorites saved yet — browse the map to save locations!
                </div>
              )}

              {dbSecrets.length > 0 && (
                <div style={{ marginTop: '1rem', padding: '10px 14px', background: 'rgba(124,92,191,.05)', border: '1px solid rgba(124,92,191,.2)', borderRadius: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>🤫</span>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.55, fontWeight: 300 }}>
                    You have <strong style={{ fontWeight: 500, color: 'var(--ink)' }}>{dbSecrets.length} secret location{dbSecrets.length !== 1 ? 's' : ''}</strong> — they&apos;ll appear in Step 2.
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── STEP 2: Select ── */}
          {step === 2 && (
            <>
              {/* Favorites */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>Your favorites</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{favsInRange.length} within {radius} mi</div>
                </div>
                {favsInRange.length > 0 && (
                  <button onClick={selectAllFavs} style={{ fontSize: 12, color: 'var(--gold)', background: 'none', border: 'none', fontFamily: 'inherit', cursor: 'pointer', padding: 0 }}>
                    Select all
                  </button>
                )}
              </div>

              {favsInRange.length === 0 && favorites.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic', padding: '8px 0', marginBottom: 8 }}>
                  No favorites saved yet — <Link href="/explore" style={{ color: 'var(--gold)' }}>browse the map</Link> to add some.
                </div>
              )}
              {favsInRange.length === 0 && favorites.length > 0 && (
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic', padding: '8px 0', marginBottom: 8 }}>
                  No favorites within {radius} mi — try increasing the radius.
                </div>
              )}

              {favsInRange.map(f => <LocationRow key={f.id} loc={f} />)}

              {favsOutRange.length > 0 && (
                <>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.08em', margin: '8px 0 6px' }}>
                    Outside radius
                  </div>
                  {favsOutRange.map(f => (
                    <div key={f.id} style={{ ...rowStyle(false), opacity: .35, pointerEvents: 'none' }}>
                      <div style={checkStyle(false)} />
                      <div className={f.bg} style={{ width: 42, height: 42, borderRadius: 6, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{f.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>📍 {f.city}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--font-playfair), serif', fontSize: 14, fontWeight: 600 }}>{f.d?.toFixed(1) ?? '—'}</div>
                        <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>mi</div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Secret spots */}
              {secretInRange.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '1.25rem 0 8px' }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--cream-dark)' }} />
                    <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: '#7c5cbf', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7c5cbf', display: 'inline-block' }} />
                      🤫 Your secret spots
                    </div>
                    <div style={{ flex: 1, height: 1, background: 'var(--cream-dark)' }} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: 10, lineHeight: 1.5 }}>
                    Shown to clients with a special badge — they&apos;ll know it&apos;s one of your hidden gems.
                  </div>
                  {secretInRange.map(s => <LocationRow key={s.id} loc={s} showTags />)}
                </>
              )}

              {/* Recommended */}
              {recInRange.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '1.25rem 0 8px' }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--cream-dark)' }} />
                    <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--sky)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--sky)', display: 'inline-block' }} />
                      Recommended nearby
                    </div>
                    <div style={{ flex: 1, height: 1, background: 'var(--cream-dark)' }} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: 10, lineHeight: 1.5 }}>
                    Other well-rated public locations near this area.
                  </div>
                  {recInRange.slice(0, 5).map(r => <LocationRow key={r.id} loc={r} showTags />)}
                </>
              )}
            </>
          )}

          {/* ── STEP 3: Message ── */}
          {step === 3 && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Session name *</label>
                <input
                  value={sessionName}
                  onChange={e => setSessionName(e.target.value)}
                  style={inputStyle}
                  placeholder="e.g. Smith Family Fall Photos"
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Message to your client</label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <select
                      value={selectedTemplate}
                      onChange={e => applyTemplate(e.target.value)}
                      style={{ ...inputStyle, appearance: 'none', paddingRight: 28, cursor: 'pointer', background: 'var(--cream)', fontSize: 13, color: 'var(--ink-soft)' }}
                    >
                      <option value="">Choose a template…</option>
                      {dbTemplates.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 10, color: 'var(--ink-soft)' }}>▾</div>
                  </div>
                  <Link href="/profile#templates" style={{ display: 'flex', alignItems: 'center', padding: '0 12px', borderRadius: 4, whiteSpace: 'nowrap', fontSize: 12, fontWeight: 500, textDecoration: 'none', color: 'var(--ink-soft)', border: '1px solid var(--cream-dark)', background: 'white' }}>
                    ✏️ Edit
                  </Link>
                </div>
                {dbTemplates.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 8, fontStyle: 'italic' }}>
                    No templates yet — <Link href="/profile#templates" style={{ color: 'var(--gold)' }}>add some in your profile</Link>.
                  </div>
                )}
                <textarea
                  value={message}
                  onChange={e => { setMessage(e.target.value); setSelectedTemplate('') }}
                  rows={5}
                  placeholder="Write a message to your client…"
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4, fontWeight: 300 }}>
                  Choosing a template fills in the message — you can still edit it freely.
                </div>
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

              {/* My photos only */}
              <div
                onClick={() => setMyPhotosOnly(p => !p)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', background: myPhotosOnly ? 'rgba(196,146,42,.06)' : 'var(--cream)', border: `1px solid ${myPhotosOnly ? 'rgba(196,146,42,.3)' : 'var(--cream-dark)'}`, borderRadius: 8, marginBottom: '1.25rem', cursor: 'pointer', transition: 'all .18s' }}
              >
                <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1, border: `1.5px solid ${myPhotosOnly ? 'var(--gold)' : 'var(--sand)'}`, background: myPhotosOnly ? 'var(--gold)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--ink)', transition: 'all .15s' }}>
                  {myPhotosOnly ? '✓' : ''}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>Only show photos I uploaded</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.5 }}>Your client will only see photos you personally added — not photos from other community members.</div>
                </div>
              </div>

              {/* Selected summary */}
              <div style={{ padding: '12px 14px', background: 'var(--cream-dark)', borderRadius: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 8 }}>
                  {selectedLocs.length} location{selectedLocs.length !== 1 ? 's' : ''} in this share
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {selectedLocs.map(l => (
                    <span key={l.id} style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, background: l.type === 'secret' ? 'rgba(124,92,191,.1)' : l.type === 'recommended' ? 'rgba(61,110,140,.1)' : 'white', color: l.type === 'secret' ? '#7c5cbf' : l.type === 'recommended' ? 'var(--sky)' : 'var(--ink-soft)', border: `1px solid ${l.type === 'secret' ? 'rgba(124,92,191,.2)' : l.type === 'recommended' ? 'rgba(61,110,140,.2)' : 'var(--sand)'}` }}>
                      {l.type === 'secret' && '🤫 '}{l.name}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── STEP 4: Share ── */}
          {step === 4 && generatedSlug && (
            <>
              <div style={{ textAlign: 'center', padding: '0.5rem 0 1.25rem' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🔗</div>
                <div style={{ fontFamily: 'var(--font-playfair), serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Link is ready!</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.55 }}>
                  Send this to your client. They&apos;ll see each location and choose their favorite.
                </div>
              </div>

              {myPhotosOnly && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(196,146,42,.06)', border: '1px solid rgba(196,146,42,.2)', borderRadius: 6, marginBottom: '1rem' }}>
                  <span>📷</span>
                  <div style={{ fontSize: 12, color: 'var(--gold)' }}>Client will only see photos you uploaded</div>
                </div>
              )}

              {selectedLocs.some(l => l.type === 'secret') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(124,92,191,.06)', border: '1px solid rgba(124,92,191,.2)', borderRadius: 6, marginBottom: '1rem' }}>
                  <span>🤫</span>
                  <div style={{ fontSize: 12, color: '#7c5cbf' }}>
                    Includes {selectedLocs.filter(l => l.type === 'secret').length} secret location{selectedLocs.filter(l => l.type === 'secret').length > 1 ? 's' : ''}
                  </div>
                </div>
              )}

              <label style={labelStyle}>Client link</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--cream)', border: '1px solid var(--sand)', borderRadius: 4, padding: '7px 7px 7px 12px', marginBottom: '1.25rem' }}>
                <span style={{ fontSize: 11, color: 'var(--sky)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                  {window.location.host}/pick/{generatedSlug}
                </span>
                <button onClick={copyLink} style={{ background: 'var(--ink)', color: 'var(--cream)', padding: '5px 12px', borderRadius: 4, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Copy
                </button>
              </div>

              {[
                { icon: '💬', label: 'Text message', sub: 'Open in Messages app' },
                { icon: '📧', label: 'Email',        sub: 'Open in your email client' },
                { icon: '🔗', label: 'Copy link',    sub: 'Paste anywhere' },
              ].map(opt => (
                <div
                  key={opt.label}
                  onClick={() => opt.label === 'Copy link' ? copyLink() : setToast(`Opening ${opt.label}…`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', borderRadius: 4, border: '1px solid var(--cream-dark)', background: 'white', cursor: 'pointer', marginBottom: 7 }}
                >
                  <span style={{ fontSize: 17 }}>{opt.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300 }}>{opt.sub}</div>
                  </div>
                </div>
              ))}

              <div style={{ background: 'var(--ink)', borderRadius: 10, padding: '1rem 1.1rem', display: 'flex', gap: 10, marginTop: '1rem' }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>🔔</span>
                <div style={{ fontSize: 12, color: 'rgba(245,240,232,.65)', lineHeight: 1.55, fontWeight: 300 }}>
                  <strong style={{ color: 'var(--cream)', fontWeight: 500 }}>You&apos;ll be notified by email</strong> the moment your client picks a location. It also appears in your dashboard.
                </div>
              </div>

              <Link href="/dashboard" style={{ display: 'block', textAlign: 'center', marginTop: '1rem', padding: '9px 18px', borderRadius: 4, border: '1px solid var(--sand)', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
                Back to dashboard →
              </Link>
              <button onClick={resetAll} style={{ width: '100%', marginTop: 8, padding: '9px 18px', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--ink-soft)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                Create another share link
              </button>
            </>
          )}
        </div>

        {/* Footer nav */}
        <div style={{ padding: '.9rem 1.5rem', borderTop: '1px solid var(--cream-dark)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: 'white' }}>
          <button
            onClick={prevStep}
            style={{ visibility: step > 1 && step < 4 ? 'visible' : 'hidden', background: 'transparent', border: '1px solid var(--sand)', color: 'var(--ink-soft)', padding: '5px 12px', borderRadius: 4, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            ← Back
          </button>

          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
            {step === 1 && (pin ? '✓ Pin placed — click Next' : 'Step 1 of 4')}
            {step === 2 && (selected.size > 0 ? `${selected.size} location${selected.size > 1 ? 's' : ''} selected` : 'Select at least one')}
            {step === 3 && 'Step 3 of 4'}
            {step === 4 && 'Link is ready!'}
          </span>

          {step < 3 && (
            <button
              onClick={nextStep}
              style={{ background: 'var(--gold)', color: 'var(--ink)', padding: '5px 14px', borderRadius: 4, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: (step === 1 && !pin) || (step === 2 && selected.size === 0) ? 0.4 : 1 }}
            >
              Next →
            </button>
          )}
          {step === 3 && (
            <button
              onClick={generateLink}
              disabled={!sessionName.trim() || isSaving}
              style={{ background: 'var(--gold)', color: 'var(--ink)', padding: '5px 14px', borderRadius: 4, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: !sessionName.trim() || isSaving ? 0.4 : 1 }}
            >
              {isSaving ? 'Saving…' : 'Generate link →'}
            </button>
          )}
        </div>
      </div>

      {/* ── MAP ──────────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', height: '100vh' }}>
        <ShareMap
          locations={allLocations}
          selectedIds={selected}
          radius={radius}
          pinLocation={pin}
          onPinDrop={handlePinDrop}
        />

        {/* Legend */}
        <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 500, background: 'white', borderRadius: 10, padding: '.9rem 1rem', border: '1px solid var(--cream-dark)', boxShadow: '0 4px 20px rgba(26,22,18,.1)', minWidth: 200 }}>
          <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 8 }}>Legend</div>
          {[
            { color: '#c4922a', label: 'Client area pin'        },
            { color: '#4a6741', label: 'Selected location'       },
            { color: '#7c5cbf', label: '🤫 Secret spot'          },
            { color: '#d4c9b0', label: 'Favorite · in range'     },
            { color: '#3d6e8c', label: 'Recommended · in range'  },
            { color: '#3d352c', label: 'Out of range', dim: true  },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--ink-mid)', marginBottom: 4, opacity: (item as any).dim ? 0.5 : 1 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, border: '2px solid white', flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,.2)' }} />
              {item.label}
            </div>
          ))}
          {pin && (
            <div style={{ borderTop: '1px solid var(--cream-dark)', marginTop: 8, paddingTop: 8, fontSize: 10, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
              {pin.lat.toFixed(4)}°N  {Math.abs(pin.lng).toFixed(4)}°W
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', background: 'var(--ink)', color: 'var(--cream)', padding: '10px 18px', borderRadius: 10, fontSize: 13, border: '1px solid rgba(255,255,255,.1)', zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,.3)', animation: 'toast-in .25s ease' }}>
          {toast}
        </div>
      )}
    </div>
  )
}