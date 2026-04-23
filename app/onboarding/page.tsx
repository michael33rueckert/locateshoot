'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AddressSearch, { type AddressResult } from '@/components/AddressSearch'
import AppNav from '@/components/AppNav'

interface PublicLocation {
  id: string; name: string; city: string | null; state: string | null
  latitude: number; longitude: number
  access_type: string | null; tags: string[] | null
  quality_score: number | null; rating: number | null
  description: string | null; permit_required: boolean | null; permit_notes: string | null
  best_time: string | null; parking_info: string | null
  photo_url?: string | null
}

const BG_CYCLE = ['bg-1','bg-2','bg-3','bg-4','bg-5','bg-6']
const RADIUS_MI = 50

function calcDist(la1: number, lo1: number, la2: number, lo2: number) {
  const R = 3958.8, dLa = (la2-la1)*Math.PI/180, dLo = (lo2-lo1)*Math.PI/180
  const a = Math.sin(dLa/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

export default function OnboardingPage() {
  const router = useRouter()
  const [userId,     setUserId]     = useState<string | null>(null)
  const [firstName,  setFirstName]  = useState('there')
  const [pin,        setPin]        = useState<AddressResult | null>(null)
  const [locations,  setLocations]  = useState<(PublicLocation & { d: number })[]>([])
  const [selected,   setSelected]   = useState<Set<string>>(new Set())
  const [loading,    setLoading]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [ready,      setReady]      = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setUserId(user.id)
      const { data: profile } = await supabase.from('profiles').select('full_name,preferences').eq('id', user.id).single()
      if (profile?.full_name) setFirstName(profile.full_name.split(' ')[0])
      // Skip this step if the user has already onboarded
      const prefs = profile?.preferences as any
      if (prefs?.onboarded_at) { router.push('/dashboard'); return }
      setReady(true)
    }
    init()
  }, [router])

  const fetchNearby = useCallback(async (lat: number, lng: number) => {
    setLoading(true)
    try {
      // Quick bounding-box filter first to cut the fetch, then refine by haversine.
      const latDelta = RADIUS_MI / 69
      const lngDelta = RADIUS_MI / (69 * Math.cos(lat * Math.PI / 180) || 1)
      const { data } = await supabase.from('locations')
        .select('id,name,city,state,latitude,longitude,access_type,tags,quality_score,rating,description,permit_required,permit_notes,best_time,parking_info')
        .eq('status', 'published')
        .gte('latitude',  lat - latDelta)
        .lte('latitude',  lat + latDelta)
        .gte('longitude', lng - lngDelta)
        .lte('longitude', lng + lngDelta)
        .limit(200)
      const rows = (data ?? [])
        .map(r => ({ ...r, d: calcDist(lat, lng, r.latitude, r.longitude) }))
        .filter(r => r.d <= RADIUS_MI)
        .sort((a, b) => (b.quality_score ?? 0) - (a.quality_score ?? 0) || a.d - b.d)

      // Fetch one representative photo per location for the tile previews
      const ids = rows.map(r => r.id)
      const photoMap: Record<string, string> = {}
      if (ids.length > 0) {
        const { data: photos } = await supabase
          .from('location_photos')
          .select('location_id,url,created_at')
          .in('location_id', ids)
          .eq('is_private', false)
          .order('created_at', { ascending: true })
        ;(photos ?? []).forEach((p: any) => {
          if (p.location_id && p.url && !photoMap[p.location_id]) photoMap[p.location_id] = p.url
        })
      }

      setLocations(rows.map(r => ({ ...r, photo_url: photoMap[r.id] ?? null })) as any)
      // Pre-select the top 12 so it's one click to get rolling
      setSelected(new Set(rows.slice(0, 12).map(r => r.id)))
    } finally { setLoading(false) }
  }, [])

  function handleAddress(r: AddressResult) {
    setPin(r)
    fetchNearby(r.lat, r.lng)
  }

  function toggle(id: string) {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  async function addSelected() {
    if (!userId || selected.size === 0) return
    setSaving(true)
    try {
      const rows = locations.filter(l => selected.has(l.id)).map(l => ({
        user_id:            userId,
        source_location_id: l.id,
        name:               l.name,
        description:        l.description,
        city:               l.city,
        state:              l.state,
        latitude:           l.latitude,
        longitude:          l.longitude,
        access_type:        l.access_type,
        tags:               l.tags,
        permit_required:    l.permit_required,
        permit_notes:       l.permit_notes,
        best_time:          l.best_time,
        parking_info:       l.parking_info,
        is_secret:          false,
      }))
      if (rows.length > 0) {
        // Filter out anything the user already has — they shouldn't, but guard against revisits.
        const { data: existing } = await supabase.from('portfolio_locations').select('source_location_id').eq('user_id', userId)
        const existingSet = new Set((existing ?? []).map((r: any) => r.source_location_id).filter(Boolean))
        const fresh = rows.filter(r => !existingSet.has(r.source_location_id))
        if (fresh.length > 0) await supabase.from('portfolio_locations').insert(fresh as any)
      }
      await markOnboarded()
      router.push('/dashboard')
    } finally { setSaving(false) }
  }

  async function skip() {
    if (!userId) return
    setSaving(true)
    try {
      await markOnboarded()
      router.push('/dashboard')
    } finally { setSaving(false) }
  }

  async function markOnboarded() {
    if (!userId) return
    const { data } = await supabase.from('profiles').select('preferences').eq('id', userId).single()
    const prefs = (data?.preferences as any) ?? {}
    await supabase.from('profiles').update({ preferences: { ...prefs, onboarded_at: new Date().toISOString() } }).eq('id', userId)
  }

  if (!ready) {
    return (
      <div style={{ minHeight: '100svh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 28, height: 28, border: '2px solid rgba(0,0,0,.1)', borderTop: '2px solid var(--gold)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100svh', background: 'var(--cream)', display: 'flex', flexDirection: 'column' }}>
      <AppNav rightExtra={<button onClick={skip} disabled={saving} style={{ background: 'transparent', border: 'none', color: 'rgba(245,240,232,.55)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Skip for now</button>} />

      <div style={{ maxWidth: 860, width: '100%', margin: '0 auto', padding: '2.5rem 1.5rem 4rem', flex: 1 }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>Welcome, {firstName}</div>
          <h1 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 'clamp(26px,4vw,36px)', fontWeight: 900, color: 'var(--ink)', marginBottom: 6, lineHeight: 1.15 }}>
            Let's build your portfolio.
          </h1>
          <p style={{ fontSize: 15, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.6, maxWidth: 560 }}>
            Tell us where you shoot. We'll suggest locations in your area so you can get set up in one click. You can always add, edit, or remove any of them later.
          </p>
        </div>

        <div style={{ background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 6 }}>Your area (city or address)</label>
          <AddressSearch onSelect={handleAddress} placeholder="e.g. Kansas City, MO" />
          {pin && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '8px 12px', borderRadius: 6, background: 'rgba(74,103,65,.08)', border: '1px solid rgba(74,103,65,.2)', fontSize: 13, color: 'var(--sage)' }}>
              <span>📍</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{pin.shortLabel ?? pin.label}</div>
                <div style={{ fontSize: 11, fontWeight: 300, color: 'var(--ink-soft)' }}>Searching within {RADIUS_MI} miles</div>
              </div>
            </div>
          )}
        </div>

        {pin && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)' }}>
                {loading ? 'Finding locations…' : `${locations.length} location${locations.length !== 1 ? 's' : ''} nearby`}
                {locations.length > 0 && <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, marginLeft: 8 }}>({selected.size} selected)</span>}
              </div>
              {locations.length > 0 && (
                <div style={{ display: 'flex', gap: 10 }}>
                  {selected.size < locations.length && <button onClick={() => setSelected(new Set(locations.map(l => l.id)))} style={{ fontSize: 12, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, fontWeight: 500 }}>Select all</button>}
                  {selected.size > 0 && <button onClick={() => setSelected(new Set())} style={{ fontSize: 12, color: 'var(--rust)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, fontWeight: 500 }}>Clear</button>}
                </div>
              )}
            </div>

            {loading && (
              <div style={{ padding: '2rem', textAlign: 'center', background: 'white', borderRadius: 10, border: '1px solid var(--cream-dark)' }}>
                <div style={{ width: 24, height: 24, border: '2px solid var(--cream-dark)', borderTop: '2px solid var(--gold)', borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 10px' }} />
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300 }}>Loading locations near {pin?.shortLabel ?? pin?.label}…</div>
              </div>
            )}

            {!loading && locations.length === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center', background: 'white', borderRadius: 10, border: '1px dashed var(--cream-dark)' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>🌲</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 6 }}>No locations in the database yet for this area</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.6 }}>That's okay — you can add your own from the dashboard, or keep exploring the map.</div>
              </div>
            )}

            {!loading && locations.length > 0 && (
              <>
              <div style={{ padding: '10px 14px', background: 'rgba(196,146,42,.08)', border: '1px solid rgba(196,146,42,.25)', borderRadius: 8, marginBottom: 10, fontSize: 12, color: 'var(--ink)', lineHeight: 1.55 }}>
                💡 <strong style={{ fontWeight: 600 }}>Next step — add your own photos.</strong> The preview images below are Wikipedia shots so you can see what the location looks like. After you add locations to your portfolio, upload <em>your</em> professional photos — that's what clients will see on your share links.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
                {locations.map((l, i) => {
                  const sel = selected.has(l.id)
                  const cityLine = [l.city, l.state].filter(Boolean).join(', ')
                  return (
                    <div key={l.id} onClick={() => toggle(l.id)} style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${sel ? 'var(--gold)' : 'var(--cream-dark)'}`, background: sel ? 'rgba(196,146,42,.04)' : 'white', cursor: 'pointer', transition: 'all .15s', position: 'relative' }}>
                      <div className={BG_CYCLE[i % BG_CYCLE.length]} style={{ height: 100, position: 'relative', overflow: 'hidden' }}>
                        {l.photo_url && <img src={l.photo_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                        <div style={{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 4, background: sel ? 'var(--gold)' : 'rgba(255,255,255,.9)', border: `1.5px solid ${sel ? 'var(--gold)' : 'var(--cream-dark)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--ink)', zIndex: 1 }}>{sel ? '✓' : ''}</div>
                      </div>
                      <div style={{ padding: '10px 12px' }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 6 }}>📍 {cityLine || '—'} · {l.d.toFixed(1)} mi</div>
                        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: l.access_type === 'public' ? 'rgba(74,103,65,.1)' : 'rgba(181,75,42,.1)', color: l.access_type === 'public' ? 'var(--sage)' : 'var(--rust)' }}>{l.access_type === 'public' ? '● Public' : '🔒 Private'}</span>
                          {l.rating && <span style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 500 }}>★ {l.rating.toFixed(1)}</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              </>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={skip} disabled={saving} style={{ padding: '12px 22px', borderRadius: 4, background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--sand)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            Skip for now
          </button>
          <button onClick={addSelected} disabled={saving || selected.size === 0} style={{ padding: '12px 28px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: saving || selected.size === 0 ? 0.5 : 1 }}>
            {saving ? 'Adding…' : selected.size > 0 ? `Add ${selected.size} to portfolio →` : 'Select some locations first'}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
