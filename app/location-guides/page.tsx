'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AppNav from '@/components/AppNav'
import CreateLocationGuideModal, { type GuideLinkLite, type PortfolioLocationLite } from '@/components/CreateLocationGuideModal'
import LocationGuideCard from '@/components/LocationGuideCard'
import GuidePreviewModal from '@/components/GuidePreviewModal'
import AddPortfolioLocationModal from '@/components/AddPortfolioLocationModal'
import UpgradePrompt from '@/components/UpgradePrompt'
import PortfolioGuideBanner from '@/components/PortfolioGuideBanner'
import DemoGuideCards, { type DemoGuideTemplate } from '@/components/DemoGuideCards'
import { supabase } from '@/lib/supabase'
import { buildShareUrl } from '@/lib/custom-domain'
import { shareFullPortfolio } from '@/lib/portfolio-share'
import { hasStarter, hasPro } from '@/lib/plan'
import { shareOrCopy } from '@/lib/share'

const BG_CYCLE = ['bg-1','bg-2','bg-3','bg-4','bg-5','bg-6']

// Full-screen management page for every Location Guide the photographer has
// created. Replaces the old "Recent share links" + "Permanent Links" split —
// both kinds of link now live under the same roof, differentiated only by
// expiration policy.

interface GuideRow extends GuideLinkLite {
  expires_at:       string | null
  expire_on_submit: boolean
  cover_photo_url:  string | null
  pick_count:       number
}

interface ProfileLite {
  id:                     string
  full_name:              string | null
  custom_domain:          string | null
  custom_domain_verified: boolean
  plan:                   string | null
}

