'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { ExploreLocation } from '@/components/ExploreMap'

const ExploreMap = dynamic(() => import('@/components/ExploreMap'), { ssr: false })

// ── Mock locations — replace with Supabase query later ───────────────────────
const MOCK_LOCATIONS: ExploreLocation[] = [
  { id:1,  name:'Loose Park Rose Garden',     city:'Kansas City, MO', lat:39.0487, lng:-94.5946, access:'public',  rating:'4.9', bg:'bg-5', tags:['Golden Hour','Roses','Paths'],      saves:312 },
  { id:2,  name:'Cliff Drive Scenic Byway',   city:'Kansas City, MO', lat:39.1094, lng:-94.5528, access:'public',  rating:'4.7', bg:'bg-1', tags:['Forest','Overlook','Dramatic'],     saves:198 },
  { id:3,  name:'Parkville Nature Sanctuary', city:'Parkville, MO',   lat:39.1951, lng:-94.6813, access:'public',  rating:'4.9', bg:'bg-5', tags:['Old-growth','Creek','Peaceful'],    saves:441 },
  { id:4,  name:'Kaw Point Park',             city:'Kansas City, KS', lat:39.1142, lng:-94.6164, access:'public',  rating:'4.6', bg:'bg-2', tags:['Rivers','Industrial','Moody'],      saves:129 },
  { id:5,  name:'Shawnee Mission Park',       city:'Lenexa, KS',      lat:38.9748, lng:-94.7794, access:'public',  rating:'4.8', bg:'bg-6', tags:['Lake','Trails','Nature'],           saves:387 },
  { id:6,  name:'The Meridian Rooftop',       city:'Kansas City, MO', lat:39.1000, lng:-94.5800, access:'private', rating:'4.8', bg:'bg-2', tags:['Rooftop','Skyline','Urban'],        saves:241 },
  { id:7,  name:'Berkley Riverfront Park',    city:'Kansas City, MO', lat:39.1097, lng:-94.5783, access:'public',  rating:'4.5', bg:'bg-2', tags:['Waterfront','Skyline','Open'],      saves:165 },
  { id:8,  name:'Liberty Memorial & Mall',    city:'Kansas City, MO', lat:39.0762, lng:-94.5821, access:'public',  rating:'4.6', bg:'bg-3', tags:['Historic','Architecture','Views'],  saves:203 },
  { id:9,  name:'Penn Valley Park',           city:'Kansas City, MO', lat:39.0820, lng:-94.5895, access:'public',  rating:'4.4', bg:'bg-1', tags:['Park','Lake','Open fields'],        saves:88  },
  { id:10, name:'Swope Park Trails',          city:'Kansas City, MO', lat:38.9998, lng:-94.5369, access:'public',  rating:'4.7', bg:'bg-5', tags:['Forest','Nature','Trails'],         saves:274 },
]

const PHOTO_PALETTES: Record<string, string[]> = {
  'bg-1': ['#2d3a2e,#4a6741','#1a2820,#3d6050','#2d3a2e,#5a7a51','#1a2820,#4a6741'],
  'bg-2': ['#1a2535,#3d6e8c','#162030,#2d5a78','#1a2535,#4d7e9c','#0f1820,#3d6e8c'],
  'bg-3': ['#3d2010,#8c4a28','#2a1508,#7a3820','#3d2010,#9c5a38','#2a1508,#8c4a28'],
  'bg-4': ['#1a1830,#4a4580','#12102a,#3a3570','#1a1830,#5a5590','#12102a,#4a4580'],
  'bg-5': ['#1a2820,#3d6050','#122018,#2d5040','#1a2820,#4d7060','#122018,#3d6050'],
  'bg-6': ['#2a1a10,#7a4f28','#1a0f08,#6a3f18','#2a1a10,#8a5f38','#1a0f08,#7a4f28'],
}

const FILTERS = ['All', 'Public', 'Private', 'Golden Hour', 'Forest', 'Urban', 'Waterfront']

