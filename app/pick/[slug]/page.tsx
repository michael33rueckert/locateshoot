'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { ClientLocation } from '@/components/ClientMap'

const ClientMap = dynamic(() => import('@/components/ClientMap'), { ssr: false })

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShareData {
  id: string
  session_name: string
  message: string | null
  photographer_name: string | null
  my_photos_only: boolean
  expires_at: string | null
  location_ids: number[]
  secret_ids: string[]
}

type FullLocation = ClientLocation & {
  tags: string[]
  desc: string
  bestTime: string | null
  parking: string | null
  permit: string | null
  saves: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PHOTO_PALETTES: Record<string, string[]> = {
  'bg-1': ['#2d3a2e,#4a6741','#1a2820,#3d6050','#2d3a2e,#5a7a51','#1a2820,#4a6741'],
  'bg-2': ['#1a2535,#3d6e8c','#162030,#2d5a78','#1a2535,#4d7e9c','#0f1820,#3d6e8c'],
  'bg-3': ['#3d2010,#8c4a28','#2a1508,#7a3820','#3d2010,#9c5a38','#2a1508,#8c4a28'],
  'bg-4': ['#1a1830,#4a4580','#12102a,#3a3570','#1a1830,#5a5590','#12102a,#4a4580'],
  'bg-5': ['#1a2820,#3d6050','#122018,#2d5040','#1a2820,#4d7060','#122018,#3d6050'],
  'bg-6': ['#2a1a10,#7a4f28','#1a0f08,#6a3f18','#2a1a10,#8a5f38','#1a0f08,#7a4f28'],
}

const BG_CYCLE = ['bg-1','bg-2','bg-3','bg-4','bg-5','bg-6']

// ── Component ─────────────────────────────────────────────────────────────────

export default function ClientPickerPage() {
  const params = useParams()
  const slug   = params?.slug as string

  const [shareData,  setShareData]  = useState<ShareData | null>(null)
  const [locations,  setLocations]  = useState<FullLocation[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [activeId,   setActiveId]   = useState<number | string | null>(null)
  const [chosenId,   setChosenId]   = useState<number | string | null>(null)
  const [confirmed,  setConfirmed]  = useState(false)
  const [detailLoc,  setDetailLoc]  = useState<FullLocation | null>(null)

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!slug) return
    loadShareData()
  }, [slug]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadShareData() {
    setLoading(true)
    try {
      // 1. Fetch share link by slug
      const { data: share, error: shareErr } = await supabase
        .from('share_links')
        .select('id, session_name, message, photographer_name, my_photos_only, expires_at, location_ids, secret_ids')
        .eq('slug', slug)
        .single()

      if (shareErr || !share) {
        setError('This share link could not be found.')
        return
      }

      // 2. Check expiry
      if (share.expires_at && new Date(share.expires_at) < new Date()) {
        setError('This share link has expired. Please ask your photographer for a new one.')
        return
      }

      setShareData(share)

      const allLocations: FullLocation[] = []

      // 3. Fetch regular locations using actual column names
      if (share.location_ids && share.location_ids.length > 0) {
        const { data: locs, error: locsErr } = await supabase
          .from('locations')
          .select('id, name, city, state, latitude, longitude, access_type, description, tags, permit_required, permit_notes, quality_score')
          .in('id', share.location_ids)

        if (locsErr) console.error('Locations fetch error:', locsErr)

        if (locs) {
          locs.forEach((loc, idx) => {
            // Build city string from city + state
            const cityStr = [loc.city, loc.state].filter(Boolean).join(', ')

            // Convert quality_score (0–100) to a star rating (0–5)
            const rating = loc.quality_score
              ? (loc.quality_score / 20).toFixed(1)
              : '—'

            // Build permit string
            const permitStr = loc.permit_required
              ? `Permit required${loc.permit_notes ? ' — ' + loc.permit_notes : ''}`
              : 'No permit required'

            allLocations.push({
              id:       loc.id,
              name:     loc.name,
              city:     cityStr || 'Unknown location',
              lat:      loc.latitude,
              lng:      loc.longitude,
              access:   loc.access_type ?? 'public',
              rating,
              bg:       BG_CYCLE[idx % BG_CYCLE.length],
              type:     'favorite',
              tags:     loc.tags ?? [],
              desc:     loc.description ?? 'A great photoshoot location.',
              bestTime: null,
              parking:  null,
              permit:   permitStr,
              saves:    0,
            })
          })
        }
      }

      // 4. Fetch secret locations
      if (share.secret_ids && share.secret_ids.length > 0) {
        const { data: secrets, error: secretsErr } = await supabase
          .from('secret_locations')
          .select('id, name, area, description, tags, bg, lat, lng')
          .in('id', share.secret_ids)

        if (secretsErr) console.error('Secrets fetch error:', secretsErr)

        if (secrets) {
          secrets.forEach(s => {
            allLocations.push({
              id:       s.id,
              name:     s.name,
              city:     s.area,
              lat:      s.lat ?? 0,
              lng:      s.lng ?? 0,
              access:   'public',
              rating:   '—',
              bg:       s.bg ?? 'bg-1',
              type:     'secret',
              tags:     s.tags ?? [],
              desc:     s.description ?? "One of your photographer's hidden gems — shared exclusively with you.",
              bestTime: null,
              parking:  null,
              permit:   null,
              saves:    0,
            })
          })
        }
      }

      // Sort: favorites first, secrets after
      allLocations.sort((a, b) => {
        if (a.type === 'favorite' && b.type !== 'favorite') return -1
        if (a.type !== 'favorite' && b.type === 'favorite') return 1
        return 0
      })

      setLocations(allLocations)
    } catch (err) {
      console.error('Client picker load error:', err)
      setError('Something went wrong loading this page. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Escape key closes detail panel ────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setDetailLoc(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleMarkerClick = useCallback((id: number | string) => {
    const loc = locations.find(l => String(l.id) === String(id))
    if (loc) { setDetailLoc(loc); setActiveId(loc.id) }
  }, [locations])

  function openDetail(loc: FullLocation) {
    setDetailLoc(loc); setActiveId(loc.id)
  }

  function chooseLocation(id: number | string) {
    setChosenId(id); setDetailLoc(null)
  }

  function confirmChoice() {
    if (!chosenId) return
    setConfirmed(true)
  }

  const favorites  = locations.filter(l => l.type === 'favorite')
  const secrets    = locations.filter(l => l.type === 'secret')
  const chosenLoc  = locations.find(l => String(l.id) === String(chosenId)) ?? null

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: '3px solid rgba(255,255,255,.1)', borderTop: '3px solid var(--gold)', borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto 1rem' }} />
          <div style={{ fontFamily: 'var(--font-playfair), serif', fontSize: 18, color: 'rgba(245,240,232,.6)' }}>Loading your locations…</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ background: 'white', borderRadius: 16, padding: '2.5rem 2rem', maxWidth: 440, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: '1rem' }}>🔗</div>
          <div style={{ fontFamily: 'var(--font-playfair), serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Link unavailable</div>
          <p style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.65 }}>{error}</p>
        </div>
      </div>
    )
  }

  // ── Confirmed ──────────────────────────────────────────────────────────────
  if (confirmed && chosenLoc) {
    const isSecret = chosenLoc.type === 'secret'
    return (
      <div style={{ minHeight: '100vh', background: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ background: 'white', borderRadius: 16, padding: '2.5rem 2rem', maxWidth: 460, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: '1rem' }}>{isSecret ? '🤫' : '🎉'}</div>
          <div style={{ fontFamily: 'var(--font-playfair), serif', fontSize: 30, fontWeight: 900, color: 'var(--ink)', marginBottom: '.5rem' }}>You&apos;re all set!</div>
          <div style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.65, marginBottom: '1.5rem' }}>
            {isSecret
              ? "Your photographer will be in touch with the exact location details and what to expect."
              : "Your photographer has been notified and will be in touch to confirm the details."}
          </div>
          <div style={{ background: isSecret ? 'rgba(124,92,191,.06)' : 'var(--cream)', border: `1px solid ${isSecret ? 'rgba(124,92,191,.2)' : 'var(--cream-dark)'}`, borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
            <div className={chosenLoc.bg} style={{ width: 56, height: 56, borderRadius: 8, flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: 'var(--font-playfair), serif', fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>{chosenLoc.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 3 }}>📍 {chosenLoc.city}</div>
              {isSecret && <div style={{ fontSize: 11, color: '#7c5cbf', marginTop: 3, fontWeight: 500 }}>🤫 Photographer&apos;s secret spot</div>}
            </div>
          </div>
          {shareData && (
            <div style={{ padding: '10px 14px', background: 'rgba(196,146,42,.08)', border: '1px solid rgba(196,146,42,.2)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 500 }}>📷 {shareData.photographer_name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>{shareData.session_name}</div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Location card (compact list item) ─────────────────────────────────────
  function LocationCard({ loc, index }: { loc: FullLocation, index: number }) {
    const isChosen = String(chosenId) === String(loc.id)
    const isSecret = loc.type === 'secret'
    return (
      <div
        onClick={() => openDetail(loc)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
          transition: 'all .18s', marginBottom: 8,
          border: `1.5px solid ${isChosen ? 'var(--sage)' : isSecret ? 'rgba(124,92,191,.3)' : 'var(--cream-dark)'}`,
          background: isChosen ? 'rgba(74,103,65,.04)' : isSecret ? 'rgba(124,92,191,.03)' : 'white',
        }}
      >
        <div className={loc.bg} style={{ width: 56, height: 56, borderRadius: 8, flexShrink: 0, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 4, left: 4, width: 20, height: 20, borderRadius: '50%', background: isChosen ? 'rgba(74,103,65,.9)' : 'rgba(26,22,18,.6)', color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isChosen ? '✓' : index + 1}
          </div>
          {isSecret && (
            <div style={{ position: 'absolute', bottom: 3, right: 3, width: 16, height: 16, borderRadius: '50%', background: 'rgba(124,92,191,.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>🤫</div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {loc.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            📍 {loc.city}
            {isSecret && (
              <span style={{ padding: '1px 6px', borderRadius: 20, fontSize: 10, background: 'rgba(124,92,191,.1)', color: '#7c5cbf', border: '1px solid rgba(124,92,191,.2)', fontWeight: 500 }}>
                🤫 Secret spot
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {!isSecret && <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--gold)', marginBottom: 3 }}>★ {loc.rating}</div>}
          {isChosen
            ? <div style={{ fontSize: 11, color: 'var(--sage)', fontWeight: 500 }}>✓ Selected</div>
            : <div style={{ fontSize: 11, color: 'var(--sky)' }}>Tap to view →</div>
          }
        </div>
      </div>
    )
  }

  // ── Detail panel ───────────────────────────────────────────────────────────
  function DetailPanel() {
    if (!detailLoc) return null
    const isChosen = String(chosenId) === String(detailLoc.id)
    const isSecret = detailLoc.type === 'secret'
    const palette  = PHOTO_PALETTES[detailLoc.bg] ?? PHOTO_PALETTES['bg-1']

    return (
      <>
        <div
          onClick={() => setDetailLoc(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,.6)', backdropFilter: 'blur(4px)', zIndex: 400 }}
        />
        <div style={{
          position: 'fixed', bottom: 0, left: '50%',
          transform: 'translateX(-50%)',
          width: '100%', maxWidth: 560,
          background: 'white', borderRadius: '16px 16px 0 0',
          zIndex: 500, maxHeight: '92vh', overflowY: 'auto',
          boxShadow: '0 -8px 48px rgba(26,22,18,.3)',
          animation: 'slideUp .3s ease',
        }}>
          {/* Handle */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--sand)' }} />
          </div>

          {/* Close */}
          <button
            onClick={() => setDetailLoc(null)}
            style={{ position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: '50%', background: 'var(--cream-dark)', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >✕</button>

          <div style={{ padding: '0 1.25rem 1rem' }}>

            {/* Secret banner */}
            {isSecret && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', marginBottom: '1rem', background: 'rgba(124,92,191,.08)', border: '1px solid rgba(124,92,191,.25)', borderRadius: 10 }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>🤫</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#7c5cbf', marginBottom: 2 }}>Photographer&apos;s secret spot</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.5 }}>
                    This hidden gem isn&apos;t on the public map — shared exclusively with you for this session.
                  </div>
                </div>
              </div>
            )}

            {/* Main photo */}
            <div className={detailLoc.bg} style={{ height: 200, borderRadius: 12, marginBottom: 8, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 12, left: 12, padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: isSecret ? 'rgba(124,92,191,.85)' : detailLoc.access === 'public' ? 'rgba(74,103,65,.85)' : 'rgba(181,75,42,.85)', color: isSecret ? 'white' : detailLoc.access === 'public' ? '#c8e8c4' : '#ffd0c0' }}>
                {isSecret ? '🤫 Secret spot' : detailLoc.access === 'public' ? '● Public' : '🔒 Private'}
              </div>
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top,rgba(26,22,18,.7) 0%,transparent 60%)', padding: '1rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 11, color: 'rgba(245,240,232,.6)' }}>📷 Photos coming soon</div>
                {!isSecret && <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--gold)' }}>★ {detailLoc.rating}</div>}
              </div>
            </div>

            {/* Photo strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: '1.25rem' }}>
              {palette.map((colors, i) => (
                <div key={i} style={{ aspectRatio: '1', borderRadius: 8, background: `linear-gradient(135deg,${colors})`, position: 'relative', overflow: 'hidden' }}>
                  {i === 3 && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,22,18,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(245,240,232,.8)', fontSize: 12, fontWeight: 500 }}>
                      + more
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Name & city */}
            <div style={{ fontFamily: 'var(--font-playfair), serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 3 }}>
              {detailLoc.name}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: '1rem' }}>
              📍 {detailLoc.city}
              {isSecret && (
                <span style={{ marginLeft: 8, fontSize: 11, color: '#7c5cbf', fontStyle: 'italic' }}>
                  (General area — exact location shared when you book)
                </span>
              )}
            </div>

            {/* Tags */}
            {detailLoc.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: '1rem' }}>
                {detailLoc.tags.map((t, i) => (
                  <span key={i} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, background: isSecret ? 'rgba(124,92,191,.08)' : 'var(--cream-dark)', color: isSecret ? '#7c5cbf' : 'var(--ink-soft)', border: `1px solid ${isSecret ? 'rgba(124,92,191,.2)' : 'var(--sand)'}` }}>
                    {t}
                  </span>
                ))}
              </div>
            )}

            {/* Description */}
            <p style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.7, marginBottom: '1.25rem' }}>
              {detailLoc.desc}
            </p>

            {/* Quick info grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: '1.5rem' }}>
              {[
                { icon: '🔒', label: 'Access',    value: detailLoc.access === 'public' ? 'Free public access' : 'Private — booking required' },
                { icon: '⭐', label: 'Rating',    value: detailLoc.rating !== '—' ? `${detailLoc.rating} out of 5` : 'Not yet rated' },
                { icon: '📋', label: 'Permit',    value: detailLoc.permit ?? 'Ask your photographer' },
                { icon: '❤',  label: 'Community', value: isSecret ? "Your photographer's personal hidden gem" : 'Loved by photographers' },
              ].map(item => (
                <div key={item.label} style={{ background: isSecret ? 'rgba(124,92,191,.04)' : 'var(--cream)', borderRadius: 8, padding: '10px 12px', border: `1px solid ${isSecret ? 'rgba(124,92,191,.15)' : 'var(--cream-dark)'}` }}>
                  <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-soft)', marginBottom: 4 }}>{item.icon} {item.label}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.4 }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* CTA buttons */}
            <div style={{ display: 'flex', gap: 10, paddingBottom: '1rem' }}>
              <button
                onClick={() => setDetailLoc(null)}
                style={{ flex: 1, padding: '12px', borderRadius: 4, border: '1px solid var(--sand)', background: 'transparent', color: 'var(--ink-soft)', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Back to list
              </button>
              <button
                onClick={() => chooseLocation(detailLoc.id)}
                style={{ flex: 2, padding: '12px', borderRadius: 4, border: 'none', background: isChosen ? 'var(--sage)' : isSecret ? '#7c5cbf' : 'var(--gold)', color: isChosen || isSecret ? 'white' : 'var(--ink)', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .18s' }}
              >
                {isChosen ? '✓ This is my choice' : 'Choose this spot →'}
              </button>
            </div>
          </div>
        </div>

        <style>{`
          @keyframes slideUp {
            from { transform: translateX(-50%) translateY(40px); opacity: 0; }
            to   { transform: translateX(-50%) translateY(0);    opacity: 1; }
          }
        `}</style>
      </>
    )
  }

  // ── Main page ──────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--ink)' }}>

      {/* Hero */}
      <div style={{ background: 'var(--ink)', padding: '2.5rem 2.5rem 2rem', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 80% 50%,rgba(196,146,42,.07) 0%,transparent 65%)', pointerEvents: 'none' }} />

        <div style={{ fontFamily: 'var(--font-playfair), serif', fontSize: 16, fontWeight: 900, color: 'rgba(245,240,232,.35)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: '2rem' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', display: 'inline-block' }} />
          LocateShoot
        </div>

        <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ display: 'block', width: 18, height: 1, background: 'var(--gold)' }} />
          Location selection
        </div>

        <h1 style={{ fontFamily: 'var(--font-playfair), serif', fontSize: 'clamp(28px,4vw,52px)', fontWeight: 900, lineHeight: 1.08, color: 'var(--cream)', marginBottom: '.6rem' }}>
          Choose your <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>perfect</em> spot
        </h1>

        {shareData?.message && (
          <p style={{ fontSize: 15, fontWeight: 300, color: 'rgba(245,240,232,.58)', lineHeight: 1.65, maxWidth: 580, marginBottom: '1.5rem' }}>
            {shareData.message}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
          {shareData?.photographer_name && (
            <div style={{ fontSize: 13, color: 'rgba(245,240,232,.45)' }}>📷 {shareData.photographer_name}</div>
          )}
          {shareData?.session_name && (
            <>
              <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(245,240,232,.2)' }} />
              <div style={{ fontSize: 13, color: 'rgba(245,240,232,.45)' }}>🗒 {shareData.session_name}</div>
            </>
          )}
          {shareData?.expires_at && (
            <>
              <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(245,240,232,.2)' }} />
              <div style={{ fontSize: 13, color: 'rgba(245,240,232,.35)' }}>
                Expires {new Date(shareData.expires_at).toLocaleDateString()}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: 'rgba(255,255,255,.08)' }}>
        <div style={{ height: '100%', background: 'var(--gold)', width: chosenId ? '100%' : '0%', transition: 'width .5s ease' }} />
      </div>

      {/* Body */}
      <div style={{ background: 'var(--cream)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', minHeight: 'calc(100vh - 260px)' }}>

          {/* Cards */}
          <div style={{ padding: '2rem 2.5rem', borderRight: '1px solid var(--cream-dark)', overflowY: 'auto' }}>
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontFamily: 'var(--font-playfair), serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
                Browse the locations
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300 }}>
                Tap any card to see photos and details, then choose your favorite.
              </div>
            </div>

            {locations.length === 0 && (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--ink-soft)', fontSize: 14, fontStyle: 'italic' }}>
                No locations were included in this share link.
              </div>
            )}

            {/* Photographer's picks */}
            {favorites.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-soft)', marginBottom: 8 }}>
                  Photographer&apos;s picks ({favorites.length})
                </div>
                {favorites.map((loc, i) => <LocationCard key={String(loc.id)} loc={loc} index={i} />)}
              </>
            )}

            {/* Secret spots */}
            {secrets.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '1.25rem 0 8px' }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--cream-dark)' }} />
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: '#7c5cbf', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#7c5cbf', display: 'inline-block' }} />
                    🤫 Photographer&apos;s secret spots
                  </div>
                  <div style={{ flex: 1, height: 1, background: 'var(--cream-dark)' }} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: 10, lineHeight: 1.5 }}>
                  Hidden gems not on the public map — shared exclusively with you for this session.
                </div>
                {secrets.map((loc, i) => <LocationCard key={String(loc.id)} loc={loc} index={favorites.length + i} />)}
              </>
            )}
          </div>

          {/* Map */}
          <div style={{ position: 'sticky', top: 0, height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1 }}>
              <ClientMap
                locations={locations}
                activeId={activeId as number | null}
                chosenId={chosenId as number | null}
                onMarkerClick={handleMarkerClick}
              />
            </div>
            <div style={{ padding: '1rem 1.25rem', background: 'white', borderTop: '1px solid var(--cream-dark)', flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 4 }}>
                Viewing on map
              </div>
              {activeId
                ? (() => {
                    const loc = locations.find(l => String(l.id) === String(activeId))
                    if (!loc) return null
                    return (
                      <>
                        <div style={{ fontFamily: 'var(--font-playfair), serif', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{loc.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                          📍 {loc.city}{loc.type !== 'secret' ? ` · ★ ${loc.rating}` : ' · 🤫 Secret spot'}
                        </div>
                      </>
                    )
                  })()
                : <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic' }}>Tap a location to zoom in</div>
              }
            </div>
          </div>
        </div>

        {/* Confirm bar */}
        <div style={{ position: 'sticky', bottom: 0, zIndex: 100, background: 'var(--ink)', padding: '1.1rem 2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', borderTop: '1px solid rgba(255,255,255,.08)' }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.07em', color: 'rgba(245,240,232,.35)', marginBottom: 3 }}>
              Your selection
            </div>
            {chosenLoc
              ? (
                <div style={{ fontFamily: 'var(--font-playfair), serif', fontSize: 18, fontWeight: 700, color: 'var(--cream)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {chosenLoc.type === 'secret' && <span>🤫</span>}
                  {chosenLoc.name}
                </div>
              )
              : (
                <div style={{ fontFamily: 'var(--font-playfair), serif', fontSize: 15, color: 'rgba(245,240,232,.25)', fontStyle: 'italic' }}>
                  Nothing chosen yet — tap a location
                </div>
              )
            }
          </div>
          <button
            onClick={confirmChoice}
            disabled={!chosenId}
            style={{ padding: '12px 28px', borderRadius: 4, border: 'none', fontFamily: 'inherit', fontSize: 14, fontWeight: 500, cursor: chosenId ? 'pointer' : 'default', background: 'var(--gold)', color: 'var(--ink)', opacity: chosenId ? 1 : 0.35, transition: 'all .18s', flexShrink: 0 }}
          >
            Send my choice to photographer →
          </button>
        </div>
      </div>

      <DetailPanel />
    </div>
  )
}