'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Profile           { id: string; full_name: string | null; email: string | null }
interface ShareLink         { id: string; session_name: string; created_at: string; expires_at: string | null; location_ids: string[] | null; secret_ids: string[] | null; portfolio_location_ids: string[] | null; slug: string }
interface PortfolioLocation { id: string; source_location_id: string | null; name: string; city: string | null; state: string | null; is_secret: boolean; created_at: string; photo_count: number }
interface PendingLocation   { id: string; name: string; city: string; state: string; description: string | null; access_type: string; tags: string[]; created_at: string; latitude: number | null; longitude: number | null }
interface ClientPick        { id: string; client_email: string; location_name: string | null; created_at: string }
interface PermanentLink     { id: string; session_name: string; slug: string; created_at: string; portfolio_location_ids: string[] | null; location_ids: string[] | null; picks: ClientPick[]; expanded: boolean }

interface ScanResult {
  success: boolean; inserted: number; errors: number; scans: number
  locations: string[]; errorList: string[]
}

function timeAgo(d: string) {
  const diff  = Date.now() - new Date(d).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 2)   return 'just now'
  if (mins < 60)  return `${mins} minutes ago`
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`
  return `${days} day${days !== 1 ? 's' : ''} ago`
}

function greetingTime() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

const BG_CYCLE = ['bg-1','bg-2','bg-3','bg-4','bg-5','bg-6']

const STATUS_CONFIG = {
  active:  { label: '🔗 Active',  bg: 'rgba(61,110,140,.1)',  color: 'var(--sky)',      border: 'rgba(61,110,140,.2)'  },
  expired: { label: '⏱ Expired', bg: 'var(--cream-dark)',    color: 'var(--ink-soft)', border: 'var(--sand)'          },
}

const ALL_CATEGORIES = [
  { name: 'Parks & Nature',                icon: '🌳' },
  { name: 'Urban & Architecture',          icon: '🏙' },
  { name: 'Historic & Cultural',           icon: '🏛' },
  { name: 'Waterfront & Water Features',   icon: '💧' },
  { name: 'Fields, Meadows & Open Spaces', icon: '🌾' },
  { name: 'Private Venues & Hidden Gems',  icon: '✨' },
  { name: 'Golden Hour & Sunrise Spots',   icon: '🌅' },
  { name: 'Neighborhoods & Street Life',   icon: '🏘' },
]

const POPULAR_CITIES = [
  'New York, New York', 'Los Angeles, California', 'Chicago, Illinois',
  'Houston, Texas', 'Phoenix, Arizona', 'Philadelphia, Pennsylvania',
  'San Antonio, Texas', 'San Diego, California', 'Dallas, Texas',
  'Austin, Texas', 'Nashville, Tennessee', 'Denver, Colorado',
  'Seattle, Washington', 'Portland, Oregon', 'Atlanta, Georgia',
  'Miami, Florida', 'Tampa, Florida', 'Charlotte, North Carolina',
  'Raleigh, North Carolina', 'Minneapolis, Minnesota', 'St. Louis, Missouri',
  'Louisville, Kentucky', 'Indianapolis, Indiana', 'Columbus, Ohio',
  'Cleveland, Ohio', 'Pittsburgh, Pennsylvania', 'Detroit, Michigan',
  'Milwaukee, Wisconsin', 'Oklahoma City, Oklahoma', 'Tulsa, Oklahoma',
  'Albuquerque, New Mexico', 'Tucson, Arizona', 'Las Vegas, Nevada',
  'Salt Lake City, Utah', 'Boise, Idaho', 'Sacramento, California',
  'San Francisco, California', 'San Jose, California', 'New Orleans, Louisiana',
  'Memphis, Tennessee', 'Richmond, Virginia', 'Virginia Beach, Virginia',
  'Baltimore, Maryland', 'Washington, DC', 'Boston, Massachusetts',
  'Providence, Rhode Island', 'Hartford, Connecticut', 'Buffalo, New York',
  'Kansas City, Missouri', 'Kansas City, Kansas', 'Overland Park, Kansas',
  'Parkville, Missouri', "Lee's Summit, Missouri", 'Independence, Missouri',
]

const ADMIN_EMAIL = 'michael@locateshoot.com'

export default function DashboardPage() {
  const [profile,             setProfile]             = useState<Profile | null>(null)
  const [shareLinks,          setShareLinks]           = useState<ShareLink[]>([])
  const [portfolioLocs,       setPortfolioLocs]        = useState<PortfolioLocation[]>([])
  const [locationCount,       setLocationCount]        = useState<number>(0)
  const [pendingLocs,         setPendingLocs]          = useState<PendingLocation[]>([])
  const [permanentLinks,      setPermanentLinks]       = useState<PermanentLink[]>([])
  const [loading,             setLoading]              = useState(true)
  const [toast,               setToast]                = useState<string | null>(null)
  const [copiedId,            setCopiedId]             = useState<string | null>(null)
  const [showCreatePermanent,   setShowCreatePermanent]   = useState(false)
  const [preselectAllPortfolio, setPreselectAllPortfolio] = useState(false)
  const [deleteShareId,       setDeleteShareId]        = useState<string | null>(null)
  const [mobileMenuOpen,      setMobileMenuOpen]       = useState(false)

  // Scanner state
  const [scanRunning,     setScanRunning]     = useState(false)
  const [scanResult,      setScanResult]      = useState<ScanResult | null>(null)
  const [scanCities,      setScanCities]      = useState<string[]>([])
  const [scanCategories,  setScanCategories]  = useState<string[]>(ALL_CATEGORIES.map(c => c.name))
  const [showScanPanel,   setShowScanPanel]   = useState(false)
  const [customCityInput, setCustomCityInput] = useState('')
  const [citySearchQuery, setCitySearchQuery] = useState('')
  const [showPopular,     setShowPopular]     = useState(false)

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2800)
    return () => clearTimeout(id)
  }, [toast])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/'; return }

      const [profileRes, sharesRes, portfolioRes, locCountRes] = await Promise.all([
        supabase.from('profiles').select('id,full_name,email').eq('id', user.id).single(),
        supabase.from('share_links').select('id,session_name,created_at,expires_at,location_ids,secret_ids,portfolio_location_ids,slug').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
        supabase.from('portfolio_locations').select('id,source_location_id,name,city,state,is_secret,created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('locations').select('id', { count: 'exact', head: true }),
      ])

      if (profileRes.data)            setProfile(profileRes.data)
      if (sharesRes.data)             setShareLinks(sharesRes.data)
      if (locCountRes.count !== null) setLocationCount(locCountRes.count)

      if (portfolioRes.data && portfolioRes.data.length > 0) {
        const pIds = portfolioRes.data.map((p: any) => p.id)
        const { data: photoCounts } = await supabase
          .from('location_photos')
          .select('portfolio_location_id')
          .in('portfolio_location_id', pIds)
        const countMap: Record<string, number> = {}
        ;(photoCounts ?? []).forEach((r: any) => {
          const k = r.portfolio_location_id
          if (k) countMap[k] = (countMap[k] ?? 0) + 1
        })
        setPortfolioLocs(portfolioRes.data.map((p: any) => ({ ...p, photo_count: countMap[p.id] ?? 0 })))
      } else {
        setPortfolioLocs([])
      }

      const { data: pendingData } = await supabase
        .from('locations')
        .select('id,name,city,state,description,access_type,tags,created_at,latitude,longitude')
        .eq('status', 'pending')
        .eq('source', 'community')
        .order('created_at', { ascending: false })
      if (pendingData) setPendingLocs(pendingData)

      const { data: permData } = await supabase
        .from('share_links')
        .select('id,session_name,slug,created_at,location_ids')
        .eq('user_id', user.id)
        .eq('is_permanent', true)
        .order('created_at', { ascending: false })

      if (permData && permData.length > 0) {
        const linksWithPicks = await Promise.all(permData.map(async (link: any) => {
          const { data: picks } = await supabase
            .from('client_picks')
            .select('id,client_email,location_name,created_at')
            .eq('share_link_id', link.id)
            .order('created_at', { ascending: false })
          return { ...link, picks: picks ?? [], expanded: false }
        }))
        setPermanentLinks(linksWithPicks)
      }

    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
  const isAdmin   = profile?.email === ADMIN_EMAIL

  const estLocations = scanCities.length * scanCategories.length * 20
  const estMinutes   = Math.ceil(scanCities.length * scanCategories.length * 0.7)

  async function runScanner() {
    if (!profile?.id || scanCities.length === 0 || scanCategories.length === 0) return
    setScanRunning(true); setScanResult(null)
    try {
      const res = await fetch('/api/scan-locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cities: scanCities, categories: scanCategories, userId: profile.id }),
      })
      const data: ScanResult = await res.json()
      setScanResult(data)
      if (data.inserted > 0) { setLocationCount(prev => prev + data.inserted); setToast(`✓ Added ${data.inserted} new locations!`) }
      else setToast('Scan complete — no new locations found')
    } catch (err: any) { setToast('⚠ Scanner error — check console'); console.error(err) }
    finally { setScanRunning(false) }
  }

  async function approveLocation(id: string) {
    const { error } = await supabase.from('locations').update({ status: 'published' }).eq('id', id)
    if (!error) { setPendingLocs(prev => prev.filter(l => l.id !== id)); setLocationCount(prev => prev + 1); setToast('✓ Location approved and published!') }
  }

  async function rejectLocation(id: string) {
    const { error } = await supabase.from('locations').delete().eq('id', id)
    if (!error) { setPendingLocs(prev => prev.filter(l => l.id !== id)); setToast('Location rejected and deleted') }
  }

  function togglePermLinkExpanded(id: string) {
    setPermanentLinks(prev => prev.map(l => l.id === id ? { ...l, expanded: !l.expanded } : l))
  }

  function addCustomCity() {
    const city = customCityInput.trim()
    if (!city) return
    const formatted = city.replace(/\b\w/g, c => c.toUpperCase())
    if (!scanCities.includes(formatted)) setScanCities(prev => [...prev, formatted])
    setCustomCityInput(''); setToast(`Added ${formatted}`)
  }

  function removeCity(city: string) { setScanCities(prev => prev.filter(c => c !== city)) }
  function togglePopularCity(city: string) { setScanCities(prev => prev.includes(city) ? prev.filter(c => c !== city) : [...prev, city]) }
  function toggleCategory(name: string) { setScanCategories(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]) }

  const filteredPopular = POPULAR_CITIES.filter(c => citySearchQuery === '' || c.toLowerCase().includes(citySearchQuery.toLowerCase()))

  async function deleteShareLink(id: string) {
    if (deleteShareId !== id) { setDeleteShareId(id); return }
    const { error } = await supabase.from('share_links').delete().eq('id', id)
    if (error) { setToast('⚠ Could not delete — please try again'); console.error(error); return }
    setShareLinks(prev => prev.filter(s => s.id !== id))
    setDeleteShareId(null); setToast('Share link deleted')
  }


  function copyLink(slug: string, id: string) {
    const url = `${window.location.origin}/pick/${slug}`
    navigator.clipboard?.writeText(url).catch(() => {})
    setCopiedId(id); setToast('📋 Link copied!')
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function handleSignOut() { await supabase.auth.signOut(); window.location.href = '/' }

  function linkStatus(s: ShareLink) {
    return s.expires_at && new Date(s.expires_at) < new Date() ? 'expired' : 'active'
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--cream-dark)', borderRadius: 4, fontFamily: 'var(--font-dm-sans),sans-serif', fontSize: 14, color: 'var(--ink)', background: 'white', outline: 'none' }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 5 }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f0ece4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, color: 'var(--ink-soft)', marginBottom: 8 }}>Loading your dashboard…</div>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300 }}>Fetching your locations and share links</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0ece4' }}>

      {/* NAV */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(26,22,18,.96)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', height: 60 }}>
        <Link href="/" style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 20, fontWeight: 900, color: 'var(--cream)', display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)', display: 'inline-block' }} />LocateShoot
        </Link>

        {/* Desktop nav links */}
        <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <Link href="/explore" style={{ fontSize: 13, color: 'rgba(245,240,232,.55)', textDecoration: 'none' }}>Explore map</Link>
          <Link href="/share"   style={{ fontSize: 13, color: 'rgba(245,240,232,.55)', textDecoration: 'none' }}>New share</Link>
          <Link href="/profile" style={{ fontSize: 13, color: 'rgba(245,240,232,.55)', textDecoration: 'none' }}>Profile</Link>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="nav-links" style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(196,146,42,.15)', color: 'var(--gold)', border: '1px solid rgba(196,146,42,.3)' }}>⭐ Pro</span>
          <button onClick={handleSignOut} className="nav-links" style={{ padding: '5px 12px', borderRadius: 4, background: 'transparent', border: '1px solid rgba(255,255,255,.2)', color: 'rgba(245,240,232,.6)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Sign out</button>
          {/* Hamburger */}
          <button className="hamburger-btn" onClick={() => setMobileMenuOpen(p => !p)} aria-label="Menu">
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="mobile-menu" onClick={() => setMobileMenuOpen(false)}>
          <Link href="/explore">Explore map</Link>
          <Link href="/share">New share</Link>
          <Link href="/profile">Profile</Link>
          <button onClick={handleSignOut} style={{ fontSize: 15, color: 'rgba(245,240,232,.7)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '12px 0', textAlign: 'left' }}>Sign out</button>
        </div>
      )}

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2rem', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 'clamp(22px,5vw,30px)', fontWeight: 900, color: 'var(--ink)', marginBottom: 4 }}>{greetingTime()}, {firstName} ☀</h1>
            <p style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300 }}>
              {portfolioLocs.length > 0
                ? `You have ${portfolioLocs.length} location${portfolioLocs.length !== 1 ? 's' : ''} in your portfolio and ${shareLinks.length} share link${shareLinks.length !== 1 ? 's' : ''}.`
                : 'Welcome! Build your portfolio from Explore, then send clients a share link.'}
            </p>
          </div>
          <Link href="/share" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 22px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', fontFamily: 'var(--font-dm-sans),sans-serif', fontSize: 14, fontWeight: 500, textDecoration: 'none', flexShrink: 0 }}>
            🔗 New client share
          </Link>
        </div>

        {/* Stats — className enables mobile 2-col grid */}
        <div className="dash-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: '2rem' }}>
          {[
            { label: 'Portfolio',       value: portfolioLocs.length,           sub: 'your curated set' },
            { label: 'Share links',     value: shareLinks.length,              sub: 'total created'    },
            { label: 'Permanent links', value: permanentLinks.length,          sub: 'booking-workflow' },
            { label: 'Map locations',   value: locationCount.toLocaleString(), sub: 'in the database'  },
          ].map(stat => (
            <div key={stat.label} style={{ background: 'white', borderRadius: 10, padding: '1rem 1.25rem', border: '1px solid var(--cream-dark)' }}>
              <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-soft)', marginBottom: 6 }}>{stat.label}</div>
              <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 30, fontWeight: 700, color: 'var(--ink)', lineHeight: 1, marginBottom: 4 }}>{stat.value}</div>
              <div style={{ fontSize: 12, color: 'var(--sage)' }}>{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Main grid — className enables mobile single-column */}
        <div className="dash-main-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem', alignItems: 'start' }}>

          {/* ── LEFT COLUMN ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* MY PORTFOLIO — primary section */}
            <div style={{ background: 'white', borderRadius: 10, border: '1px solid var(--cream-dark)', overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--cream-dark)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    My Portfolio
                    {portfolioLocs.length > 0 && <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: 'rgba(196,146,42,.1)', color: 'var(--gold)', border: '1px solid rgba(196,146,42,.2)' }}>{portfolioLocs.length}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, marginTop: 2 }}>Your curated locations — shown to clients on share links.</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link href="/explore" style={{ padding: '8px 14px', borderRadius: 4, background: 'white', color: 'var(--ink-soft)', border: '1px solid var(--cream-dark)', fontSize: 12, fontWeight: 500, textDecoration: 'none', whiteSpace: 'nowrap' }}>+ Add from Explore</Link>
                  {portfolioLocs.length > 0 && (
                    <button onClick={() => { setPreselectAllPortfolio(true); setShowCreatePermanent(true) }} style={{ padding: '8px 14px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>🔗 Share entire portfolio</button>
                  )}
                </div>
              </div>
              {portfolioLocs.length === 0 ? (
                <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>📍</div>
                  <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Your portfolio is empty</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: 16, lineHeight: 1.6 }}>Browse the Explore map and add locations you want to offer clients. Your portfolio is what gets shared on every share link.</div>
                  <Link href="/explore" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 22px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Browse Explore →</Link>
                </div>
              ) : (
                <div style={{ padding: '1rem 1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
                  {portfolioLocs.map((loc, idx) => {
                    const cityLine = loc.city && loc.state ? `${loc.city}, ${loc.state}` : (loc.city ?? loc.state ?? '')
                    const noPhotos = loc.photo_count === 0
                    return (
                      <div key={loc.id} style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--cream-dark)', background: 'white' }}>
                        <div className={BG_CYCLE[idx % BG_CYCLE.length]} style={{ height: 90, position: 'relative' }}>
                          <div style={{ position: 'absolute', top: 6, right: 6, padding: '2px 8px', borderRadius: 20, background: noPhotos ? 'rgba(196,146,42,.9)' : 'rgba(74,103,65,.9)', color: 'white', fontSize: 10, fontWeight: 600 }}>
                            {noPhotos ? '⚠ No photos' : `${loc.photo_count} photo${loc.photo_count !== 1 ? 's' : ''}`}
                          </div>
                        </div>
                        <div style={{ padding: '10px 12px' }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: noPhotos ? 8 : 0 }}>📍 {cityLine || '—'}</div>
                          {noPhotos && <div style={{ fontSize: 10, color: 'var(--gold)', fontWeight: 500, lineHeight: 1.4 }}>Add photos to replace Google Photos</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* AI SCANNER */}
            {isAdmin && (
              <div style={{ background: 'var(--ink)', borderRadius: 10, border: '1px solid rgba(255,255,255,.08)', overflow: 'hidden' }}>
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--cream)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      🤖 AI Location Scanner
                      <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, background: 'rgba(196,146,42,.2)', color: 'var(--gold)', border: '1px solid rgba(196,146,42,.3)' }}>
                        {locationCount.toLocaleString()} in DB
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(245,240,232,.4)', fontWeight: 300, marginTop: 2 }}>
                      Multi-pass scan by category — finds every type of photoshoot location in any US city.
                    </div>
                  </div>
                  <button onClick={() => setShowScanPanel(p => !p)} style={{ padding: '6px 14px', borderRadius: 4, background: 'rgba(255,255,255,.08)', color: 'rgba(245,240,232,.7)', border: '1px solid rgba(255,255,255,.15)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {showScanPanel ? 'Hide' : 'Configure'}
                  </button>
                </div>

                {showScanPanel && (
                  <div style={{ padding: '1.25rem' }}>
                    <div style={{ marginBottom: '1.25rem' }}>
                      <label style={{ ...labelStyle, color: 'rgba(245,240,232,.5)' }}>Add a city to scan</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input type="text" value={customCityInput} onChange={e => setCustomCityInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addCustomCity() }} placeholder="e.g. Springfield, Missouri" style={{ flex: 1, padding: '9px 12px', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 4, color: 'var(--cream)', fontFamily: 'inherit', fontSize: 13, outline: 'none' }} />
                        <button onClick={addCustomCity} disabled={!customCityInput.trim()} style={{ padding: '9px 16px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: !customCityInput.trim() ? 0.5 : 1 }}>+ Add</button>
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(245,240,232,.25)', marginTop: 4 }}>Type any US city and state, press Enter or click Add</div>
                    </div>

                    <div style={{ marginBottom: '1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <label style={{ ...labelStyle, color: 'rgba(245,240,232,.5)', marginBottom: 0 }}>Browse popular US cities</label>
                        <button onClick={() => setShowPopular(p => !p)} style={{ fontSize: 11, color: 'rgba(245,240,232,.4)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>{showPopular ? 'Hide ▲' : 'Show ▼'}</button>
                      </div>
                      {showPopular && (
                        <>
                          <input type="text" value={citySearchQuery} onChange={e => setCitySearchQuery(e.target.value)} placeholder="Filter cities…" style={{ width: '100%', padding: '7px 12px', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 4, color: 'var(--cream)', fontFamily: 'inherit', fontSize: 12, outline: 'none', marginBottom: 8 }} />
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 160, overflowY: 'auto' }}>
                            {filteredPopular.map(city => (
                              <button key={city} onClick={() => togglePopularCity(city)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${scanCities.includes(city) ? 'var(--gold)' : 'rgba(255,255,255,.15)'}`, background: scanCities.includes(city) ? 'rgba(196,146,42,.2)' : 'transparent', color: scanCities.includes(city) ? 'var(--gold)' : 'rgba(245,240,232,.5)', transition: 'all .15s' }}>
                                {scanCities.includes(city) ? '✓ ' : ''}{city.split(',')[0]}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    <div style={{ marginBottom: '1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <label style={{ ...labelStyle, color: 'rgba(245,240,232,.5)', marginBottom: 0 }}>Cities queued ({scanCities.length})</label>
                        {scanCities.length > 0 && <button onClick={() => setScanCities([])} style={{ fontSize: 11, color: 'rgba(181,75,42,.7)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Clear all</button>}
                      </div>
                      {scanCities.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'rgba(245,240,232,.2)', fontStyle: 'italic', padding: '6px 0' }}>No cities added yet — type one above or browse popular cities.</div>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 100, overflowY: 'auto' }}>
                          {scanCities.map(city => (
                            <div key={city} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px 3px 10px', borderRadius: 20, background: 'rgba(196,146,42,.15)', border: '1px solid rgba(196,146,42,.25)' }}>
                              <span style={{ fontSize: 11, color: 'var(--gold)' }}>{city}</span>
                              <button onClick={() => removeCity(city)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(196,146,42,.5)', fontSize: 13, lineHeight: 1, padding: '0 2px' }}>✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={{ marginBottom: '1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <label style={{ ...labelStyle, color: 'rgba(245,240,232,.5)', marginBottom: 0 }}>Scan categories ({scanCategories.length}/{ALL_CATEGORIES.length})</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => setScanCategories(ALL_CATEGORIES.map(c => c.name))} style={{ fontSize: 11, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>All</button>
                          <span style={{ color: 'rgba(255,255,255,.15)' }}>·</span>
                          <button onClick={() => setScanCategories([])} style={{ fontSize: 11, color: 'rgba(245,240,232,.3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>None</button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {ALL_CATEGORIES.map(cat => {
                          const sel = scanCategories.includes(cat.name)
                          return (
                            <div key={cat.name} onClick={() => toggleCategory(cat.name)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6, cursor: 'pointer', background: sel ? 'rgba(196,146,42,.1)' : 'rgba(255,255,255,.04)', border: `1px solid ${sel ? 'rgba(196,146,42,.3)' : 'rgba(255,255,255,.08)'}`, transition: 'all .15s' }}>
                              <div style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${sel ? 'var(--gold)' : 'rgba(255,255,255,.2)'}`, background: sel ? 'var(--gold)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--ink)', flexShrink: 0, transition: 'all .15s' }}>
                                {sel ? '✓' : ''}
                              </div>
                              <span style={{ fontSize: 14, flexShrink: 0 }}>{cat.icon}</span>
                              <span style={{ fontSize: 12, color: sel ? 'var(--gold)' : 'rgba(245,240,232,.5)', fontWeight: sel ? 500 : 300 }}>{cat.name}</span>
                              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(245,240,232,.2)' }}>~20 locations</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {scanCities.length > 0 && scanCategories.length > 0 && (
                      <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 8, marginBottom: '1.25rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, textAlign: 'center' }}>
                          <div><div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--gold)' }}>{scanCities.length}</div><div style={{ fontSize: 10, color: 'rgba(245,240,232,.3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>cities</div></div>
                          <div><div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--gold)' }}>~{estLocations.toLocaleString()}</div><div style={{ fontSize: 10, color: 'rgba(245,240,232,.3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>est. locations</div></div>
                          <div><div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: estMinutes > 10 ? 'var(--rust)' : 'var(--sage)' }}>~{estMinutes}m</div><div style={{ fontSize: 10, color: 'rgba(245,240,232,.3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>est. time</div></div>
                        </div>
                        {estMinutes > 10 && <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(245,240,232,.35)', textAlign: 'center', lineHeight: 1.5 }}>⏱ Large scan — keep this tab open. Consider scanning a few cities at a time.</div>}
                      </div>
                    )}

                    <button onClick={runScanner} disabled={scanRunning || scanCities.length === 0 || scanCategories.length === 0} style={{ width: '100%', padding: '13px', borderRadius: 4, background: scanRunning ? 'rgba(196,146,42,.3)' : 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 14, fontWeight: 500, cursor: scanRunning || scanCities.length === 0 || scanCategories.length === 0 ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: scanCities.length === 0 || scanCategories.length === 0 ? 0.4 : 1 }}>
                      {scanRunning ? (<><div style={{ width: 16, height: 16, border: '2px solid rgba(26,22,18,.3)', borderTop: '2px solid var(--ink)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />Scanning — please wait…</>) :
                        scanCities.length === 0 ? '← Add at least one city to scan' :
                        scanCategories.length === 0 ? '← Select at least one category' :
                        `🤖 Run Scanner — ${scanCities.length} ${scanCities.length === 1 ? 'city' : 'cities'} × ${scanCategories.length} categories`}
                    </button>

                    {scanRunning && <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(245,240,232,.35)', textAlign: 'center', lineHeight: 1.6 }}>Running {scanCities.length * scanCategories.length} targeted scans. Don&apos;t close this tab.</div>}

                    {scanResult && (
                      <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,.05)', borderRadius: 8, border: '1px solid rgba(255,255,255,.1)' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cream)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          ✓ Scan complete
                          <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, background: 'rgba(74,103,65,.3)', color: '#c8e8c4', border: '1px solid rgba(74,103,65,.4)', fontWeight: 500 }}>{scanResult.inserted} added</span>
                          {scanResult.errors > 0 && <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, background: 'rgba(255,255,255,.05)', color: 'rgba(245,240,232,.35)', border: '1px solid rgba(255,255,255,.1)', fontWeight: 400 }}>{scanResult.errors} skipped</span>}
                          <span style={{ fontSize: 11, color: 'rgba(245,240,232,.3)' }}>({scanResult.scans} scans run)</span>
                        </div>
                        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                          {scanResult.locations.map((loc, i) => <div key={i} style={{ fontSize: 11, color: 'rgba(245,240,232,.5)', padding: '2px 0', display: 'flex', alignItems: 'flex-start', gap: 6 }}><span style={{ color: 'var(--sage)', fontSize: 10, flexShrink: 0, marginTop: 2 }}>✓</span><span>{loc}</span></div>)}
                        </div>
                        {scanResult.errorList.length > 0 && (
                          <details style={{ marginTop: 8 }}>
                            <summary style={{ fontSize: 11, color: 'rgba(245,240,232,.3)', cursor: 'pointer' }}>Show skipped ({scanResult.errorList.length})</summary>
                            <div style={{ marginTop: 4, maxHeight: 100, overflowY: 'auto' }}>{scanResult.errorList.map((e, i) => <div key={i} style={{ fontSize: 10, color: 'rgba(245,240,232,.2)', padding: '1px 0' }}>{e}</div>)}</div>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {!showScanPanel && (
                  <div style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 13, color: 'rgba(245,240,232,.4)', fontWeight: 300 }}>
                      {locationCount === 0 ? 'No locations in database yet — run the scanner to get started.' : `${locationCount.toLocaleString()} locations in database · ${ALL_CATEGORIES.length} scan categories available`}
                    </div>
                    <button onClick={() => setShowScanPanel(true)} style={{ padding: '7px 16px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                      {locationCount === 0 ? '🤖 Scan now' : '🤖 Scan more cities'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* PENDING SUBMISSIONS */}
            {isAdmin && pendingLocs.length > 0 && (
              <div style={{ background: 'white', borderRadius: 10, border: '1px solid var(--cream-dark)', overflow: 'hidden' }}>
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--cream-dark)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      📬 Pending Submissions
                      <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(181,75,42,.1)', color: 'var(--rust)', border: '1px solid rgba(181,75,42,.2)' }}>{pendingLocs.length} to review</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, marginTop: 2 }}>Community-submitted locations waiting for your approval.</div>
                  </div>
                </div>
                {pendingLocs.map((loc, i) => (
                  <div key={loc.id} style={{ padding: '1rem 1.25rem', borderBottom: i < pendingLocs.length - 1 ? '1px solid var(--cream-dark)' : 'none' }}>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 4 }}>{loc.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span>📍 {loc.city}{loc.state ? `, ${loc.state}` : ''}</span>
                        <span style={{ padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: loc.access_type === 'public' ? 'rgba(74,103,65,.1)' : 'rgba(181,75,42,.1)', color: loc.access_type === 'public' ? 'var(--sage)' : 'var(--rust)', border: `1px solid ${loc.access_type === 'public' ? 'rgba(74,103,65,.2)' : 'rgba(181,75,42,.2)'}` }}>{loc.access_type === 'public' ? '● Public' : '🔒 Private'}</span>
                        <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{timeAgo(loc.created_at)}</span>
                      </div>
                      {loc.description && <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.5, marginBottom: 6 }}>{loc.description}</div>}
                      {loc.tags?.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>{loc.tags.map(t => <span key={t} style={{ padding: '2px 7px', borderRadius: 20, fontSize: 10, background: 'var(--cream-dark)', color: 'var(--ink-soft)', border: '1px solid var(--sand)' }}>{t}</span>)}</div>}
                      <div style={{ fontSize: 11, color: loc.latitude && loc.longitude ? 'var(--sage)' : 'var(--rust)', fontWeight: 300 }}>
                        {loc.latitude && loc.longitude ? `📌 Coords: ${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}` : '⚠ No coordinates'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => approveLocation(loc.id)} style={{ flex: 1, padding: '9px', borderRadius: 4, background: 'rgba(74,103,65,.1)', color: 'var(--sage)', border: '1px solid rgba(74,103,65,.25)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>✓ Approve & publish</button>
                      <button onClick={() => rejectLocation(loc.id)} style={{ padding: '9px 18px', borderRadius: 4, background: 'rgba(181,75,42,.08)', color: 'var(--rust)', border: '1px solid rgba(181,75,42,.2)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>✕ Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* PERMANENT SHARE LINKS */}
            <div style={{ background: 'white', borderRadius: 10, border: '1px solid var(--cream-dark)', overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--cream-dark)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    📌 Permanent Links
                    {permanentLinks.length > 0 && <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: 'rgba(61,110,140,.1)', color: 'var(--sky)', border: '1px solid rgba(61,110,140,.2)' }}>{permanentLinks.length}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, marginTop: 2 }}>Reusable links that never expire. Clients enter their email when they pick.</div>
                </div>
                <button onClick={() => setShowCreatePermanent(true)} style={{ padding: '7px 14px', borderRadius: 4, background: 'var(--ink)', color: 'var(--cream)', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>+ Create link</button>
              </div>
              {permanentLinks.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>📌</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 6 }}>No permanent links yet</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: 16, lineHeight: 1.5 }}>Create a reusable link for your go-to locations. Clients enter their email when they pick.</div>
                  <button onClick={() => setShowCreatePermanent(true)} style={{ padding: '9px 20px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Create your first permanent link</button>
                </div>
              ) : permanentLinks.map((link, i) => {
                const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/pick/${link.slug}`
                return (
                  <div key={link.id} style={{ borderBottom: i < permanentLinks.length - 1 ? '1px solid var(--cream-dark)' : 'none' }}>
                    <div style={{ padding: '1rem 1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 3 }}>{link.session_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--sky)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url.replace('https://', '')}</div>
                        </div>
                        <button onClick={() => { navigator.clipboard?.writeText(url).catch(() => {}); setToast('📋 Link copied!') }} style={{ padding: '5px 12px', borderRadius: 4, border: '1px solid var(--cream-dark)', background: 'white', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink-soft)', flexShrink: 0 }}>Copy link</button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{link.picks.length === 0 ? 'No picks yet' : `${link.picks.length} pick${link.picks.length !== 1 ? 's' : ''}`}</div>
                        {link.picks.length > 0 && <button onClick={() => togglePermLinkExpanded(link.id)} style={{ fontSize: 11, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, fontWeight: 500 }}>{link.expanded ? 'Hide picks ▲' : 'View picks ▼'}</button>}
                        <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginLeft: 'auto' }}>Created {timeAgo(link.created_at)}</div>
                      </div>
                    </div>
                    {link.expanded && link.picks.length > 0 && (
                      <div style={{ background: 'var(--cream)', borderTop: '1px solid var(--cream-dark)' }}>
                        {link.picks.map((pick, pi) => (
                          <div key={pick.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 1.25rem', borderBottom: pi < link.picks.length - 1 ? '1px solid var(--cream-dark)' : 'none' }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(196,146,42,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'var(--gold)', flexShrink: 0 }}>{pick.client_email.charAt(0).toUpperCase()}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 1 }}>{pick.client_email}</div>
                              <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{pick.location_name ? `📍 Chose: ${pick.location_name}` : 'Made a selection'}</div>
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--ink-soft)', flexShrink: 0 }}>{timeAgo(pick.created_at)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* SHARE LINKS */}
            <div style={{ background: 'white', borderRadius: 10, border: '1px solid var(--cream-dark)', overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--cream-dark)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)' }}>Recent share links</div>
                <Link href="/share" style={{ fontSize: 12, color: 'var(--gold)', textDecoration: 'none', fontWeight: 500 }}>+ New share</Link>
              </div>
              {shareLinks.length === 0 ? (
                <div style={{ padding: '2.5rem', textAlign: 'center' }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🔗</div>
                  <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>No share links yet</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: 16 }}>Create your first share link to send clients a list of location options.</div>
                  <Link href="/share" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>Create your first share link →</Link>
                </div>
              ) : shareLinks.map((share, i) => {
                const status = linkStatus(share)
                const cfg    = STATUS_CONFIG[status]
                const count  = (share.portfolio_location_ids?.length ?? 0) + (share.location_ids?.length ?? 0) + (share.secret_ids?.length ?? 0)
                const url    = `${typeof window !== 'undefined' ? window.location.origin : ''}/pick/${share.slug}`
                return (
                  <div key={share.id} style={{ padding: '1rem 1.25rem', borderBottom: i < shareLinks.length - 1 ? '1px solid var(--cream-dark)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>{share.session_name}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{count} location{count !== 1 ? 's' : ''} · {timeAgo(share.created_at)}{share.expires_at && ` · Expires ${new Date(share.expires_at).toLocaleDateString()}`}</div>
                      </div>
                      <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, flexShrink: 0, whiteSpace: 'nowrap' }}>{cfg.label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--sky)', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url.replace('https://', '')}</span>
                      {status === 'active' && (
                        <button onClick={() => copyLink(share.slug, share.id)} style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 500, border: '1px solid var(--cream-dark)', background: 'white', color: copiedId === share.id ? 'var(--sage)' : 'var(--ink-soft)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                          {copiedId === share.id ? '✓ Copied' : 'Copy link'}
                        </button>
                      )}
                      <button onClick={() => deleteShareLink(share.id)} onBlur={() => setDeleteShareId(null)} style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 500, border: 'none', background: deleteShareId === share.id ? 'var(--rust)' : 'rgba(181,75,42,.08)', color: deleteShareId === share.id ? 'white' : 'var(--rust)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                        {deleteShareId === share.id ? 'Confirm' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

          </div>

          {/* ── RIGHT COLUMN — className enables mobile stacking ── */}
          <div className="dash-right-col" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ background: 'white', borderRadius: 10, border: '1px solid var(--cream-dark)', overflow: 'hidden' }}>
              <div style={{ padding: '.9rem 1.25rem', borderBottom: '1px solid var(--cream-dark)', fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>Quick actions</div>
              <div style={{ padding: '.75rem' }}>
                {[
                  { icon: '🔗', label: 'New client share link',  href: '/share',             desc: 'Send locations to a client'  },
                  { icon: '📌', label: 'New permanent link',      href: '#',                  desc: 'Reusable link, never expires', onClick: () => { setPreselectAllPortfolio(false); setShowCreatePermanent(true) } },
                  { icon: '📍', label: 'Browse the map',         href: '/explore',           desc: 'Add locations to your portfolio' },
                  { icon: '✉️',  label: 'Edit message templates', href: '/profile#templates', desc: 'Manage your saved messages'  },
                  { icon: '⚙',  label: 'Profile settings',       href: '/profile',           desc: 'Update your info & branding' },
                ].map(action => (
                  <Link key={action.label} href={action.href} onClick={(action as any).onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 6, textDecoration: 'none', marginBottom: 2 }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--cream)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontSize: 18, width: 26, textAlign: 'center', flexShrink: 0 }}>{action.icon}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{action.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300 }}>{action.desc}</div>
                    </div>
                    <span style={{ marginLeft: 'auto', fontSize: 14, color: 'var(--sand)', flexShrink: 0 }}>›</span>
                  </Link>
                ))}
              </div>
            </div>

            <div style={{ background: 'white', borderRadius: 10, border: '1px solid var(--cream-dark)', padding: '1rem 1.25rem' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 10 }}>Your account</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(196,146,42,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: 'var(--gold)', flexShrink: 0 }}>{profile?.full_name?.charAt(0) ?? '?'}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{profile?.full_name ?? 'Your Name'}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{profile?.email}</div>
                </div>
              </div>
              <Link href="/profile" style={{ display: 'block', padding: '8px 12px', borderRadius: 4, border: '1px solid var(--cream-dark)', background: 'var(--cream)', color: 'var(--ink-soft)', fontSize: 12, fontWeight: 500, textDecoration: 'none', textAlign: 'center' }}>
                Edit profile & branding →
              </Link>
            </div>

            <div style={{ background: 'var(--ink)', borderRadius: 10, padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 16 }}>⭐</span>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)' }}>Pro Plan</div>
              </div>
              <div style={{ fontSize: 12, color: 'rgba(245,240,232,.5)', lineHeight: 1.6, fontWeight: 300, marginBottom: 10 }}>Unlimited client shares, secret locations, custom branding, and priority support.</div>
              <Link href="/profile#billing" style={{ fontSize: 11, color: 'var(--gold)', textDecoration: 'none' }}>Manage subscription →</Link>
            </div>
          </div>
        </div>
      </div>

      {/* CREATE PERMANENT LINK MODAL */}
      {showCreatePermanent && (
        <CreatePermanentLinkModal
          portfolio={portfolioLocs}
          preselectAll={preselectAllPortfolio}
          userId={profile?.id ?? ''}
          photographerName={profile?.full_name ?? ''}
          onClose={() => { setShowCreatePermanent(false); setPreselectAllPortfolio(false) }}
          onCreated={(link) => {
            setPermanentLinks(prev => [{ ...link, picks: [], expanded: false }, ...prev])
            setToast('📌 Permanent link created!')
          }}
        />
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', background: 'var(--ink)', color: 'var(--cream)', padding: '10px 18px', borderRadius: 10, fontSize: 13, border: '1px solid rgba(255,255,255,.1)', zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,.3)', animation: 'toast-in .25s ease' }}>
          {toast}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Create Permanent Link Modal ───────────────────────────────────────────────

function CreatePermanentLinkModal({
  portfolio, preselectAll, userId, photographerName, onClose, onCreated,
}: {
  portfolio: PortfolioLocation[]; preselectAll: boolean
  userId: string; photographerName: string; onClose: () => void; onCreated: (link: any) => void
}) {
  const [sessionName,    setSessionName]    = useState(preselectAll ? 'My portfolio' : '')
  const [selectedIds,    setSelectedIds]    = useState<string[]>(preselectAll ? portfolio.map(p => p.id) : [])
  const [message,        setMessage]        = useState('')
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')
  const [locSearch,      setLocSearch]      = useState('')

  function toggleLoc(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function isSelected(id: string) { return selectedIds.includes(id) }

  function generateSlug(name: string, photographer: string) {
    const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,25)
    return `${clean(photographer)}-${clean(name)}-${Date.now().toString(36)}`
  }

  async function create() {
    if (!sessionName.trim()) { setError('Please enter a name for this link.'); return }
    if (selectedIds.length === 0) { setError('Select at least one location.'); return }
    setSaving(true); setError('')
    try {
      const slug = generateSlug(sessionName, photographerName || 'photographer')
      const { data, error: insertErr } = await supabase.from('share_links').insert({
        user_id: userId, slug, session_name: sessionName.trim(),
        message: message.trim() || null, photographer_name: photographerName || null,
        portfolio_location_ids: selectedIds,
        location_ids: [], secret_ids: [],
        expires_at: null, is_permanent: true,
      }).select('id,session_name,slug,created_at,portfolio_location_ids,location_ids').single()
      if (insertErr) throw insertErr
      onCreated(data); onClose()
    } catch (err: any) { setError('Could not create link — please try again.'); console.error(err) }
    finally { setSaving(false) }
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--cream-dark)', borderRadius: 4, fontFamily: 'var(--font-dm-sans),sans-serif', fontSize: 14, color: 'var(--ink)', background: 'white', outline: 'none' }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 5 }
  const filteredLocs = portfolio.filter(l => {
    if (!locSearch.trim()) return true
    const q = locSearch.toLowerCase()
    const city = [l.city, l.state].filter(Boolean).join(', ').toLowerCase()
    return l.name.toLowerCase().includes(q) || city.includes(q)
  })

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,.7)', backdropFilter: 'blur(4px)', zIndex: 900 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'white', borderRadius: 16, width: 560, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto', zIndex: 1000, boxShadow: '0 24px 64px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 3 }}>📌 {preselectAll ? 'Share entire portfolio' : 'Create permanent link'}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300 }}>A reusable link that never expires. Drop it in your booking workflow to send clients every time.</div>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--cream-dark)', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Link name *</label>
            <input value={sessionName} onChange={e => setSessionName(e.target.value)} style={inputStyle} placeholder="e.g. My portfolio · 2026" autoFocus />
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4, fontWeight: 300 }}>Clients see this as the session name on their page.</div>
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={labelStyle}>Message to clients (optional)</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} placeholder="Hi! Here are my go-to locations. Take a look and pick your favorite!" style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 10 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Portfolio locations * <span style={{ fontSize: 10, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-soft)' }}>({selectedIds.length} of {portfolio.length} selected)</span></label>
              <div style={{ display: 'flex', gap: 10 }}>
                {selectedIds.length < portfolio.length && <button onClick={() => setSelectedIds(portfolio.map(p => p.id))} style={{ fontSize: 11, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Select all</button>}
                {selectedIds.length > 0 && <button onClick={() => setSelectedIds([])} style={{ fontSize: 11, color: 'var(--rust)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Clear all</button>}
              </div>
            </div>
            {portfolio.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', fontSize: 13, color: 'var(--ink-soft)', background: 'var(--cream)', borderRadius: 8, border: '1px dashed var(--cream-dark)' }}>
                Your portfolio is empty. <Link href="/explore" style={{ color: 'var(--gold)', fontWeight: 500 }}>Browse Explore →</Link>
              </div>
            ) : (
              <>
                <input type="text" value={locSearch} onChange={e => setLocSearch(e.target.value)} placeholder="Search your portfolio…" style={{ ...inputStyle, marginBottom: 8, fontSize: 13 }} />
                <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--cream-dark)', borderRadius: 8, overflow: 'hidden' }}>
                  {filteredLocs.length === 0 && <div style={{ padding: '1rem', textAlign: 'center', fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic' }}>No portfolio locations match &quot;{locSearch}&quot;</div>}
                  {filteredLocs.map((loc, i) => {
                    const sel = isSelected(loc.id)
                    const cityLine = [loc.city, loc.state].filter(Boolean).join(', ')
                    return (
                      <div key={loc.id} onClick={() => toggleLoc(loc.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer', borderBottom: i < filteredLocs.length - 1 ? '1px solid var(--cream-dark)' : 'none', background: sel ? 'rgba(196,146,42,.05)' : 'white', transition: 'background .15s' }}>
                        <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${sel ? 'var(--gold)' : 'var(--sand)'}`, background: sel ? 'var(--gold)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--ink)', transition: 'all .15s' }}>{sel ? '✓' : ''}</div>
                        <div className={BG_CYCLE[i % BG_CYCLE.length]} style={{ width: 34, height: 34, borderRadius: 6, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>📍 {cityLine || '—'}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
          {error && <div style={{ padding: '8px 12px', background: 'rgba(181,75,42,.08)', border: '1px solid rgba(181,75,42,.2)', borderRadius: 6, fontSize: 13, color: 'var(--rust)', marginBottom: '1rem' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={create} disabled={saving || !sessionName.trim() || selectedIds.length === 0} style={{ flex: 1, padding: '12px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: saving || !sessionName.trim() || selectedIds.length === 0 ? 0.5 : 1 }}>
              {saving ? 'Creating…' : 'Create permanent link →'}
            </button>
            <button onClick={onClose} style={{ padding: '12px 20px', borderRadius: 4, background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--sand)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          </div>
        </div>
      </div>
    </>
  )
}