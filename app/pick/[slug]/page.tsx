'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { ClientLocation } from '@/components/ClientMap'

const ClientMap = dynamic(() => import('@/components/ClientMap'), { ssr: false })

const BG_CYCLE = ['bg-1','bg-2','bg-3','bg-4','bg-5','bg-6']

type FullLocation = ClientLocation & { tags: string[]; desc: string; permit: string | null; saves: number; photoUrl: string | null }

export default function ClientPickerPage() {
  const params = useParams()
  const slug   = params?.slug as string

  const [shareData,        setShareData]        = useState<any>(null)
  const [branding,         setBranding]         = useState<any>(null)
  const [locations,        setLocations]        = useState<FullLocation[]>([])
  const [loading,          setLoading]          = useState(true)
  const [error,            setError]            = useState<string | null>(null)
  const [activeId,         setActiveId]         = useState<any>(null)
  const [chosenId,         setChosenId]         = useState<any>(null)
  const [detailLoc,        setDetailLoc]        = useState<FullLocation | null>(null)
  const [confirmed,        setConfirmed]        = useState(false)
  const [showEmailPrompt,  setShowEmailPrompt]  = useState(false)
  const [clientEmail,      setClientEmail]      = useState('')
  const [emailError,       setEmailError]       = useState('')
  const [submitting,       setSubmitting]       = useState(false)
  const [mobileMapVisible, setMobileMapVisible] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mobileMapVisible) setTimeout(() => window.dispatchEvent(new Event('resize')), 150)
  }, [mobileMapVisible])

  useEffect(() => {
    if (!slug) return
    fetch(`/api/pick-data/${slug}`)
      .then(async res => {
        const json = await res.json()
        if (!res.ok) {
          setError(json.error === 'expired'
            ? 'This share link has expired. Please ask your photographer for a new one.'
            : 'This share link could not be found.')
          return
        }
        const { share, branding, locations: locs, secrets } = json
        setShareData(share)
        setBranding(branding)

        const all: FullLocation[] = []

        ;(locs ?? []).forEach((loc: any, idx: number) => {
          all.push({
            id:     loc.id,
            name:   loc.name,
            city:   [loc.city, loc.state].filter(Boolean).join(', ') || 'Unknown',
            lat:    loc.latitude,
            lng:    loc.longitude,
            access: loc.access_type ?? 'public',
            rating: loc.quality_score ? (loc.quality_score / 20).toFixed(1) : '—',
            bg:     BG_CYCLE[idx % BG_CYCLE.length],
            type:   'favorite',
            tags:   loc.tags ?? [],
            desc:   loc.description ?? '',
            permit: loc.permit_required ? `Permit required${loc.permit_notes ? ' — ' + loc.permit_notes : ''}` : 'No permit required',
            saves:  loc.save_count ?? 0,
            photoUrl: loc.photo_url ?? null,
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
            permit: null, saves: 0,
            photoUrl: null,
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
    if (showEmailPrompt) setTimeout(() => emailRef.current?.focus(), 100)
  }, [showEmailPrompt])

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

  async function savePick(email: string | null) {
    if (!shareData || !chosenId) return
    setSubmitting(true)
    const chosen = locations.find(l => String(l.id) === String(chosenId))
    try {
      await supabase.from('client_picks').insert({
        share_link_id: shareData.id,
        client_email:  email ?? null,
        location_name: chosen?.name ?? null,
      })
    } catch (e) { console.error(e) }
    setSubmitting(false); setShowEmailPrompt(false); setConfirmed(true)
  }

  function confirmChoice() {
    if (!chosenId) return
    if (shareData?.is_permanent) setShowEmailPrompt(true)
    else savePick(null)
  }

  function submitEmail() {
    const email = clientEmail.trim()
    if (!email || !email.includes('@')) { setEmailError('Please enter a valid email.'); return }
    setEmailError(''); savePick(email)
  }

  const chosenLoc = locations.find(l => String(l.id) === String(chosenId)) ?? null
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
              {chosenLoc.photoUrl && <img src={chosenLoc.photoUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>{chosenLoc.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 3 }}>📍 {chosenLoc.city}</div>
            </div>
          </div>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  return (
    <div style={{ height: '100svh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--ink)' }}>

      {/* Header */}
      <div style={{ background: 'var(--ink)', padding: '1.25rem 1.5rem', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        {branding?.remove_ls_branding && branding?.logo_url ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem' }}>
            <img src={branding.logo_url} alt={branding.studio_name ?? 'Studio logo'} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', background: 'rgba(255,255,255,.08)' }} />
            {branding.show_studio_name !== false && branding.studio_name && (
              <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 15, fontWeight: 700, color: 'var(--cream)' }}>{branding.studio_name}</div>
            )}
          </div>
        ) : (
          <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 15, fontWeight: 900, color: 'rgba(245,240,232,.3)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: '1rem' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', display: 'inline-block' }} />LocateShoot
          </div>
        )}
        <h1 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 'clamp(22px,4vw,36px)', fontWeight: 900, lineHeight: 1.1, color: 'var(--cream)', marginBottom: '.4rem' }}>
          Choose your <em style={{ fontStyle: 'italic', color: isGoldAccent ? 'var(--gold)' : accentColor }}>perfect</em> spot
        </h1>
        {shareData?.message && <p style={{ fontSize: 14, fontWeight: 300, color: 'rgba(245,240,232,.55)', lineHeight: 1.6, maxWidth: 560, marginBottom: '.75rem' }}>{shareData.message}</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
          {shareData?.photographer_name && <div style={{ fontSize: 12, color: 'rgba(245,240,232,.4)' }}>📷 {shareData.photographer_name}</div>}
          {shareData?.session_name && <div style={{ fontSize: 12, color: 'rgba(245,240,232,.4)' }}>🗒 {shareData.session_name}</div>}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 2, background: 'rgba(255,255,255,.08)', flexShrink: 0 }}>
        <div style={{ height: '100%', background: isGoldAccent ? 'var(--gold)' : accentColor, width: chosenId ? '100%' : '0%', transition: 'width .5s ease' }} />
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
            ) : locations.map((loc, i) => {
              const isChosen = String(chosenId) === String(loc.id)
              const isActive = String(activeId) === String(loc.id)
              return (
                <div key={String(loc.id)} onClick={() => { setDetailLoc(loc); setActiveId(loc.id) }}
                  style={{ display: 'flex', gap: 12, padding: '12px 1.25rem', borderBottom: '1px solid var(--cream-dark)', cursor: 'pointer', background: isActive ? 'rgba(196,146,42,.06)' : 'white', borderLeft: `3px solid ${isChosen ? 'var(--sage)' : isActive ? 'var(--gold)' : 'transparent'}`, transition: 'all .15s' }}>
                  <div className={loc.bg} style={{ width: 60, height: 60, borderRadius: 8, flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
                    {loc.photoUrl && <img src={loc.photoUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                    <div style={{ position: 'absolute', top: 4, left: 4, width: 22, height: 22, borderRadius: '50%', background: isChosen ? 'rgba(74,103,65,.9)' : 'rgba(26,22,18,.6)', color: 'white', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                      {isChosen ? '✓' : i + 1}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>📍 {loc.city}</div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <span style={{ padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: loc.access === 'public' ? 'rgba(74,103,65,.1)' : 'rgba(181,75,42,.1)', color: loc.access === 'public' ? 'var(--sage)' : 'var(--rust)', border: `1px solid ${loc.access === 'public' ? 'rgba(74,103,65,.2)' : 'rgba(181,75,42,.2)'}` }}>
                        {loc.access === 'public' ? '● Public' : '🔒 Private'}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: isChosen ? 'var(--sage)' : 'var(--sky)', flexShrink: 0, alignSelf: 'center' }}>
                    {isChosen ? '✓ Selected' : 'View →'}
                  </div>
                </div>
              )
            })}
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
          <ClientMap locations={locations} activeId={activeId} chosenId={chosenId} onMarkerClick={handleMarkerClick} />
        </div>
      </div>

      {/* Mobile map toggle */}
      <button className="pick-mobile-toggle" onClick={() => setMobileMapVisible(p => !p)} style={{ display: 'none' }}>
        {mobileMapVisible ? '☰ View List' : '🗺 View Map'}
      </button>

      {/* Confirm bar */}
      <div style={{ background: 'var(--ink)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', borderTop: '1px solid rgba(255,255,255,.08)', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.07em', color: 'rgba(245,240,232,.35)', marginBottom: 3 }}>Your selection</div>
          {chosenLoc
            ? <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 16, fontWeight: 700, color: 'var(--cream)' }}>{chosenLoc.name}</div>
            : <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 14, color: 'rgba(245,240,232,.25)', fontStyle: 'italic' }}>Tap a location above</div>
          }
        </div>
        <button onClick={confirmChoice} disabled={!chosenId || submitting}
          style={{ padding: '12px 24px', borderRadius: 4, border: 'none', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: chosenId ? 'pointer' : 'default', background: isGoldAccent ? 'var(--gold)' : accentColor, color: isGoldAccent ? 'var(--ink)' : 'white', opacity: chosenId ? 1 : 0.35, flexShrink: 0, whiteSpace: 'nowrap' }}>
          {submitting ? 'Sending…' : 'Send my choice →'}
        </button>
      </div>

      {/* Detail panel */}
      {detailLoc && (
        <>
          <div onClick={() => setDetailLoc(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,.6)', backdropFilter: 'blur(4px)', zIndex: 400 }} />
          <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 580, background: 'white', borderRadius: '16px 16px 0 0', zIndex: 500, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 -8px 48px rgba(26,22,18,.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--sand)' }} />
            </div>
            <button onClick={() => setDetailLoc(null)} style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: '50%', background: 'rgba(26,22,18,.6)', border: 'none', cursor: 'pointer', fontSize: 16, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>✕</button>
            <div className={detailLoc.bg} style={{ height: 200, position: 'relative', overflow: 'hidden' }}>
              {detailLoc.photoUrl && <img src={detailLoc.photoUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
              <div style={{ position: 'absolute', top: 12, left: 12, padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: detailLoc.access === 'public' ? 'rgba(74,103,65,.85)' : 'rgba(181,75,42,.85)', color: detailLoc.access === 'public' ? '#c8e8c4' : '#ffd0c0', zIndex: 1 }}>
                {detailLoc.access === 'public' ? '● Public' : '🔒 Private'}
              </div>
            </div>
            <div style={{ padding: '1.25rem' }}>
              <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 3 }}>{detailLoc.name}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: '1rem' }}>📍 {detailLoc.city}</div>
              {detailLoc.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: '1rem' }}>
                  {detailLoc.tags.map((t: string) => <span key={t} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, background: 'var(--cream-dark)', color: 'var(--ink-soft)', border: '1px solid var(--sand)' }}>{t}</span>)}
                </div>
              )}
              {detailLoc.desc && <p style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.7, marginBottom: '1.25rem' }}>{detailLoc.desc}</p>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: '1.5rem' }}>
                {[
                  { icon: '🔒', label: 'Access',  value: detailLoc.access === 'public' ? 'Free public access' : 'Private — booking required' },
                  { icon: '⭐', label: 'Rating',  value: detailLoc.rating !== '—' ? `${detailLoc.rating} / 5` : 'Not yet rated' },
                  { icon: '📋', label: 'Permit',  value: detailLoc.permit ?? 'Ask your photographer' },
                  { icon: '❤',  label: 'Saves',   value: detailLoc.saves > 0 ? `${detailLoc.saves} photographers` : 'New location' },
                ].map(item => (
                  <div key={item.label} style={{ background: 'var(--cream)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--cream-dark)' }}>
                    <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-soft)', marginBottom: 4 }}>{item.icon} {item.label}</div>
                    <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.4 }}>{item.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, paddingBottom: '1rem' }}>
                <button onClick={() => setDetailLoc(null)} style={{ flex: 1, padding: '12px', borderRadius: 4, border: '1px solid var(--sand)', background: 'transparent', color: 'var(--ink-soft)', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Back</button>
                <button onClick={() => { setChosenId(detailLoc.id); setDetailLoc(null) }}
                  style={{ flex: 2, padding: '12px', borderRadius: 4, border: 'none', background: String(chosenId) === String(detailLoc.id) ? 'var(--sage)' : isGoldAccent ? 'var(--gold)' : accentColor, color: String(chosenId) === String(detailLoc.id) ? 'white' : isGoldAccent ? 'var(--ink)' : 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {String(chosenId) === String(detailLoc.id) ? '✓ This is my choice' : 'Choose this spot →'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Email prompt */}
      {showEmailPrompt && (
        <>
          <div onClick={() => setShowEmailPrompt(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,.7)', backdropFilter: 'blur(6px)', zIndex: 600 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'white', borderRadius: 16, width: 420, maxWidth: '92vw', padding: '2rem', zIndex: 700, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📍</div>
            <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Almost done!</div>
            <div style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.6, marginBottom: '1.5rem' }}>
              Enter your email so <strong style={{ fontWeight: 600 }}>{shareData?.photographer_name ?? 'your photographer'}</strong> can confirm the location.
            </div>
            <input ref={emailRef} type="email" value={clientEmail} onChange={e => { setClientEmail(e.target.value); setEmailError('') }}
              onKeyDown={e => { if (e.key === 'Enter') submitEmail() }}
              placeholder="your@email.com"
              style={{ width: '100%', padding: '12px 14px', border: `1.5px solid ${emailError ? 'var(--rust)' : 'var(--cream-dark)'}`, borderRadius: 8, fontFamily: 'inherit', fontSize: 15, color: 'var(--ink)', outline: 'none', marginBottom: emailError ? 6 : 16, textAlign: 'center' }} />
            {emailError && <div style={{ fontSize: 12, color: 'var(--rust)', marginBottom: 12 }}>{emailError}</div>}
            <button onClick={submitEmail} disabled={submitting}
              style={{ width: '100%', padding: '13px', borderRadius: 8, background: isGoldAccent ? 'var(--gold)' : accentColor, color: isGoldAccent ? 'var(--ink)' : 'white', border: 'none', fontFamily: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 10, opacity: submitting ? 0.7 : 1 }}>
              {submitting ? 'Sending…' : 'Confirm my choice →'}
            </button>
            <button onClick={() => setShowEmailPrompt(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink-soft)', fontFamily: 'inherit' }}>Go back</button>
          </div>
        </>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .pick-body { display: grid; grid-template-columns: 400px 1fr; }
        .pick-sidebar { overflow: hidden; }
        .pick-map-col { position: relative; }
        @media (max-width: 768px) {
          .pick-body { display: flex !important; flex-direction: column !important; }
          .pick-sidebar { flex: 1 !important; min-height: 0 !important; border-right: none !important; }
          .pick-sidebar-hidden { display: none !important; }
          .pick-map-col { display: none !important; }
          .pick-map-col.pick-map-visible { display: block !important; position: fixed !important; inset: 0 !important; z-index: 300 !important; height: 100svh !important; }
          .pick-mobile-toggle { display: flex !important; position: fixed !important; bottom: 80px !important; left: 50% !important; transform: translateX(-50%) !important; z-index: 400 !important; align-items: center !important; gap: 8px !important; padding: 10px 22px !important; border-radius: 50px !important; border: none !important; font-family: var(--font-dm-sans), sans-serif !important; font-size: 13px !important; font-weight: 600 !important; cursor: pointer !important; box-shadow: 0 4px 20px rgba(0,0,0,.35) !important; white-space: nowrap !important; background: var(--ink) !important; color: var(--cream) !important; }
        }
      `}</style>
    </div>
  )
}