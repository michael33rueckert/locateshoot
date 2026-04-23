'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ADMIN_EMAIL } from '@/lib/admin'
import AddressSearch, { type AddressResult } from '@/components/AddressSearch'
import ImageLightbox from '@/components/ImageLightbox'
import { buildShareUrl } from '@/lib/custom-domain'

interface Profile           { id: string; full_name: string | null; email: string | null; custom_domain: string | null; custom_domain_verified: boolean; preferences: Record<string, any> | null }
interface ShareLink         { id: string; session_name: string; created_at: string; expires_at: string | null; location_ids: string[] | null; secret_ids: string[] | null; portfolio_location_ids: string[] | null; slug: string }
interface PortfolioLocation { id: string; source_location_id: string | null; name: string; city: string | null; state: string | null; is_secret: boolean; created_at: string; photo_count: number; preview_url: string | null }
interface ClientPick        { id: string; client_email: string; location_name: string | null; created_at: string }
interface PermanentLink     { id: string; session_name: string; slug: string; created_at: string; portfolio_location_ids: string[] | null; location_ids: string[] | null; picks: ClientPick[]; expanded: boolean }

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

export default function DashboardPage() {
  const [profile,             setProfile]             = useState<Profile | null>(null)
  const [shareLinks,          setShareLinks]           = useState<ShareLink[]>([])
  const [portfolioLocs,       setPortfolioLocs]        = useState<PortfolioLocation[]>([])
  const [permanentLinks,      setPermanentLinks]       = useState<PermanentLink[]>([])
  const [loading,             setLoading]              = useState(true)
  const [toast,               setToast]                = useState<string | null>(null)
  const [copiedId,            setCopiedId]             = useState<string | null>(null)
  const [showCreatePermanent,   setShowCreatePermanent]   = useState(false)
  const [preselectAllPortfolio, setPreselectAllPortfolio] = useState(false)
  const [deleteShareId,       setDeleteShareId]        = useState<string | null>(null)
  const [editingPortfolioId,  setEditingPortfolioId]   = useState<string | null>(null)
  const [showAddPortfolio,    setShowAddPortfolio]     = useState(false)
  const [mobileMenuOpen,      setMobileMenuOpen]       = useState(false)

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

      const [profileRes, sharesRes, portfolioRes] = await Promise.all([
        supabase.from('profiles').select('id,full_name,email,custom_domain,custom_domain_verified,preferences').eq('id', user.id).single(),
        supabase.from('share_links').select('id,session_name,created_at,expires_at,location_ids,secret_ids,portfolio_location_ids,slug').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
        supabase.from('portfolio_locations').select('id,source_location_id,name,city,state,is_secret,created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
      ])

      // Send first-time users to onboarding before the dashboard loads.
      if (profileRes.data) {
        const prefs = (profileRes.data as any).preferences ?? {}
        const needsOnboarding = !prefs.onboarded_at && (!portfolioRes.data || portfolioRes.data.length === 0)
        if (needsOnboarding) {
          window.location.href = '/onboarding'
          return
        }
      }

      if (profileRes.data)            setProfile(profileRes.data)
      if (sharesRes.data)             setShareLinks(sharesRes.data)

      if (portfolioRes.data && portfolioRes.data.length > 0) {
        const pIds = portfolioRes.data.map((p: any) => p.id)
        const sourceIds = portfolioRes.data.map((p: any) => p.source_location_id).filter(Boolean)

        // Count of photographer's own photos per portfolio copy + first-photo preview
        const { data: ownPhotos } = await supabase
          .from('location_photos')
          .select('portfolio_location_id,url,created_at')
          .in('portfolio_location_id', pIds)
          .eq('is_private', false)
          .order('created_at', { ascending: true })
        const ownCount: Record<string, number> = {}
        const ownUrl:   Record<string, string> = {}
        ;(ownPhotos ?? []).forEach((r: any) => {
          const k = r.portfolio_location_id
          if (!k) return
          ownCount[k] = (ownCount[k] ?? 0) + 1
          if (!ownUrl[k] && r.url) ownUrl[k] = r.url
        })

        // Fallback: one representative photo from the public source location (Wikipedia seed)
        const sourceUrl: Record<string, string> = {}
        if (sourceIds.length > 0) {
          const { data: srcPhotos } = await supabase
            .from('location_photos')
            .select('location_id,url,created_at')
            .in('location_id', sourceIds)
            .eq('is_private', false)
            .order('created_at', { ascending: true })
          ;(srcPhotos ?? []).forEach((r: any) => {
            if (r.location_id && r.url && !sourceUrl[r.location_id]) sourceUrl[r.location_id] = r.url
          })
        }

        setPortfolioLocs(portfolioRes.data.map((p: any) => ({
          ...p,
          photo_count: ownCount[p.id] ?? 0,
          preview_url: ownUrl[p.id] ?? (p.source_location_id ? sourceUrl[p.source_location_id] ?? null : null),
        })))
      } else {
        setPortfolioLocs([])
      }

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

  // Open the edit modal when arriving via /dashboard?editPortfolio=<id>
  // (e.g. after clicking "Edit & add photos" on Explore).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const id = params.get('editPortfolio')
    if (id) {
      setEditingPortfolioId(id)
      params.delete('editPortfolio')
      const qs = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
    }
  }, [])

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
  const isAdmin   = profile?.email === ADMIN_EMAIL

  function togglePermLinkExpanded(id: string) {
    setPermanentLinks(prev => prev.map(l => l.id === id ? { ...l, expanded: !l.expanded } : l))
  }

  async function deleteShareLink(id: string) {
    if (deleteShareId !== id) { setDeleteShareId(id); return }
    const { error } = await supabase.from('share_links').delete().eq('id', id)
    if (error) { setToast('⚠ Could not delete — please try again'); console.error(error); return }
    setShareLinks(prev => prev.filter(s => s.id !== id))
    setDeleteShareId(null); setToast('Share link deleted')
  }


  function copyLink(slug: string, id: string) {
    const url = buildShareUrl(slug, { customDomain: profile?.custom_domain, customDomainVerified: profile?.custom_domain_verified })
    navigator.clipboard?.writeText(url).catch(() => {})
    setCopiedId(id); setToast('📋 Link copied!')
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function handleSignOut() { await supabase.auth.signOut(); window.location.href = '/' }

  function linkStatus(s: ShareLink) {
    return s.expires_at && new Date(s.expires_at) < new Date() ? 'expired' : 'active'
  }

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
          {isAdmin && <Link href="/admin" style={{ fontSize: 13, color: 'rgba(245,240,232,.55)', textDecoration: 'none' }}>Admin</Link>}
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
            { label: 'Client picks',    value: permanentLinks.reduce((s,l) => s + l.picks.length, 0), sub: 'from permanent links' },
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
                  <button onClick={() => setShowAddPortfolio(true)} style={{ padding: '8px 14px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>+ Add new location</button>
                  <Link href="/explore" style={{ padding: '8px 14px', borderRadius: 4, background: 'white', color: 'var(--ink-soft)', border: '1px solid var(--cream-dark)', fontSize: 12, fontWeight: 500, textDecoration: 'none', whiteSpace: 'nowrap' }}>+ Add from Explore</Link>
                  {portfolioLocs.length > 0 && (
                    <button onClick={() => { setPreselectAllPortfolio(true); setShowCreatePermanent(true) }} style={{ padding: '8px 14px', borderRadius: 4, background: 'var(--ink)', color: 'var(--cream)', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>🔗 Share entire portfolio</button>
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
                      <div key={loc.id} onClick={() => setEditingPortfolioId(loc.id)} style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--cream-dark)', background: 'white', cursor: 'pointer', transition: 'all .15s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(26,22,18,.08)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--cream-dark)'; e.currentTarget.style.boxShadow = 'none' }}>
                        <div className={BG_CYCLE[idx % BG_CYCLE.length]} style={{ height: 110, position: 'relative', overflow: 'hidden' }}>
                          {loc.preview_url && <img src={loc.preview_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                          <div style={{ position: 'absolute', top: 6, right: 6, padding: '2px 8px', borderRadius: 20, background: noPhotos ? 'rgba(196,146,42,.9)' : 'rgba(74,103,65,.9)', color: 'white', fontSize: 10, fontWeight: 600 }}>
                            {noPhotos ? '⚠ Add your photos' : `${loc.photo_count} yours`}
                          </div>
                        </div>
                        <div style={{ padding: '10px 12px' }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: noPhotos ? 8 : 4 }}>📍 {cityLine || '—'}</div>
                          {noPhotos
                            ? <div style={{ fontSize: 10, color: 'var(--gold)', fontWeight: 600, lineHeight: 1.4 }}>→ Add your professional photos</div>
                            : <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Tap to edit →</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

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
                const url = buildShareUrl(link.slug, { customDomain: profile?.custom_domain, customDomainVerified: profile?.custom_domain_verified })
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
                const url    = buildShareUrl(share.slug, { customDomain: profile?.custom_domain, customDomainVerified: profile?.custom_domain_verified })
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

      {/* PORTFOLIO EDIT MODAL */}
      {editingPortfolioId && (
        <PortfolioEditModal
          portfolioId={editingPortfolioId}
          userId={profile?.id ?? ''}
          onClose={() => setEditingPortfolioId(null)}
          onSaved={() => { setEditingPortfolioId(null); loadData(); setToast('✓ Portfolio location saved') }}
          onDeleted={() => { setEditingPortfolioId(null); loadData(); setToast('Portfolio location deleted') }}
        />
      )}

      {/* ADD NEW PORTFOLIO LOCATION MODAL */}
      {showAddPortfolio && (
        <AddPortfolioLocationModal
          userId={profile?.id ?? ''}
          onClose={() => setShowAddPortfolio(false)}
          onCreated={() => { setShowAddPortfolio(false); loadData(); setToast('✓ Added to your portfolio') }}
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

// ── Portfolio Edit Modal ─────────────────────────────────────────────────────

interface PortfolioRow {
  id: string; name: string; description: string | null
  city: string | null; state: string | null
  latitude: number | null; longitude: number | null
  access_type: string | null
  tags: string[] | null
  permit_required: boolean | null; permit_notes: string | null
  best_time: string | null; parking_info: string | null
  is_secret: boolean; source_location_id: string | null
}

interface PhotoRow { id: string; url: string; storage_path: string; caption: string | null }

function PortfolioEditModal({
  portfolioId, userId, onClose, onSaved, onDeleted,
}: {
  portfolioId: string; userId: string
  onClose: () => void; onSaved: () => void; onDeleted: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [row,     setRow]     = useState<PortfolioRow | null>(null)
  const [name,    setName]    = useState('')
  const [desc,    setDesc]    = useState('')
  const [city,    setCity]    = useState('')
  const [state,   setState]   = useState('')
  const [access,  setAccess]  = useState<'public'|'private'>('public')
  const [tags,    setTags]    = useState<string[]>([])
  const [tagInput,setTagInput]= useState('')
  const [permitRequired, setPermitRequired] = useState(false)
  const [permitNotes,    setPermitNotes]    = useState('')
  const [bestTime,       setBestTime]       = useState('')
  const [parkingInfo,    setParkingInfo]    = useState('')
  const [isSecret,setIsSecret]= useState(false)
  const [photos,  setPhotos]  = useState<PhotoRow[]>([])
  const [saving,  setSaving]  = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [err,     setErr]     = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [rowRes, photosRes] = await Promise.all([
        supabase.from('portfolio_locations').select('id,name,description,city,state,latitude,longitude,access_type,tags,permit_required,permit_notes,best_time,parking_info,is_secret,source_location_id').eq('id', portfolioId).single(),
        supabase.from('location_photos').select('id,url,storage_path,caption').eq('portfolio_location_id', portfolioId).order('created_at', { ascending: true }),
      ])
      if (cancelled) return
      if (rowRes.data) {
        setRow(rowRes.data)
        setName(rowRes.data.name ?? '')
        setDesc(rowRes.data.description ?? '')
        setCity(rowRes.data.city ?? '')
        setState(rowRes.data.state ?? '')
        setAccess((rowRes.data.access_type === 'private' ? 'private' : 'public'))
        setTags(Array.isArray(rowRes.data.tags) ? rowRes.data.tags : [])
        setPermitRequired(!!rowRes.data.permit_required)
        setPermitNotes(rowRes.data.permit_notes ?? '')
        setBestTime(rowRes.data.best_time ?? '')
        setParkingInfo(rowRes.data.parking_info ?? '')
        setIsSecret(!!rowRes.data.is_secret)
      }
      if (photosRes.data) setPhotos(photosRes.data)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [portfolioId])

  function addTag(t: string) {
    const v = t.trim(); if (!v || tags.length >= 12 || tags.includes(v)) return
    setTags(p => [...p, v]); setTagInput('')
  }
  function removeTag(t: string) { setTags(p => p.filter(x => x !== t)) }

  async function save() {
    if (!name.trim()) { setErr('Name is required.'); return }
    setSaving(true); setErr('')
    const { error } = await supabase.from('portfolio_locations').update({
      name:            name.trim(),
      description:     desc.trim() || null,
      city:            city.trim() || null,
      state:           state.trim() || null,
      access_type:     access,
      tags:            tags.length > 0 ? tags : null,
      permit_required: permitRequired,
      permit_notes:    permitNotes.trim() || null,
      best_time:       bestTime.trim() || null,
      parking_info:    parkingInfo.trim() || null,
      is_secret:       isSecret,
    }).eq('id', portfolioId)
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  async function deletePortfolio() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setSaving(true)
    // Clean up attached photos from storage (DB cascades via FK)
    for (const p of photos) {
      await supabase.storage.from('location-photos').remove([p.storage_path])
    }
    const { error } = await supabase.from('portfolio_locations').delete().eq('id', portfolioId)
    setSaving(false)
    if (error) { setErr(error.message); return }
    onDeleted()
  }

  async function deletePhoto(photo: PhotoRow) {
    await supabase.storage.from('location-photos').remove([photo.storage_path])
    await supabase.from('location_photos').delete().eq('id', photo.id)
    setPhotos(prev => prev.filter(p => p.id !== photo.id))
  }

  async function handleUpload(files: File[]) {
    if (!files.length) return
    setUploading(true)
    const { data: p } = await supabase.from('profiles').select('full_name').eq('id', userId).single()
    const uploaded: PhotoRow[] = []
    for (const f of files) {
      try {
        const ext = f.name.split('.').pop()
        const path = `${userId}/portfolio/${portfolioId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`
        const { error: ue } = await supabase.storage.from('location-photos').upload(path, f, { contentType: f.type })
        if (ue) { console.error(ue); continue }
        const { data: pub } = supabase.storage.from('location-photos').getPublicUrl(path)
        const { data: inserted, error: ie } = await supabase.from('location_photos').insert({
          portfolio_location_id: portfolioId,
          user_id: userId,
          url: pub.publicUrl,
          storage_path: path,
          is_private: false,
          photographer_name: p?.full_name ?? null,
        }).select('id,url,storage_path,caption').single()
        if (ie) { console.error(ie); continue }
        if (inserted) uploaded.push(inserted)
      } catch (e) { console.error(e) }
    }
    setPhotos(prev => [...prev, ...uploaded])
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 5 }
  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--cream-dark)', borderRadius: 4, fontFamily: 'var(--font-dm-sans),sans-serif', fontSize: 14, color: 'var(--ink)', background: 'white', outline: 'none' }
  const cityLine = row ? [row.city, row.state].filter(Boolean).join(', ') : ''

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,.7)', backdropFilter: 'blur(4px)', zIndex: 900 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'white', borderRadius: 16, width: 560, maxWidth: '92vw', maxHeight: '92vh', overflowY: 'auto', zIndex: 1000, boxShadow: '0 24px 64px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem', gap: 12 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 3 }}>Edit portfolio location</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300 }}>{cityLine || 'Your curated copy — edits don\'t affect the public map.'}</div>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--cream-dark)', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
          </div>

          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', fontSize: 13, color: 'var(--ink-soft)' }}>Loading…</div>
          ) : (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Name *</label>
                <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Description</label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="What's special about this spot?" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '1rem' }}>
                <div>
                  <label style={labelStyle}>City</label>
                  <input value={city} onChange={e => setCity(e.target.value)} style={inputStyle} placeholder="Kansas City" />
                </div>
                <div>
                  <label style={labelStyle}>State</label>
                  <input value={state} onChange={e => setState(e.target.value)} style={inputStyle} placeholder="MO" />
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Access</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['public','private'] as const).map(opt => (
                    <button key={opt} onClick={() => setAccess(opt)} style={{ flex: 1, padding: '8px 12px', borderRadius: 4, fontSize: 13, fontWeight: 500, border: `1px solid ${access === opt ? 'var(--gold)' : 'var(--cream-dark)'}`, background: access === opt ? 'rgba(196,146,42,.08)' : 'white', color: access === opt ? 'var(--gold)' : 'var(--ink-soft)', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {opt === 'public' ? '● Public' : '🔒 Private'}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Tags <span style={{ fontSize: 10, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-soft)' }}>({tags.length}/12)</span></label>
                {tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                    {tags.map(t => (
                      <span key={t} onClick={() => removeTag(t)} style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, background: 'var(--gold)', color: 'var(--ink)', cursor: 'pointer', fontWeight: 500 }}>{t} ✕</span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput) } }} placeholder="Add a tag (press Enter)" style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={() => addTag(tagInput)} style={{ padding: '9px 14px', borderRadius: 4, background: 'var(--ink)', color: 'var(--cream)', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '1rem' }}>
                <div>
                  <label style={labelStyle}>Best time</label>
                  <input value={bestTime} onChange={e => setBestTime(e.target.value)} style={inputStyle} placeholder="Golden hour, sunrise…" />
                </div>
                <div>
                  <label style={labelStyle}>Parking info</label>
                  <input value={parkingInfo} onChange={e => setParkingInfo(e.target.value)} style={inputStyle} placeholder="Free lot, street parking…" />
                </div>
              </div>

              <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--cream)', border: '1px solid var(--cream-dark)', marginBottom: '1.25rem' }}>
                <div onClick={() => setPermitRequired(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: permitRequired ? 10 : 0 }}>
                  <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${permitRequired ? 'var(--rust)' : 'var(--sand)'}`, background: permitRequired ? 'var(--rust)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white' }}>{permitRequired ? '✓' : ''}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>🔒 Permit required</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, marginTop: 2 }}>Mark if this location requires a permit to shoot.</div>
                  </div>
                </div>
                {permitRequired && (
                  <textarea value={permitNotes} onChange={e => setPermitNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical', marginTop: 4 }} placeholder="Details — fee, where to get it, contact, etc." />
                )}
              </div>

              <div onClick={() => setIsSecret(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, marginBottom: '1.25rem', cursor: 'pointer', background: isSecret ? 'rgba(124,92,191,.05)' : 'var(--cream)', border: `1px solid ${isSecret ? 'rgba(124,92,191,.3)' : 'var(--cream-dark)'}` }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${isSecret ? '#7c5cbf' : 'var(--sand)'}`, background: isSecret ? '#7c5cbf' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white' }}>{isSecret ? '✓' : ''}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>Mark as secret</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, marginTop: 2 }}>Private portfolio spot — still shows on your share links.</div>
                </div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Your photos <span style={{ fontSize: 10, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-soft)' }}>({photos.length})</span></label>
                  <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ padding: '5px 12px', borderRadius: 4, background: 'var(--ink)', color: 'var(--cream)', border: 'none', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {uploading ? 'Uploading…' : '+ Upload photos'}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" multiple onChange={e => { handleUpload(Array.from(e.target.files ?? [])) }} style={{ display: 'none' }} />
                </div>
                {photos.length === 0 ? (
                  <div style={{ padding: '1.25rem', textAlign: 'center', background: 'var(--cream)', borderRadius: 8, border: '1px dashed var(--cream-dark)' }}>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 4, fontWeight: 500 }}>⚠ No photos yet</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.5 }}>Clients will see Google Photos until you add your own.</div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(90px,1fr))', gap: 6 }}>
                    {photos.map(p => (
                      <div key={p.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--cream-dark)' }}>
                        <img src={p.url} alt="" onClick={() => setLightboxSrc(p.url)} style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in' }} />
                        <button onClick={() => deletePhoto(p)} style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', background: 'rgba(26,22,18,.75)', border: 'none', cursor: 'pointer', fontSize: 11, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {err && <div style={{ padding: '8px 12px', background: 'rgba(181,75,42,.08)', border: '1px solid rgba(181,75,42,.2)', borderRadius: 6, fontSize: 13, color: 'var(--rust)', marginBottom: '1rem' }}>{err}</div>}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <button onClick={deletePortfolio} disabled={saving} style={{ padding: '10px 18px', borderRadius: 4, background: confirmDelete ? 'var(--rust)' : 'rgba(181,75,42,.08)', color: confirmDelete ? 'white' : 'var(--rust)', border: `1px solid rgba(181,75,42,${confirmDelete ? '.4' : '.2'})`, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {confirmDelete ? 'Click again to confirm' : 'Delete from portfolio'}
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={onClose} style={{ padding: '10px 18px', borderRadius: 4, background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--sand)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                  <button onClick={save} disabled={saving || !name.trim()} style={{ padding: '10px 22px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: saving || !name.trim() ? 0.5 : 1 }}>
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </>
  )
}

// ── Add Portfolio Location Modal ─────────────────────────────────────────────

function AddPortfolioLocationModal({
  userId, onClose, onCreated,
}: {
  userId: string; onClose: () => void; onCreated: () => void
}) {
  const [name,    setName]    = useState('')
  const [city,    setCity]    = useState('')
  const [state,   setState]   = useState('')
  const [desc,    setDesc]    = useState('')
  const [access,  setAccess]  = useState<'public'|'private'>('public')
  const [isSecret,setIsSecret]= useState(false)
  const [pin,     setPin]     = useState<AddressResult | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState('')

  function onAddr(r: AddressResult) {
    setPin(r)
    const parts = (r.label ?? '').split(',').map(s => s.trim()).filter(Boolean)
    if (!name.trim() && parts[0]) setName(parts[0])
    if (!city.trim() && parts[1]) setCity(parts[1])
    if (!state.trim() && parts[2]) setState(parts[2].split(' ')[0])
  }

  async function create() {
    if (!name.trim()) { setErr('Name is required.'); return }
    if (!pin)         { setErr('Search for a location to set coordinates.'); return }
    setSaving(true); setErr('')
    const { error } = await supabase.from('portfolio_locations').insert({
      user_id:            userId,
      source_location_id: null,
      name:               name.trim(),
      description:        desc.trim() || null,
      city:               city.trim() || null,
      state:              state.trim() || null,
      latitude:           pin.lat,
      longitude:          pin.lng,
      access_type:        access,
      is_secret:          isSecret,
    })
    setSaving(false)
    if (error) { setErr(error.message); return }
    onCreated()
  }

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 5 }
  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--cream-dark)', borderRadius: 4, fontFamily: 'var(--font-dm-sans),sans-serif', fontSize: 14, color: 'var(--ink)', background: 'white', outline: 'none' }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,.7)', backdropFilter: 'blur(4px)', zIndex: 900 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'white', borderRadius: 16, width: 540, maxWidth: '92vw', maxHeight: '92vh', overflowY: 'auto', zIndex: 1000, boxShadow: '0 24px 64px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem', gap: 12 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 3 }}>+ Add new portfolio location</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300 }}>Lives in your portfolio only — not added to the public Explore map.</div>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--cream-dark)', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Search for the location *</label>
            <AddressSearch onSelect={onAddr} placeholder="Try 'Loose Park Kansas City' or a full address…" />
            {pin && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', borderRadius: 6, marginTop: 8, background: 'rgba(74,103,65,.08)', border: '1px solid rgba(74,103,65,.2)', fontSize: 13, color: 'var(--sage)' }}>
                <span>📍</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>Pinned</div>
                  <div style={{ fontSize: 11, fontWeight: 300, color: 'var(--ink-soft)', marginTop: 1 }}>{pin.shortLabel ?? pin.label}</div>
                </div>
                <button onClick={() => setPin(null)} style={{ fontSize: 11, color: 'var(--rust)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Clear</button>
              </div>
            )}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="e.g. The Willow Bend Overlook" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '1rem' }}>
            <div>
              <label style={labelStyle}>City</label>
              <input value={city} onChange={e => setCity(e.target.value)} style={inputStyle} placeholder="Kansas City" />
            </div>
            <div>
              <label style={labelStyle}>State</label>
              <input value={state} onChange={e => setState(e.target.value)} style={inputStyle} placeholder="MO" />
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Description</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="What's special about this spot?" />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Access</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['public','private'] as const).map(opt => (
                <button key={opt} onClick={() => setAccess(opt)} style={{ flex: 1, padding: '8px 12px', borderRadius: 4, fontSize: 13, fontWeight: 500, border: `1px solid ${access === opt ? 'var(--gold)' : 'var(--cream-dark)'}`, background: access === opt ? 'rgba(196,146,42,.08)' : 'white', color: access === opt ? 'var(--gold)' : 'var(--ink-soft)', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {opt === 'public' ? '● Public' : '🔒 Private'}
                </button>
              ))}
            </div>
          </div>

          <div onClick={() => setIsSecret(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, marginBottom: '1.25rem', cursor: 'pointer', background: isSecret ? 'rgba(124,92,191,.05)' : 'var(--cream)', border: `1px solid ${isSecret ? 'rgba(124,92,191,.3)' : 'var(--cream-dark)'}` }}>
            <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${isSecret ? '#7c5cbf' : 'var(--sand)'}`, background: isSecret ? '#7c5cbf' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white' }}>{isSecret ? '✓' : ''}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>Mark as secret</div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, marginTop: 2 }}>Shown on share links with only a general area — exact coords stay private.</div>
            </div>
          </div>

          {err && <div style={{ padding: '8px 12px', background: 'rgba(181,75,42,.08)', border: '1px solid rgba(181,75,42,.2)', borderRadius: 6, fontSize: 13, color: 'var(--rust)', marginBottom: '1rem' }}>{err}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={create} disabled={saving || !name.trim() || !pin} style={{ flex: 1, padding: '12px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: saving || !name.trim() || !pin ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Add to portfolio'}
            </button>
            <button onClick={onClose} style={{ padding: '12px 20px', borderRadius: 4, background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--sand)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          </div>
        </div>
      </div>
    </>
  )
}