export default function ExplorePage() {
  const [userLocation,  setUserLocation]  = useState<{ lat: number; lng: number } | null>(null)
  const [locGranted,    setLocGranted]    = useState(false)
  const [locLoading,    setLocLoading]    = useState(false)
  const [activeId,      setActiveId]      = useState<number | null>(null)
  const [detailLoc,     setDetailLoc]     = useState<ExploreLocation | null>(null)
  const [favorites,     setFavorites]     = useState<Set<number>>(new Set())
  const [user,          setUser]          = useState<any>(null)
  const [toast,         setToast]         = useState<string | null>(null)
  const [activeFilter,  setActiveFilter]  = useState('All')
  const [searchQuery,   setSearchQuery]   = useState('')

  // ── Load auth ────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user))
  }, [])

  // ── Auto-dismiss toast ───────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(id)
  }, [toast])

  // ── Close detail panel on Escape ─────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setDetailLoc(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Request geolocation ───────────────────────────────────────────────────
  function requestLocation() {
    if (!navigator.geolocation) { setToast('Geolocation not supported on this device'); return }
    setLocLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocGranted(true)
        setLocLoading(false)
        setToast('📍 Showing locations near you!')
      },
      () => {
        setLocLoading(false)
        setToast('⚠ Could not get your location')
      },
      { timeout: 10000 }
    )
  }

  // ── Map & detail handlers ─────────────────────────────────────────────────
  const handleMarkerClick = useCallback((id: number) => {
    const loc = MOCK_LOCATIONS.find(l => l.id === id)
    if (loc) { setDetailLoc(loc); setActiveId(id) }
  }, [])

  function openDetail(loc: ExploreLocation) {
    setDetailLoc(loc); setActiveId(loc.id)
  }

  // ── Favorites ─────────────────────────────────────────────────────────────
  async function toggleFavorite(locId: number, e?: React.MouseEvent) {
    e?.stopPropagation()
    if (!user) { setToast('Sign in to save favorites'); return }
    if (favorites.has(locId)) {
      setFavorites(prev => { const next = new Set(prev); next.delete(locId); return next })
      setToast('Removed from favorites')
      await supabase.from('favorites').delete().eq('user_id', user.id).eq('location_id', locId)
    } else {
      setFavorites(prev => new Set([...prev, locId]))
      setToast('❤ Saved to favorites!')
      await supabase.from('favorites').insert({ user_id: user.id, location_id: locId })
    }
  }

  // ── Filter & search ───────────────────────────────────────────────────────
  const filtered = MOCK_LOCATIONS.filter(loc => {
    const matchesFilter =
      activeFilter === 'All'     ? true :
      activeFilter === 'Public'  ? loc.access === 'public' :
      activeFilter === 'Private' ? loc.access === 'private' :
      loc.tags.some(t => t.toLowerCase().includes(activeFilter.toLowerCase()))
    const matchesSearch = searchQuery.trim() === '' ||
      loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      loc.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
      loc.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
    return matchesFilter && matchesSearch
  })

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── NAV ── */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', height: 56, background: 'rgba(26,22,18,.96)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(255,255,255,.07)', flexShrink: 0, zIndex: 200 }}>
        <Link href="/" style={{ fontFamily: 'var(--font-playfair), serif', fontSize: 18, fontWeight: 900, color: 'var(--cream)', display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', display: 'inline-block' }} />
          LocateShoot
        </Link>

        {/* Search */}
        <div style={{ flex: 1, maxWidth: 400, margin: '0 1.5rem', position: 'relative' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search locations, tags, cities…"
            style={{ width: '100%', padding: '7px 14px 7px 34px', background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 6, color: 'var(--cream)', fontFamily: 'inherit', fontSize: 13, outline: 'none' }}
          />
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'rgba(245,240,232,.4)' }}>🔍</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {locGranted && (
            <div style={{ fontSize: 12, color: 'rgba(245,240,232,.5)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sky)', display: 'inline-block' }} />
              Near you
            </div>
          )}
          {user
            ? <Link href="/dashboard" style={{ fontSize: 13, color: 'rgba(245,240,232,.55)', textDecoration: 'none' }}>Dashboard</Link>
            : <Link href="/" style={{ padding: '5px 14px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>Join Free</Link>
          }
        </div>
      </nav>

      {/* ── LOCATION BANNER — shown until location is granted ── */}
      {!locGranted && (
        <div style={{ background: 'rgba(61,110,140,.08)', borderBottom: '1px solid rgba(61,110,140,.18)', padding: '8px 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--sky)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📍</span>
            Allow location access to see photoshoot spots near you
          </div>
          <button
            onClick={requestLocation}
            disabled={locLoading}
            style={{ padding: '5px 16px', borderRadius: 4, background: 'var(--sky)', color: 'white', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: locLoading ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {locLoading
              ? <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,.3)', borderTop: '2px solid white', borderRadius: '50%', animation: 'spin .7s linear infinite' }} /> Getting location…</>
              : 'Use my location'
            }
          </button>
        </div>
      )}

      {/* ── FILTER PILLS ── */}
      <div style={{ background: 'white', borderBottom: '1px solid var(--cream-dark)', padding: '8px 1.5rem', display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0, zIndex: 100 }}>
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
              border: `1px solid ${activeFilter === f ? 'var(--ink)' : 'var(--cream-dark)'}`,
              background: activeFilter === f ? 'var(--ink)' : 'white',
              color: activeFilter === f ? 'var(--cream)' : 'var(--ink-soft)',
              cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              transition: 'all .15s', flexShrink: 0,
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* ── MAIN BODY ── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '360px 1fr', overflow: 'hidden' }}>

        {/* Sidebar */}
        <div style={{ borderRight: '1px solid var(--cream-dark)', overflowY: 'auto', background: '#f9f6f1' }}>
          <div style={{ padding: '1rem 1.25rem .5rem' }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
              {filtered.length} location{filtered.length !== 1 ? 's' : ''}
              {locGranted && <span style={{ fontWeight: 300, color: 'var(--ink-soft)' }}> near you</span>}
            </div>
          </div>

          {filtered.map(loc => {
            const isActive = activeId === loc.id
            const isFav    = favorites.has(loc.id)
            return (
              <div
                key={loc.id}
                onClick={() => openDetail(loc)}
                style={{
                  display: 'flex', gap: 10, padding: '10px 1.25rem',
                  borderBottom: '1px solid var(--cream-dark)',
                  cursor: 'pointer', transition: 'background .15s',
                  background: isActive ? 'rgba(196,146,42,.06)' : 'white',
                  borderLeft: `3px solid ${isActive ? 'var(--gold)' : 'transparent'}`,
                }}
              >
                <div className={loc.bg} style={{ width: 56, height: 56, borderRadius: 8, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {loc.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 5 }}>📍 {loc.city}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 500,
                      background: loc.access === 'public' ? 'rgba(74,103,65,.1)' : 'rgba(181,75,42,.1)',
                      color: loc.access === 'public' ? 'var(--sage)' : 'var(--rust)',
                      border: `1px solid ${loc.access === 'public' ? 'rgba(74,103,65,.2)' : 'rgba(181,75,42,.2)'}`,
                    }}>
                      {loc.access === 'public' ? '● Public' : '🔒 Private'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 500 }}>★ {loc.rating}</span>
                    <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>· {loc.saves} saves</span>
                  </div>
                </div>
                <button
                  onClick={e => toggleFavorite(loc.id, e)}
                  style={{ width: 28, height: 28, borderRadius: '50%', border: `1px solid ${isFav ? 'rgba(196,146,42,.4)' : 'var(--cream-dark)'}`, background: isFav ? 'rgba(196,146,42,.1)' : 'white', cursor: 'pointer', fontSize: 14, color: isFav ? 'var(--gold)' : 'var(--ink-soft)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }}
                >
                  {isFav ? '♥' : '♡'}
                </button>
              </div>
            )
          })}

          {filtered.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13, fontStyle: 'italic' }}>
              No locations match your search.
            </div>
          )}
        </div>

        {/* Map */}
        <div style={{ position: 'relative' }}>
          <ExploreMap
            locations={filtered}
            activeId={activeId}
            userLocation={userLocation}
            onMarkerClick={handleMarkerClick}
          />

          {/* Legend */}
          <div style={{ position: 'absolute', bottom: 24, left: 16, zIndex: 500, background: 'white', borderRadius: 8, padding: '.75rem 1rem', border: '1px solid var(--cream-dark)', boxShadow: '0 4px 16px rgba(26,22,18,.1)' }}>
            {[
              { color: '#4a6741', label: 'Public location' },
              { color: '#b54b2a', label: 'Private venue'   },
              { color: '#c4922a', label: 'Selected'        },
              { color: '#3d6e8c', label: 'You are here'    },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--ink-mid)', marginBottom: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, border: '2px solid white', flexShrink: 0 }} />
                {item.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── DETAIL PANEL ── */}
      {detailLoc && (
        <>
          <div
            onClick={() => setDetailLoc(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,.5)', backdropFilter: 'blur(3px)', zIndex: 400 }}
          />
          <div style={{
            position: 'fixed', bottom: 0, left: '50%',
            transform: 'translateX(-50%)',
            width: '100%', maxWidth: 580,
            background: 'white', borderRadius: '16px 16px 0 0',
            zIndex: 500, maxHeight: '85vh', overflowY: 'auto',
            boxShadow: '0 -8px 48px rgba(26,22,18,.25)',
            animation: 'slideUp .28s ease',
          }}>
            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--sand)' }} />
            </div>

            {/* Close button */}
            <button
              onClick={() => setDetailLoc(null)}
              style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: '50%', background: 'var(--cream-dark)', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >✕</button>

            <div style={{ padding: '0 1.25rem 1.5rem' }}>

              {/* Main photo */}
              <div className={detailLoc.bg} style={{ height: 200, borderRadius: 12, marginBottom: 8, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 12, left: 12, padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: detailLoc.access === 'public' ? 'rgba(74,103,65,.85)' : 'rgba(181,75,42,.85)', color: detailLoc.access === 'public' ? '#c8e8c4' : '#ffd0c0' }}>
                  {detailLoc.access === 'public' ? '● Public' : '🔒 Private Venue'}
                </div>
                <div style={{ position: 'absolute', bottom: 12, right: 12, fontSize: 12, fontWeight: 500, color: 'var(--gold)', background: 'rgba(26,22,18,.6)', padding: '3px 8px', borderRadius: 4, backdropFilter: 'blur(4px)' }}>
                  ★ {detailLoc.rating} · {detailLoc.saves} saves
                </div>
                <div style={{ position: 'absolute', bottom: 12, left: 12, fontSize: 11, color: 'rgba(245,240,232,.6)' }}>
                  📷 Photos coming soon
                </div>
              </div>

              {/* Photo strip placeholders */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: '1.25rem' }}>
                {(PHOTO_PALETTES[detailLoc.bg] ?? PHOTO_PALETTES['bg-1']).map((colors, i) => (
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
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: '1rem' }}>📍 {detailLoc.city}</div>

              {/* Tags */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: '1rem' }}>
                {detailLoc.tags.map(t => (
                  <span key={t} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, background: 'var(--cream-dark)', color: 'var(--ink-soft)', border: '1px solid var(--sand)' }}>{t}</span>
                ))}
              </div>

              {/* Quick info grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: '1.5rem' }}>
                {[
                  { icon: '🔒', label: 'Access',   value: detailLoc.access === 'public' ? 'Free public access' : 'Private — booking required' },
                  { icon: '⭐', label: 'Rating',   value: `${detailLoc.rating} out of 5` },
                  { icon: '❤',  label: 'Saves',    value: `${detailLoc.saves} photographers saved this` },
                  { icon: '📷', label: 'Photos',   value: 'Community photos coming soon' },
                ].map(item => (
                  <div key={item.label} style={{ background: 'var(--cream)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--cream-dark)' }}>
                    <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-soft)', marginBottom: 4 }}>{item.icon} {item.label}</div>
                    <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.4 }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => toggleFavorite(detailLoc.id)}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 500, transition: 'all .18s',
                    background: favorites.has(detailLoc.id) ? 'rgba(196,146,42,.1)' : 'var(--cream)',
                    color: favorites.has(detailLoc.id) ? 'var(--gold)' : 'var(--ink-soft)',
                    border: `1px solid ${favorites.has(detailLoc.id) ? 'rgba(196,146,42,.3)' : 'var(--cream-dark)'}`,
                  }}
                >
                  {favorites.has(detailLoc.id) ? '♥ Saved to favorites' : '♡ Save to favorites'}
                </button>
                {user ? (
                  <Link
                    href="/share"
                    style={{ flex: 1, padding: '12px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontFamily: 'inherit', fontSize: 14, fontWeight: 500, cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    🔗 Share with client
                  </Link>
                ) : (
                  <Link
                    href="/"
                    style={{ flex: 1, padding: '12px', borderRadius: 4, background: 'var(--ink)', color: 'var(--cream)', fontFamily: 'inherit', fontSize: 14, fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    Join free to save →
                  </Link>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', background: 'var(--ink)', color: 'var(--cream)', padding: '10px 18px', borderRadius: 10, fontSize: 13, border: '1px solid rgba(255,255,255,.1)', zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,.3)', animation: 'toast-in .25s ease' }}>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes slideUp {
          from { transform: translateX(-50%) translateY(40px); opacity: 0; }
          to   { transform: translateX(-50%) translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  )
}