'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AppNav from '@/components/AppNav'
import AddressSearch, { type AddressResult } from '@/components/AddressSearch'
import { supabase } from '@/lib/supabase'

// Multi-step walkthrough shown to new photographers (and re-visitable from
// the menu's Getting Started link). Single page, one slide visible at a
// time, Next / Back navigation.
//
// Slide order:
//   0  pitch frame — the time-savings hook
//   1  Step 1 — build your portfolio
//   2  Step 2 — bundle into Location Guides
//   3  Step 3 — wire into booking tools
//   4  Step 4 — suggested locations near you (the old /onboarding picker
//              folded in here so new users see the pitch first, then get
//              a one-click way to seed their portfolio)
//   5  outro — you're set

interface Bullet { headline: string; detail: string }
interface PitchSlide   { kind: 'pitch';   icon: string; title: string; pitch: string }
interface HowtoSlide   { kind: 'howto';   eyebrow: string; icon: string; title: string; bullets: Bullet[]; cta?: { href: string; label: string } }
interface PickerSlide  { kind: 'picker';  eyebrow: string; icon: string; title: string }
interface OutroSlide   { kind: 'outro';   icon: string; title: string; pitch: string }
type Slide = PitchSlide | HowtoSlide | PickerSlide | OutroSlide

const SLIDES: Slide[] = [
  {
    kind:  'pitch',
    icon:  '⏱',
    title: 'Stop the 20-message location chain.',
    pitch: 'Your client picks the spot for their session. You get the email. The shoot is on the calendar. That\'s it — no back-and-forth, no "what about this park?" thread, no Pinterest screenshots at 11pm.',
  },
  {
    kind:    'howto',
    eyebrow: 'Step 1',
    icon:    '📍',
    title:   'Build your portfolio of locations.',
    bullets: [
      { headline: 'Add your own locations to your portfolio.',
        detail:   'Use "+ Add new location" to set up the spots you actually shoot. They live privately to your account and are the only locations that ever appear on your share links.' },
      { headline: 'Need ideas? Browse the Explore map.',
        detail:   'The Explore map suggests popular spots and other photographers\' favorites in your area. Save the ones that fit your style — they get copied into your portfolio with a stand-in preview photo.' },
      { headline: 'Upload your real photos.',
        detail:   'Once you upload your own photos to a saved location, that\'s what your clients see on share links — not the placeholder.' },
    ],
    cta: { href: '/explore', label: 'Browse the map →' },
  },
  {
    kind:    'howto',
    eyebrow: 'Step 2',
    icon:    '📚',
    title:   'Bundle locations into a Location Guide.',
    bullets: [
      { headline: '♾ Save for future use.',
        detail:   'Never expires. Build one per city or theme — "Kansas City Guide", "Golden Hour Guide" — and reuse it for every booking.' },
      { headline: '📅 Or expire on a date.',
        detail:   'Use when a client has a deadline to make a decision.' },
      { headline: '🔂 Or expire after they pick.',
        detail:   'Single-use. The link burns out the moment the client submits. Great for one-off sessions.' },
      { headline: '🧭 Multi-pick + distance caps.',
        detail:   'Let them pick 2+ spots for multi-location sessions, with an optional "max miles apart" cap.' },
    ],
    cta: { href: '/location-guides', label: 'Create your first guide →' },
  },
  {
    kind:    'howto',
    eyebrow: 'Step 3',
    icon:    '🔗',
    title:   'Drop the link in your booking tools.',
    bullets: [
      { headline: 'Anywhere a URL works, the guide works.',
        detail:   'HoneyBook project pages, Dubsado workflow emails, Calendly confirmations, plain text messages — paste and go.' },
      { headline: 'Get notified the moment they pick.',
        detail:   'Email + push notification on your device. The selection lands on your dashboard automatically.' },
      { headline: 'Use your own domain.',
        detail:   'Set up locations.yourstudio.com in Profile and your share links use it instead of locateshoot.com.' },
    ],
    cta: { href: '/profile', label: 'Set up your domain →' },
  },
  {
    kind:    'picker',
    eyebrow: 'Step 4',
    icon:    '🌎',
    title:   'Suggested locations near you.',
  },
  {
    kind:  'outro',
    icon:  '✨',
    title: 'You\'re set.',
    pitch: 'Build out a few locations, make your first guide, and send it to a client. Your dashboard tracks every pick from here on.',
  },
]