export default function LocationGuidesPage() {
  const [profile,      setProfile]      = useState<ProfileLite | null>(null)
  const [guides,       setGuides]       = useState<GuideRow[]>([])
  const [portfolio,    setPortfolio]    = useState<PortfolioLocationLite[]>([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [showCreate,   setShowCreate]   = useState(false)
  const [editing,      setEditing]      = useState<GuideRow | null>(null)
  const [deleteId,     setDeleteId]     = useState<string | null>(null)
  const [copiedId,     setCopiedId]     = useState<string | null>(null)
  const [toast,        setToast]        = useState<string | null>(null)
  const [previewUrl,   setPreviewUrl]   = useState<string | null>(null)
  const [preselectIds, setPreselectIds] = useState<string[]>([])
  const [showAdd,      setShowAdd]      = useState(false)
  // Toggled when a Free user clicks "+ New guide". Free plan only
  // includes the auto-Portfolio guide, so any custom-guide attempt
  // surfaces the dual-plan UpgradePrompt instead of opening the
  // create modal. Same gate as the dashboard's Location Guides
  // section.
  const [showQuotaUpgrade, setShowQuotaUpgrade] = useState(false)
  // When set, opens CreateLocationGuideModal pre-filled with this
  // demo template's session_name + message. Clicking a demo card sets
  // this; onClose / onCreated clears it.
  const [demoPrefill, setDemoPrefill] = useState<DemoGuideTemplate | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/'; return }
      // share_links query: filter quick_share=true rows out so single-
      // location "Copy link" shares don't clutter the curated guides
      // list. Falls back to the legacy column set on pre-migration
      // Supabase instances — quick-shares will appear in the list
      // until the migration runs, which is acceptable.
      const guidesP = (async () => {
        const r = await supabase.from('share_links')
          .select('id,session_name,slug,created_at,portfolio_location_ids,location_ids,is_full_portfolio,expires_at,expire_on_submit,cover_photo_url,quick_share')
          .eq('user_id', user.id)
          .eq('quick_share', false)
          .order('created_at', { ascending: false })
        if (r.error) {
          return supabase.from('share_links')
            .select('id,session_name,slug,created_at,portfolio_location_ids,location_ids,is_full_portfolio,expires_at,expire_on_submit,cover_photo_url')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
        }
        return r
      })()
      const [profRes, guidesRes, portRes] = await Promise.all([
        supabase.from('profiles').select('id,full_name,custom_domain,custom_domain_verified,plan').eq('id', user.id).single(),
        guidesP,
        supabase.from('portfolio_locations').select('id,source_location_id,name,city,state').eq('user_id', user.id).order('sort_order', { ascending: true }).order('created_at', { ascending: false }),
      ])
      if (profRes.data) setProfile(profRes.data as any)
      if (portRes.data && portRes.data.length > 0) {
        // Resolve one representative photo per portfolio location so the
        // picker inside CreateLocationGuideModal can show real thumbnails
        // instead of the placeholder BG_CYCLE blocks.
        const pIds = portRes.data.map((p: any) => p.id)
        const sourceIds = portRes.data.map((p: any) => p.source_location_id).filter(Boolean) as string[]
        const { data: summary } = await supabase.rpc('portfolio_photo_summary', { pids: pIds })
        const ownUrl: Record<string, string> = {}
        ;(summary ?? []).forEach((r: any) => {
          if (r.portfolio_location_id && r.first_url) ownUrl[r.portfolio_location_id] = r.first_url
        })
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
        setPortfolio(portRes.data.map((p: any) => ({
          id:        p.id,
          name:      p.name,
          city:      p.city,
          state:     p.state,
          photo_url: ownUrl[p.id] ?? (p.source_location_id ? sourceUrl[p.source_location_id] ?? null : null),
        })))
      } else {
        setPortfolio([])
      }
      if (guidesRes.data && guidesRes.data.length > 0) {
        const ids = guidesRes.data.map((g: any) => g.id)
        const { data: picks } = await supabase
          .from('client_picks')
          .select('share_link_id')
          .in('share_link_id', ids)
        const counts: Record<string, number> = {}
        ;(picks ?? []).forEach((p: any) => {
          if (!p.share_link_id) return
          counts[p.share_link_id] = (counts[p.share_link_id] ?? 0) + 1
        })
        setGuides(guidesRes.data.map((g: any) => ({ ...g, pick_count: counts[g.id] ?? 0 })))
      } else {
        setGuides([])
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // ?new=1 auto-opens the create modal (e.g. when arriving from Explore's
  // "Share with client" action). If Explore stashed a location in
  // sessionStorage, resolve it against the portfolio so the modal can open
  // with it preselected — but only when the location is already in the
  // photographer's portfolio (guides are portfolio-only by rule).
  useEffect(() => {
    if (loading || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('new') !== '1') return
    const stored = sessionStorage.getItem('sharePreselectedLocation')
    if (stored) {
      try {
        const loc = JSON.parse(stored)
        const id = String(loc.id)
        const match = portfolio.find(p => String(p.id) === id)
        if (match) setPreselectIds([match.id])
        else setToast('Add this location to your portfolio first — then it can go into a guide.')
      } catch {}
      sessionStorage.removeItem('sharePreselectedLocation')
    }
    setShowCreate(true)
    params.delete('new')
    const qs = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
  }, [loading, portfolio])

  async function deleteGuide(id: string) {
    if (deleteId !== id) { setDeleteId(id); return }
    const { error } = await supabase.from('share_links').delete().eq('id', id)
    if (error) { setToast('⚠ Could not delete — please try again'); return }
    setGuides(prev => prev.filter(g => g.id !== id))
    setDeleteId(null)
    setToast('Guide deleted')
  }

  async function copyLink(slug: string, id: string, title: string) {
    const url = buildShareUrl(slug, { customDomain: profile?.custom_domain ?? null, customDomainVerified: profile?.custom_domain_verified ?? false })
    const r = await shareOrCopy({ url, title })
    if (r.method === 'clipboard') {
      // Native share unavailable — show the same toast + button feedback we
      // had before so the user knows the URL is on their clipboard.
      setCopiedId(id); setToast('📋 Link copied!')
      setTimeout(() => setCopiedId(null), 2000)
    } else if (r.method === 'failed') {
      setToast('⚠ Could not share — please copy manually')
    }
    // method === 'native': the OS share sheet IS the feedback. No toast.
  }
  function previewGuide(slug: string) {
    const url = buildShareUrl(slug, { customDomain: profile?.custom_domain ?? null, customDomainVerified: profile?.custom_domain_verified ?? false })
    setPreviewUrl(url)
  }
  // Static portfolio-share card may not have a materialized share_link
  // yet. Lazy-create and then point the in-app preview modal at the
  // resulting URL — no popup window needed since the modal is in-page.
  async function previewFullPortfolio() {
    const g = await ensureFullPortfolioGuide()
    if (!g) return
    const url = buildShareUrl(g.slug, { customDomain: profile?.custom_domain ?? null, customDomainVerified: profile?.custom_domain_verified ?? false })
    setPreviewUrl(url)
  }

  // The "Your portfolio share" card is rendered up top regardless of
  // whether the photographer has actually generated the full-portfolio
  // share_link yet. Edit / Copy lazy-create the row on demand so first-
  // time users don't have to find the old "Share all" button to discover
  // the auto-syncing link exists.
  const fullPortfolioGuide = guides.find(g => g.is_full_portfolio) ?? null

  async function ensureFullPortfolioGuide(): Promise<GuideRow | null> {
    if (fullPortfolioGuide) return fullPortfolioGuide
    if (!profile) { setToast('⚠ Profile not loaded'); return null }
    const r = await shareFullPortfolio(profile)
    if (!r.ok) { setToast(`⚠ ${r.error}`); return null }
    // Re-fetch so the new row is in `guides` and we can return it from there.
    await load()
    // load() updates state asynchronously — re-query the DB directly to
    // get the row right now without waiting for the React render cycle.
    const { data } = await supabase
      .from('share_links')
      .select('id,session_name,slug,created_at,portfolio_location_ids,location_ids,is_full_portfolio,expires_at,expire_on_submit,cover_photo_url')
      .eq('user_id', profile.id)
      .eq('is_full_portfolio', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data ? { ...(data as any), pick_count: 0 } as GuideRow : null
  }

  async function copyFullPortfolio() {
    const g = await ensureFullPortfolioGuide()
    if (!g) return
    copyLink(g.slug, g.id, g.session_name || 'My Portfolio')
  }
  async function editFullPortfolio() {
    const g = await ensureFullPortfolioGuide()
    if (!g) return
    setEditing(g)
  }

  const q = search.trim().toLowerCase()
  const filtered = guides
    .filter(g => !g.is_full_portfolio)  // full-portfolio gets its own card up top
    .filter(g => !q || g.session_name.toLowerCase().includes(q))

  return (
    <div style={{ minHeight: '100svh', background: 'var(--cream)' }}>
      <AppNav />

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 'clamp(26px,5vw,38px)', fontWeight: 900, color: 'var(--ink)', marginBottom: 6 }}>
              Location Guides
            </h1>
            <p style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300, maxWidth: 640, lineHeight: 1.6 }}>
              A Location Guide is a curated set of portfolio locations you send to a client. Save them for reuse
              (one per city, one per session style) or make them single-use for a specific client.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href="/portfolio" style={{ padding: '10px 18px', borderRadius: 6, background: 'white', color: 'var(--ink)', border: '1px solid var(--cream-dark)', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>← Portfolio</Link>
            <button onClick={() => {
              if (!hasStarter(profile?.plan)) {
                setShowQuotaUpgrade(true)
                return
              }
              setShowCreate(true)
            }} style={{ padding: '10px 18px', borderRadius: 6, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ New guide</button>
          </div>
        </div>

        {showQuotaUpgrade && (
          <div style={{ marginBottom: '1.5rem' }}>
            <UpgradePrompt
              feature="custom Location Guides"
              description="The Free plan only includes your auto-generated Portfolio guide. Upgrade to Starter or Pro to create custom guides — one per city, theme, client, or session."
            />
            <button onClick={() => setShowQuotaUpgrade(false)} style={{ marginTop: 8, background: 'transparent', color: 'var(--ink-soft)', border: 'none', padding: 0, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>Dismiss</button>
          </div>
        )}

        {/* Free plan with leftover custom guides from a previous paid
            tier — surface a single inline UpgradePrompt explaining why
            the cards below show grayed-out. The cards themselves have
            their own "Inactive" badges; this banner is the call to
            action. */}
        {!hasStarter(profile?.plan) && filtered.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <UpgradePrompt
              feature="your existing Location Guides"
              description={`You have ${filtered.length} custom Location Guide${filtered.length === 1 ? '' : 's'} that won't reach clients on the Free plan — re-subscribe to Starter or Pro and the same URLs work again automatically.`}
            />
          </div>
        )}

        {/* Search */}
        <div style={{ marginBottom: '1rem' }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search guides by name…"
            style={{ width: '100%', padding: '11px 16px', borderRadius: 8, border: '1px solid var(--cream-dark)', background: 'white', fontSize: 14, fontFamily: 'inherit', color: 'var(--ink)', outline: 'none' }}
          />
        </div>

        {loading ? (
          <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
            <div style={{ width: 28, height: 28, border: '2px solid var(--cream-dark)', borderTop: '2px solid var(--gold)', borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300 }}>Loading your guides…</div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : (
          <>
            {/* Portfolio guide banner — always visible, styled as its
                own thing so it doesn't look like "just another guide"
                in the grid below. Search still applies to the custom
                guides only; the banner stays put regardless of
                search since it's the one guide the photographer
                always has. */}
            <PortfolioGuideBanner
              photographerName={profile?.full_name ?? ''}
              locationCount={portfolio.length}
              coverPhotoUrl={fullPortfolioGuide?.cover_photo_url ?? null}
              hasLink={!!fullPortfolioGuide}
              onShare={copyFullPortfolio}
              onEdit={editFullPortfolio}
              onPreview={previewFullPortfolio}
              pickCount={fullPortfolioGuide?.pick_count ?? 0}
              copyState={fullPortfolioGuide && copiedId === fullPortfolioGuide.id ? 'copied' : 'idle'}
            />

            {/* Custom guides — grid below the banner. Portfolio guide
                filtered out (banner replaces it). */}
            {filtered.length === 0 && !q ? (
              // No custom guides + no active search → new user. Show
              // demo cards to explain what a custom guide IS and let
              // them create their first one with a click.
              <DemoGuideCards onPickTemplate={t => { setDemoPrefill(t); setShowCreate(true) }} />
            ) : filtered.length === 0 && q ? (
              <div style={{ background: 'white', borderRadius: 12, border: '1px solid var(--cream-dark)', padding: '2.5rem 1.5rem', textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 4 }}>No matches</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300 }}>No guide name contains &quot;{search}&quot;.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 14 }}>
                {filtered.map((g, i) => (
                  <LocationGuideCard
                    key={g.id}
                    bgClass={BG_CYCLE[i % BG_CYCLE.length]}
                    guide={{
                      id:                g.id,
                      session_name:      g.session_name,
                      slug:              g.slug,
                      created_at:        g.created_at,
                      is_full_portfolio: g.is_full_portfolio,
                      expires_at:        g.expires_at,
                      expire_on_submit:  g.expire_on_submit,
                      cover_photo_url:   g.cover_photo_url,
                      pick_count:        g.pick_count,
                      location_count:    (g.portfolio_location_ids?.length ?? 0) + (g.location_ids?.length ?? 0),
                    }}
                    inactive={!hasStarter(profile?.plan)}
                    copyState={copiedId === g.id ? 'copied' : 'idle'}
                    deleteState={deleteId === g.id ? 'confirming' : 'idle'}
                    onCopy={() => copyLink(g.slug, g.id, g.session_name || 'Location Guide')}
                    onEdit={() => setEditing(g)}
                    onDelete={() => deleteGuide(g.id)}
                    onPreview={() => previewGuide(g.slug)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && (
        <CreateLocationGuideModal
          portfolio={portfolio}
          preselectAll={false}
          preselectIds={preselectIds}
          userId={profile?.id ?? ''}
          photographerName={profile?.full_name ?? ''}
          isPro={hasPro(profile?.plan)}
          initialSessionName={demoPrefill?.session_name}
          initialMessage={demoPrefill?.message}
          onAddLocation={() => setShowAdd(true)}
          onPortfolioChanged={load}
          onClose={() => { setShowCreate(false); setPreselectIds([]); setDemoPrefill(null) }}
          onCreated={() => { setShowCreate(false); setPreselectIds([]); setDemoPrefill(null); load(); setToast('📚 Guide created!') }}
        />
      )}

      {editing && (
        <CreateLocationGuideModal
          portfolio={portfolio}
          preselectAll={false}
          userId={profile?.id ?? ''}
          photographerName={profile?.full_name ?? ''}
          isPro={hasPro(profile?.plan)}
          editLink={editing}
          onAddLocation={() => setShowAdd(true)}
          onPortfolioChanged={load}
          onClose={() => setEditing(null)}
          onCreated={() => { setEditing(null); load(); setToast('✓ Guide updated') }}
        />
      )}

      {showAdd && profile && (
        <AddPortfolioLocationModal
          userId={profile.id}
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); load(); setToast('✓ Added to your portfolio') }}
        />
      )}

      {/* Guide preview modal — opened from the 👁 Preview button on
          any guide card. Loads /pick/[slug] in an iframe with a
          desktop / mobile viewport toggle. */}
      {previewUrl && <GuidePreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />}

      {toast && (
        <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', background: 'var(--ink)', color: 'var(--cream)', padding: '10px 18px', borderRadius: 10, fontSize: 13, border: '1px solid rgba(255,255,255,.1)', zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,.3)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
