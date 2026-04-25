'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import PortfolioEditModal from '@/components/PortfolioEditModal'
import AddPortfolioLocationModal from '@/components/AddPortfolioLocationModal'
import CreateLocationGuideModal from '@/components/CreateLocationGuideModal'
import LocationGuideCard from '@/components/LocationGuideCard'
import { buildShareUrl } from '@/lib/custom-domain'
import { shareFullPortfolio as shareFullPortfolioFn } from '@/lib/portfolio-share'
import { thumbUrl } from '@/lib/image'

interface Profile           { id: string; full_name: string | null; email: string | null; custom_domain: string | null; custom_domain_verified: boolean; preferences: Record<string, any> | null }
interface PortfolioLocation { id: string; source_location_id: string | null; name: string; city: string | null; state: string | null; is_secret: boolean; created_at: string; photo_count: number; preview_url: string | null }
interface ClientPick        { id: string; client_email: string; location_name: string | null; created_at: string }
interface PermanentLink     { id: string; session_name: string; slug: string; created_at: string; portfolio_location_ids: string[] | null; location_ids: string[] | null; is_full_portfolio: boolean; expires_at: string | null; expire_on_submit: boolean; cover_photo_url: string | null; picks: ClientPick[]; expanded: boolean }

function greetingTime() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

const BG_CYCLE = ['bg-1','bg-2','bg-3','bg-4','bg-5','bg-6']