// ── Picker (lifted from the old standalone /onboarding page) ─────────
const RADIUS_MI = 50
function calcDist(la1: number, lo1: number, la2: number, lo2: number) {
  const R = 3958.8, dLa = (la2-la1)*Math.PI/180, dLo = (lo2-lo1)*Math.PI/180
  const a = Math.sin(dLa/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}
const BG_CYCLE = ['bg-1','bg-2','bg-3','bg-4','bg-5','bg-6']

interface PublicLocation {
  id: string; name: string; city: string | null; state: string | null
  latitude: number; longitude: number
  access_type: string | null; tags: string[] | null
  quality_score: number | null; rating: number | null
  description: string | null; permit_required: boolean | null; permit_notes: string | null
  best_time: string | null; parking_info: string | null
  photo_url?: string | null
}

export default function HowItWorksPage() {
  const router = useRouter()
  const [idx, setIdx] = useState(0)
  const total   = SLIDES.length
  const slide   = SLIDES[idx]
  const isFirst = idx === 0
  const isLast  = idx === total - 1

  // Picker state — only used on the picker slide but lives at the
  // walkthrough level so back-navigating doesn't reset it.
  const [userId,    setUserId]    = useState<string | null>(null)
  const [pin,       setPin]       = useState<AddressResult | null>(null)
  const [nearby,    setNearby]    = useState<(PublicLocation & { d: number })[]>([])
  const [selected,  setSelected]  = useState<Set<string>>(new Set())
  const [searching, setSearching] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [pickerDone, setPickerDone] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
  }, [])

  const fetchNearby = useCallback(async (lat: number, lng: number) => {
    setSearching(true)
    try {
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
      setNearby(rows.map(r => ({ ...r, photo_url: photoMap[r.id] ?? null })) as any)
      // Pre-select the top 12 so it's one click to get rolling.
      setSelected(new Set(rows.slice(0, 12).map(r => r.id)))
    } finally { setSearching(false) }
  }, [])

  function handleAddress(r: AddressResult) { setPin(r); fetchNearby(r.lat, r.lng) }
  function toggleLoc(id: string) {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  async function markOnboarded() {
    if (!userId) return
    const { data } = await supabase.from('profiles').select('preferences').eq('id', userId).single()
    const prefs = (data?.preferences as any) ?? {}
    if (!prefs.onboarded_at) {
      await supabase.from('profiles').update({ preferences: { ...prefs, onboarded_at: new Date().toISOString() } }).eq('id', userId)
    }
  }

  async function addSelectedToPortfolio() {
    if (!userId || selected.size === 0) return
    setSaving(true)
    try {
      const rows = nearby.filter(l => selected.has(l.id)).map(l => ({
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
      const { data: existing } = await supabase.from('portfolio_locations').select('source_location_id').eq('user_id', userId)
      const existingSet = new Set((existing ?? []).map((r: any) => r.source_location_id).filter(Boolean))
      const fresh = rows.filter(r => !existingSet.has(r.source_location_id))
      if (fresh.length > 0) await supabase.from('portfolio_locations').insert(fresh as any)
      await markOnboarded()
      setPickerDone(true)
      setIdx(idx + 1)
    } finally { setSaving(false) }
  }

  async function skipPicker() {
    setSaving(true)
    try {
      await markOnboarded()
      setIdx(idx + 1)
    } finally { setSaving(false) }
  }

  return (
    <div style={{ minHeight: '100svh', background: 'var(--cream)', display: 'flex', flexDirection: 'column' }}>
      <AppNav />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 800, width: '100%', margin: '0 auto', padding: '2rem 1.25rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 999, background: 'rgba(196,146,42,.1)', color: 'var(--gold)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em' }}>
            Welcome to LocateShoot
          </div>
        </div>

        {/* Step dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: '1.75rem' }}>
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`Go to step ${i + 1}`}
              style={{
                width: i === idx ? 26 : 8,
                height: 8,
                borderRadius: 8,
                background: i === idx ? 'var(--gold)' : i < idx ? 'rgba(196,146,42,.4)' : 'var(--cream-dark)',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                transition: 'all .2s',
              }}
            />
          ))}
        </div>

        {/* Slide card */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-dark)', padding: '2rem 1.75rem 2.25rem', boxShadow: '0 4px 18px rgba(26,22,18,.06)', marginBottom: '1.5rem' }}>
          {/* Header — same shape for every slide */}
          <div style={{ textAlign: 'center', marginBottom: slide.kind === 'picker' ? '1.5rem' : '1.5rem' }}>
            {(slide.kind === 'howto' || slide.kind === 'picker') && (
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--gold)', marginBottom: 10 }}>
                {slide.eyebrow}
              </div>
            )}
            <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 14, filter: 'drop-shadow(0 2px 6px rgba(26,22,18,.08))' }}>{slide.icon}</div>
            <h2 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 'clamp(24px,4vw,30px)', fontWeight: 800, color: 'var(--ink)', lineHeight: 1.2, maxWidth: 560, margin: '0 auto' }}>
              {slide.title}
            </h2>
          </div>

          {/* Body — varies by slide kind */}
          {(slide.kind === 'pitch' || slide.kind === 'outro') && (
            <p style={{ fontSize: 16, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.65, textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
              {slide.pitch}
            </p>
          )}

          {slide.kind === 'howto' && (
            <>
              <ul style={{ listStyle: 'none', padding: 0, margin: '1rem 0 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {slide.bullets.map((b, j) => (
                  <li key={j} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)', marginTop: 9 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4, marginBottom: 3 }}>{b.headline}</div>
                      <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.55 }}>{b.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
              {slide.cta && (
                <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                  <Link href={slide.cta.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--gold)', textDecoration: 'none' }}>
                    {slide.cta.label}
                  </Link>
                </div>
              )}
            </>
          )}

          {slide.kind === 'picker' && (
            <div>
              <p style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.65, textAlign: 'center', maxWidth: 540, margin: '0 auto 1.25rem' }}>
                Tell us your city so we can show you popular spots in your area. Quickly add popular locations to your portfolio directly from the map.
              </p>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 6 }}>Your city or address</label>
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
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>
                      {searching ? 'Finding locations…' : `${nearby.length} location${nearby.length !== 1 ? 's' : ''} nearby`}
                      {nearby.length > 0 && <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, marginLeft: 8 }}>({selected.size} selected)</span>}
                    </div>
                    {nearby.length > 0 && (
                      <div style={{ display: 'flex', gap: 10 }}>
                        {selected.size < nearby.length && <button onClick={() => setSelected(new Set(nearby.map(l => l.id)))} style={{ fontSize: 12, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, fontWeight: 500 }}>Select all</button>}
                        {selected.size > 0 && <button onClick={() => setSelected(new Set())} style={{ fontSize: 12, color: 'var(--rust)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, fontWeight: 500 }}>Clear</button>}
                      </div>
                    )}
                  </div>

                  {searching && (
                    <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--cream)', borderRadius: 10, border: '1px solid var(--cream-dark)' }}>
                      <div style={{ width: 24, height: 24, border: '2px solid var(--cream-dark)', borderTop: '2px solid var(--gold)', borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 10px' }} />
                      <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300 }}>Loading locations near {pin.shortLabel ?? pin.label}…</div>
                      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                    </div>
                  )}

                  {!searching && nearby.length === 0 && (
                    <div style={{ padding: '1.5rem', textAlign: 'center', background: 'var(--cream)', borderRadius: 10, border: '1px dashed var(--cream-dark)' }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>🌲</div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 4 }}>No suggestions yet for this area</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.55 }}>That&apos;s fine — add your own from <Link href="/portfolio" style={{ color: 'var(--gold)', fontWeight: 500 }}>your portfolio</Link>.</div>
                    </div>
                  )}

                  {!searching && nearby.length > 0 && (
                    <>
                      <div style={{ padding: '10px 14px', background: 'rgba(196,146,42,.08)', border: '1px solid rgba(196,146,42,.25)', borderRadius: 8, marginBottom: 10, fontSize: 12, color: 'var(--ink)', lineHeight: 1.55 }}>
                        💡 The preview images below are placeholder shots so you can see what each location looks like. Once you upload <em>your</em> photos to a saved location, that&apos;s what your clients will see — not the placeholder.
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 10 }}>
                        {nearby.map((l, i) => {
                          const sel = selected.has(l.id)
                          const cityLine = [l.city, l.state].filter(Boolean).join(', ')
                          return (
                            <div key={l.id} onClick={() => toggleLoc(l.id)} style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${sel ? 'var(--gold)' : 'var(--cream-dark)'}`, background: sel ? 'rgba(196,146,42,.04)' : 'white', cursor: 'pointer', transition: 'all .15s', position: 'relative' }}>
                              <div className={BG_CYCLE[i % BG_CYCLE.length]} style={{ aspectRatio: '4 / 3', position: 'relative', overflow: 'hidden' }}>
                                {l.photo_url && <img src={l.photo_url} alt="" loading="lazy" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                                <div style={{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 4, background: sel ? 'var(--gold)' : 'rgba(255,255,255,.92)', border: `1.5px solid ${sel ? 'var(--gold)' : 'var(--cream-dark)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--ink)', zIndex: 1 }}>{sel ? '✓' : ''}</div>
                              </div>
                              <div style={{ padding: '10px 12px' }}>
                                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</div>
                                <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>📍 {cityLine || '—'} · {l.d.toFixed(1)} mi</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </>
              )}

              {pickerDone && (
                <div style={{ marginTop: '1rem', padding: '10px 14px', background: 'rgba(74,103,65,.1)', border: '1px solid rgba(74,103,65,.25)', borderRadius: 8, fontSize: 13, color: 'var(--sage)', textAlign: 'center', fontWeight: 500 }}>
                  ✓ Added to your portfolio
                </div>
              )}

              {/* Action row inline with the picker so the affordances are obvious */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                <button onClick={skipPicker} disabled={saving} style={{ padding: '10px 18px', borderRadius: 6, background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--sand)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Skip for now
                </button>
                <button onClick={addSelectedToPortfolio} disabled={saving || selected.size === 0} style={{ padding: '10px 22px', borderRadius: 6, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: saving || selected.size === 0 ? 0.5 : 1 }}>
                  {saving ? 'Adding…' : selected.size > 0 ? `Add ${selected.size} to portfolio →` : 'Select some locations first'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Nav controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <button
            onClick={() => setIdx(i => Math.max(0, i - 1))}
            disabled={isFirst}
            style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid var(--cream-dark)', background: 'white', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 500, cursor: isFirst ? 'default' : 'pointer', fontFamily: 'inherit', opacity: isFirst ? 0.4 : 1, visibility: isFirst ? 'hidden' : 'visible' }}
          >
            ← Back
          </button>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300 }}>{idx + 1} of {total}</span>
          {isLast ? (
            <button
              onClick={() => router.push('/dashboard')}
              style={{ padding: '12px 24px', borderRadius: 8, background: 'var(--gold)', color: 'var(--ink)', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(196,146,42,.25)' }}
            >
              Take me to my dashboard →
            </button>
          ) : slide.kind === 'picker' ? (
            // The picker has its own Skip / Add buttons in the body, so the
            // bottom Next is just a visual anchor — keep it disabled and
            // greyed so people don't accidentally bypass the picker.
            <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, fontStyle: 'italic' }}>
              Use the buttons above ↑
            </span>
          ) : (
            <button
              onClick={() => setIdx(i => Math.min(total - 1, i + 1))}
              style={{ padding: '12px 24px', borderRadius: 8, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(196,146,42,.25)' }}
            >
              {slide.kind === 'pitch' ? 'Get started →' : 'Next →'}
            </button>
          )}
        </div>

        <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, textAlign: 'center', marginTop: '1.25rem' }}>
          Revisit this guide anytime from the <strong>Getting Started</strong> link in the menu.
        </div>
      </div>
    </div>
  )
}