export default function DashboardPage() {
  const [profile,             setProfile]             = useState<Profile | null>(null)
  const [portfolioLocs,       setPortfolioLocs]        = useState<PortfolioLocation[]>([])
  const [permanentLinks,      setPermanentLinks]       = useState<PermanentLink[]>([])
  const [loading,             setLoading]              = useState(true)
  const [toast,               setToast]                = useState<string | null>(null)
  const [showCreatePermanent,   setShowCreatePermanent]   = useState(false)
  const [preselectAllPortfolio, setPreselectAllPortfolio] = useState(false)
  const [editingPortfolioId,  setEditingPortfolioId]   = useState<string | null>(null)
  const [editingPermLink,     setEditingPermLink]      = useState<PermanentLink | null>(null)
  const [showAddPortfolio,    setShowAddPortfolio]     = useState(false)
  const [copiedGuideId,       setCopiedGuideId]        = useState<string | null>(null)
  const [deleteGuideId,       setDeleteGuideId]        = useState<string | null>(null)

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

      const [profileRes, portfolioRes] = await Promise.all([
        supabase.from('profiles').select('id,full_name,email,custom_domain,custom_domain_verified,preferences').eq('id', user.id).single(),
        supabase.from('portfolio_locations').select('id,source_location_id,name,city,state,is_secret,created_at,sort_order').eq('user_id', user.id).order('sort_order', { ascending: true }).order('created_at', { ascending: false }),
      ])

      // Send first-time users to onboarding before the dashboard loads.
      if (profileRes.data) {
        const prefs = (profileRes.data as any).preferences ?? {}
        const needsOnboarding = !prefs.onboarded_at && (!portfolioRes.data || portfolioRes.data.length === 0)
        if (needsOnboarding) {
          window.location.href = '/onboarding/how-it-works'
          return
        }
      }

      if (profileRes.data)            setProfile(profileRes.data)

      if (portfolioRes.data && portfolioRes.data.length > 0) {
        const pIds = portfolioRes.data.map((p: any) => p.id)
        const sourceIds = portfolioRes.data.map((p: any) => p.source_location_id).filter(Boolean)

        // Count of photographer's own photos per portfolio copy + first-photo preview
        // Aggregate count + first-photo per location via RPC instead of
        // fetching every photo row.
        const { data: summary } = await supabase.rpc('portfolio_photo_summary', { pids: pIds })
        const ownCount: Record<string, number> = {}
        const ownUrl:   Record<string, string> = {}
        ;(summary ?? []).forEach((r: any) => {
          const k = r.portfolio_location_id
          if (!k) return
          ownCount[k] = Number(r.cnt ?? 0)
          if (r.first_url) ownUrl[k] = r.first_url
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
        .select('id,session_name,slug,created_at,location_ids,portfolio_location_ids,is_full_portfolio,expires_at,expire_on_submit,cover_photo_url')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(6)

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

  function copyGuideUrl(slug: string, id: string) {
    const url = buildShareUrl(slug, { customDomain: profile?.custom_domain, customDomainVerified: profile?.custom_domain_verified })
    navigator.clipboard?.writeText(url).catch(() => {})
    setCopiedGuideId(id); setToast('📋 URL copied!')
    setTimeout(() => setCopiedGuideId(null), 2000)
  }

  async function deleteGuide(id: string) {
    if (deleteGuideId !== id) { setDeleteGuideId(id); return }
    const { error } = await supabase.from('share_links').delete().eq('id', id)
    if (error) { setToast('⚠ Could not delete — please try again'); return }
    setPermanentLinks(prev => prev.filter(l => l.id !== id))
    setDeleteGuideId(null); setToast('Guide deleted')
  }

  // Full-portfolio share — pinned at the top of the Location Guides section
  // even before the photographer has clicked anything to materialize it.
  // Edit/Copy lazy-create via shareFullPortfolioFn so a brand-new account
  // sees the card immediately and the row is built on first interaction.
  const fullPortfolioPermLink = permanentLinks.find(l => l.is_full_portfolio) ?? null
  const customGuides          = permanentLinks.filter(l => !l.is_full_portfolio)

  async function ensureFullPortfolioPermLink(): Promise<PermanentLink | null> {
    if (fullPortfolioPermLink) return fullPortfolioPermLink
    if (!profile) { setToast('⚠ Profile not loaded'); return null }
    const r = await shareFullPortfolioFn(profile)
    if (!r.ok) { setToast(`⚠ ${r.error}`); return null }
    await loadData()
    const { data } = await supabase
      .from('share_links')
      .select('id,session_name,slug,created_at,location_ids,portfolio_location_ids,is_full_portfolio,expires_at,expire_on_submit,cover_photo_url')
      .eq('user_id', profile.id)
      .eq('is_full_portfolio', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data
      ? { ...(data as any), picks: [], expanded: false } as PermanentLink
      : null
  }
  async function copyFullPortfolio() {
    const g = await ensureFullPortfolioPermLink()
    if (!g) return
    copyGuideUrl(g.slug, g.id)
  }
  async function editFullPortfolio() {
    const g = await ensureFullPortfolioPermLink()
    if (!g) return
    setEditingPermLink(g)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f0ece4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, color: 'var(--ink-soft)', marginBottom: 8 }}>Loading your dashboard…</div>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300 }}>Fetching your portfolio and guides</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0ece4' }}>

      <AppNav />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2rem', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 'clamp(22px,5vw,30px)', fontWeight: 900, color: 'var(--ink)', marginBottom: 4 }}>{greetingTime()}, {firstName} ☀</h1>
            <p style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300 }}>
              {portfolioLocs.length > 0
                ? `You have ${portfolioLocs.length} location${portfolioLocs.length !== 1 ? 's' : ''} in your portfolio and ${permanentLinks.length} Location Guide${permanentLinks.length !== 1 ? 's' : ''}.`
                : 'Welcome! Build your portfolio from Explore, then bundle locations into Location Guides to share with clients.'}
            </p>
          </div>
        </div>

        {/* Stats — desktop shows three cards, mobile gets a compact
            one-line summary so the header doesn't eat half the viewport
            before the user scrolls to the actual content. */}
        {(() => {
          const picks = permanentLinks.reduce((s,l) => s + l.picks.length, 0)
          const stats = [
            { label: 'Portfolio',       value: portfolioLocs.length,   sub: 'your curated set' },
            { label: 'Location guides', value: permanentLinks.length,  sub: 'reusable + single-use' },
            { label: 'Client picks',    value: picks,                  sub: 'from your guides' },
          ]
          return (
            <>
              <div className="dash-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: '2rem' }}>
                {stats.map(stat => (
                  <div key={stat.label} style={{ background: 'white', borderRadius: 10, padding: '1rem 1.25rem', border: '1px solid var(--cream-dark)' }}>
                    <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-soft)', marginBottom: 6 }}>{stat.label}</div>
                    <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 30, fontWeight: 700, color: 'var(--ink)', lineHeight: 1, marginBottom: 4 }}>{stat.value}</div>
                    <div style={{ fontSize: 12, color: 'var(--sage)' }}>{stat.sub}</div>
                  </div>
                ))}
              </div>
              <div className="dash-stats-summary" style={{ display: 'none', marginBottom: '1.25rem', padding: '10px 14px', borderRadius: 8, background: 'white', border: '1px solid var(--cream-dark)', fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5, textAlign: 'center' }}>
                <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{portfolioLocs.length}</strong> location{portfolioLocs.length !== 1 ? 's' : ''} · <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{permanentLinks.length}</strong> guide{permanentLinks.length !== 1 ? 's' : ''} · <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{picks}</strong> client pick{picks !== 1 ? 's' : ''}
              </div>
            </>
          )
        })()}

        {/* Main grid — className enables mobile single-column */}
        <div className="dash-main-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem', alignItems: 'start' }}>

          {/* ── LEFT COLUMN ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* LOCATION GUIDES — pinned above the portfolio so the things
                photographers send to clients are the most visible thing on
                the dashboard. */}
            <div style={{ background: 'white', borderRadius: 10, border: '1px solid var(--cream-dark)', overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--cream-dark)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    📚 Location Guides
                    {customGuides.length > 0 && <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: 'rgba(61,110,140,.1)', color: 'var(--sky)', border: '1px solid rgba(61,110,140,.2)' }}>{customGuides.length}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, marginTop: 2 }}>A curated set of portfolio locations for each city, style, or client — one reusable link per guide.</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                  <Link href="/location-guides" style={{ padding: '8px 14px', borderRadius: 4, background: 'white', color: 'var(--ink-soft)', border: '1px solid var(--cream-dark)', fontSize: 12, fontWeight: 500, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' }}>View all →</Link>
                  <button onClick={() => setShowCreatePermanent(true)} style={{ padding: '8px 14px', borderRadius: 4, background: 'var(--ink)', color: 'var(--cream)', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>+ New guide</button>
                </div>
              </div>

              {/* Always-on portfolio share card. Lazy-creates the share_links
                  row on first Copy/Edit so a brand-new account still sees it. */}
              <div style={{ padding: '1rem 1.25rem 0' }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-soft)', marginBottom: 8 }}>Your portfolio share</div>
                <div className="dash-portfolio-share-card">
                  <LocationGuideCard
                    bgClass={BG_CYCLE[0]}
                    guide={{
                      id:                fullPortfolioPermLink?.id ?? 'full-portfolio',
                      session_name:      fullPortfolioPermLink?.session_name ?? 'My Portfolio',
                      slug:              fullPortfolioPermLink?.slug ?? '',
                      created_at:        fullPortfolioPermLink?.created_at ?? new Date().toISOString(),
                      is_full_portfolio: true,
                      expires_at:        null,
                      expire_on_submit:  false,
                      cover_photo_url:   fullPortfolioPermLink?.cover_photo_url ?? null,
                      pick_count:        fullPortfolioPermLink?.picks.length ?? 0,
                      location_count:    portfolioLocs.length,
                    }}
                    copyState={fullPortfolioPermLink && copiedGuideId === fullPortfolioPermLink.id ? 'copied' : 'idle'}
                    deleteState="idle"
                    onCopy={copyFullPortfolio}
                    onEdit={editFullPortfolio}
                  />
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, marginTop: 6, lineHeight: 1.5 }}>
                  One link with everything in your portfolio. Auto-syncs as you add and remove locations.
                </div>
              </div>

              {/* Custom guides grid — full-portfolio is excluded since it
                  already has the dedicated card above. */}
              <div style={{ padding: '1.25rem 1.25rem 0' }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-soft)', marginBottom: 8 }}>Custom guides</div>
              </div>
              {customGuides.length === 0 ? (
                <div style={{ padding: '1rem 1.25rem 1.5rem', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: 12, lineHeight: 1.55, maxWidth: 420, margin: '0 auto 12px' }}>Build a guide for one city or theme — a <em>Kansas City</em> guide, an <em>Overland Park</em> guide, a <em>Golden Hour</em> guide.</div>
                  <button onClick={() => setShowCreatePermanent(true)} style={{ padding: '8px 18px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Create your first custom guide</button>
                </div>
              ) : (
                <div style={{ padding: '0 1.25rem 1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
                  {customGuides.map((link, i) => (
                    <LocationGuideCard
                      key={link.id}
                      bgClass={BG_CYCLE[i % BG_CYCLE.length]}
                      guide={{
                        id:                link.id,
                        session_name:      link.session_name,
                        slug:              link.slug,
                        created_at:        link.created_at,
                        is_full_portfolio: link.is_full_portfolio,
                        expires_at:        link.expires_at,
                        expire_on_submit:  link.expire_on_submit,
                        cover_photo_url:   link.cover_photo_url,
                        pick_count:        link.picks.length,
                        location_count:    (link.portfolio_location_ids?.length ?? 0) + (link.location_ids?.length ?? 0),
                      }}
                      copyState={copiedGuideId === link.id ? 'copied' : 'idle'}
                      deleteState={deleteGuideId === link.id ? 'confirming' : 'idle'}
                      onCopy={() => copyGuideUrl(link.slug, link.id)}
                      onEdit={() => setEditingPermLink(link)}
                      onDelete={() => deleteGuide(link.id)}
                    />
                  ))}
                </div>
              )}
            </div>

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
                  <button onClick={() => setShowAddPortfolio(true)} style={{ padding: '8px 16px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>+ Add new location</button>
                  <Link href="/explore" style={{ padding: '8px 14px', borderRadius: 4, background: 'white', color: 'var(--ink)', border: '1px solid var(--cream-dark)', fontSize: 12, fontWeight: 500, textDecoration: 'none', whiteSpace: 'nowrap' }}>Browse Explore →</Link>
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
                <div style={{ position: 'relative' }}>
                  <div style={{ padding: '1rem 1.25rem 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
                    {portfolioLocs.slice(0, 6).map((loc, idx) => {
                      const cityLine = loc.city && loc.state ? `${loc.city}, ${loc.state}` : (loc.city ?? loc.state ?? '')
                      const noPhotos = loc.photo_count === 0
                      return (
                        <div key={loc.id} onClick={() => setEditingPortfolioId(loc.id)} style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--cream-dark)', background: 'white', cursor: 'pointer', transition: 'all .15s' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(26,22,18,.08)' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--cream-dark)'; e.currentTarget.style.boxShadow = 'none' }}>
                          <div className={BG_CYCLE[idx % BG_CYCLE.length]} style={{ aspectRatio: '4 / 3', position: 'relative', overflow: 'hidden' }}>
                            {loc.preview_url && <img src={thumbUrl(loc.preview_url) ?? loc.preview_url} alt="" loading="lazy" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                            {noPhotos && (
                              <div style={{ position: 'absolute', top: 6, right: 6, padding: '2px 8px', borderRadius: 20, background: 'rgba(196,146,42,.9)', color: 'white', fontSize: 10, fontWeight: 600 }}>
                                ⚠ Add your photos
                              </div>
                            )}
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
                  {/* Fade the bottom row + centered "View all" CTA when there's more than fits on the preview. */}
                  {portfolioLocs.length > 6 && (
                    <div style={{ pointerEvents: 'none', position: 'absolute', left: 0, right: 0, bottom: 0, height: 90, background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,.95) 70%, white 100%)' }} />
                  )}
                  <div style={{ padding: portfolioLocs.length > 6 ? '1.25rem 1.25rem 1rem' : '0.75rem 1.25rem 1rem', display: 'flex', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
                    <Link href="/portfolio" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 20, border: '1px solid var(--cream-dark)', background: 'white', color: 'var(--ink)', fontSize: 12, fontWeight: 500, textDecoration: 'none' }}>
                      View all {portfolioLocs.length > 6 ? `${portfolioLocs.length} locations` : 'in portfolio'} →
                    </Link>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* ── RIGHT COLUMN — className enables mobile stacking ── */}
          <div className="dash-right-col" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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

      {/* CREATE LOCATION GUIDE MODAL */}
      {showCreatePermanent && (
        <CreateLocationGuideModal
          portfolio={portfolioLocs.map(p => ({ id: p.id, name: p.name, city: p.city, state: p.state, photo_url: p.preview_url }))}
          preselectAll={preselectAllPortfolio}
          userId={profile?.id ?? ''}
          photographerName={profile?.full_name ?? ''}
          onAddLocation={() => setShowAddPortfolio(true)}
          onClose={() => { setShowCreatePermanent(false); setPreselectAllPortfolio(false) }}
          onCreated={(link) => {
            setPermanentLinks(prev => [{ ...link, picks: [], expanded: false }, ...prev])
            setToast('📚 Guide created!')
          }}
        />
      )}

      {/* EDIT LOCATION GUIDE MODAL */}
      {editingPermLink && (
        <CreateLocationGuideModal
          portfolio={portfolioLocs.map(p => ({ id: p.id, name: p.name, city: p.city, state: p.state, photo_url: p.preview_url }))}
          preselectAll={false}
          userId={profile?.id ?? ''}
          photographerName={profile?.full_name ?? ''}
          editLink={editingPermLink}
          onAddLocation={() => setShowAddPortfolio(true)}
          onClose={() => setEditingPermLink(null)}
          onCreated={(link) => {
            setPermanentLinks(prev => prev.map(l => l.id === link.id ? { ...l, ...link } : l))
            setEditingPermLink(null)
            setToast('✓ Guide updated')
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

