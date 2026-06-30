'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isAdminEmail } from '@/lib/admin'
import AppNav from '@/components/AppNav'
import { thumbUrl } from '@/lib/image'
import PortfolioEditModal from '@/components/PortfolioEditModal'
import AddPortfolioLocationModal from '@/components/AddPortfolioLocationModal'
import CreateLocationGuideModal, { type GuideLinkLite, type PortfolioLocationLite } from '@/components/CreateLocationGuideModal'
import LocationGuideCard from '@/components/LocationGuideCard'
import { hasPro } from '@/lib/plan'

// White-glove admin management page for a single user. Reuses the
// existing photographer-side modals (PortfolioEditModal, AddPortfolio
// LocationModal, CreateLocationGuideModal) by passing the TARGET user's
// id as the `userId` prop. The admin's JWT bypasses RLS thanks to the
// admins table + policies in 20260624_admin_rls_bypass.sql, so writes
// land on the target's rows / storage paths without any new API
// plumbing on the modal side.
//
// Page does no writes itself — it just renders the lists + opens the
// modals. Every CRUD operation flows through the same code paths the
// photographer would use, which keeps the two surfaces in lock-step
// without duplicating photo upload / drag-reorder / fallback logic.

interface TargetUser {
  id:                       string
  email:                    string | null
  full_name:                string | null
  plan:                     string | null
  custom_domain:            string | null
  custom_domain_verified:   boolean | null
  preferences:              any
  created_at:               string
}

interface PortfolioRow {
  id:                  string
  source_location_id:  string | null
  name:                string
  city:                string | null
  state:               string | null
  preview_url:         string | null
}

interface GuideRow extends GuideLinkLite {
  expires_at:       string | null
  expire_on_submit: boolean
  cover_photo_url:  string | null
}

export default function AdminManageUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: targetId } = use(params)
  const router = useRouter()

  const [ready,         setReady]         = useState(false)
  const [target,        setTarget]        = useState<TargetUser | null>(null)
  const [notFound,      setNotFound]      = useState(false)
  const [portfolio,     setPortfolio]     = useState<PortfolioRow[]>([])
  const [guides,        setGuides]        = useState<GuideRow[]>([])
  const [toast,         setToast]         = useState<string | null>(null)
  const [editPortfolio, setEditPortfolio] = useState<string | null>(null)
  const [addPortfolio,  setAddPortfolio]  = useState(false)
  const [editGuide,     setEditGuide]     = useState<GuideRow | null>(null)
  const [addGuide,      setAddGuide]      = useState(false)

  // Auth gate — same shape as /admin. Anyone non-admin gets bounced
  // back to their dashboard. Without this check the page wouldn't be
  // dangerous (RLS still gates writes on admins-table membership), but
  // we don't want signed-in customers stumbling onto the URL.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { router.replace('/'); return }
      if (!isAdminEmail(session.user.email)) { router.replace('/dashboard'); return }
      if (!cancelled) setReady(true)
    })()
    return () => { cancelled = true }
  }, [router])

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  // Load target user's profile via the admin endpoint, plus their
  // portfolio + guides directly from Supabase (RLS bypass means the
  // admin's JWT works here).
  const loadAll = useCallback(async () => {
    if (!ready) return
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    // Profile via admin route — only place we need service-role since
    // profiles RLS may scope SELECT to self.
    try {
      const r = await fetch(`/api/admin/users/${targetId}`, { headers: { Authorization: `Bearer ${token}` } })
      if (r.status === 404) { setNotFound(true); return }
      const j = await r.json()
      if (j?.user) setTarget(j.user)
    } catch { setToast('⚠ Could not load user') }

    // Portfolio — read sort_order asc to match what clients will see
    // on the auto-Portfolio guide (pick-data uses the same order).
    const { data: portRows } = await supabase
      .from('portfolio_locations')
      .select('id,source_location_id,name,city,state')
      .eq('user_id', targetId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
    const pIds = (portRows ?? []).map((p: any) => p.id)
    // One representative photo per location for the thumbnail.
    const { data: photoSummary } = pIds.length > 0
      ? await supabase.rpc('portfolio_photo_summary', { pids: pIds })
      : { data: [] as any[] }
    const previewByPid: Record<string, string> = {}
    ;(photoSummary ?? []).forEach((r: any) => {
      if (r.portfolio_location_id && r.first_url) previewByPid[r.portfolio_location_id] = r.first_url
    })
    setPortfolio((portRows ?? []).map((p: any) => ({
      id: p.id, source_location_id: p.source_location_id,
      name: p.name, city: p.city, state: p.state,
      preview_url: previewByPid[p.id] ?? null,
    })))

    // Share links — admin sees ALL guides for the user including
    // quick-shares (single-location "Copy link" rows), since the admin
    // might be cleaning those up too.
    const { data: guideRows } = await supabase
      .from('share_links')
      .select('id,session_name,slug,created_at,portfolio_location_ids,location_ids,is_full_portfolio,expires_at,expire_on_submit,cover_photo_url')
      .eq('user_id', targetId)
      .order('created_at', { ascending: false })
    setGuides((guideRows ?? []) as GuideRow[])
  }, [ready, targetId])

  useEffect(() => { loadAll() }, [loadAll])

  // Adapters between the page's internal shapes and the modal props.
  const portfolioLite: PortfolioLocationLite[] = portfolio.map(p => ({
    id: p.id, name: p.name, city: p.city, state: p.state,
    photo_url: p.preview_url,
  }))

  // Plan-tier flags are taken from the TARGET user, not the admin, so
  // CreateLocationGuideModal renders the template picker correctly for
  // that user (Pro → editable, others → grayed preview).
  const targetIsPro = hasPro(target?.plan)

  if (!ready) {
    return (
      <div style={{ minHeight: '100svh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid rgba(0,0,0,.1)', borderTop: '2px solid var(--gold)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (notFound) {
    return (
      <div style={{ minHeight: '100svh', background: 'var(--cream)' }}>
        <AppNav />
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '4rem 1.5rem' }}>
          <Link href="/admin" style={{ fontSize: 13, color: 'var(--ink-soft)', textDecoration: 'none' }}>← Back to admin</Link>
          <h1 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 28, fontWeight: 800, color: 'var(--ink)', marginTop: '1rem' }}>User not found</h1>
          <p style={{ fontSize: 14, color: 'var(--ink-soft)', marginTop: 8 }}>No profile exists for id <code style={{ background: 'var(--cream-dark)', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>{targetId}</code>.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100svh', background: 'var(--cream)' }}>
      <AppNav />

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>
        {/* Header — sticky context banner so the admin doesn't lose
            track of which user they're acting on as they scroll. */}
        <div style={{ position: 'sticky', top: 12, zIndex: 10, background: 'var(--ink)', color: 'var(--cream)', padding: '12px 18px', borderRadius: 10, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', boxShadow: '0 6px 18px rgba(0,0,0,.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)' }}>Managing</span>
            <div>
              <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 16, fontWeight: 700 }}>
                {target?.full_name || 'Unnamed photographer'}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(245,240,232,.7)' }}>
                {target?.email} · <span style={{ textTransform: 'capitalize' }}>{(target?.plan ?? 'free')}</span> plan
              </div>
            </div>
          </div>
          <Link href="/admin" style={{ padding: '6px 12px', borderRadius: 4, background: 'rgba(255,255,255,.08)', color: 'var(--cream)', fontSize: 12, fontWeight: 500, textDecoration: 'none', border: '1px solid rgba(255,255,255,.15)' }}>← Back to admin</Link>
        </div>

        {/* PORTFOLIO ─────────────────────────────────────────────── */}
        <div style={{ background: 'white', borderRadius: 10, border: '1px solid var(--cream-dark)', overflow: 'hidden', marginBottom: '1.5rem' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--cream-dark)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>📍 Portfolio <span style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 400 }}>({portfolio.length})</span></div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>Locations the photographer offers to clients. Click to edit, including photos.</div>
            </div>
            <button onClick={() => setAddPortfolio(true)} style={{ padding: '8px 16px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Add new location</button>
          </div>
          {portfolio.length === 0 ? (
            <div style={{ padding: '2rem 1.5rem', textAlign: 'center', fontSize: 13, color: 'var(--ink-soft)' }}>No portfolio locations yet. Use “+ Add new location” to start setting one up.</div>
          ) : (
            <div style={{ padding: '1rem 1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
              {portfolio.map(loc => {
                const cityLine = loc.city && loc.state ? `${loc.city}, ${loc.state}` : (loc.city ?? loc.state ?? '')
                return (
                  <div key={loc.id} onClick={() => setEditPortfolio(loc.id)}
                    style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--cream-dark)', background: 'white', cursor: 'pointer', transition: 'all .15s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--cream-dark)' }}>
                    <div style={{ aspectRatio: '4 / 3', background: 'var(--cream-dark)', position: 'relative' }}>
                      {loc.preview_url && <img src={thumbUrl(loc.preview_url) ?? loc.preview_url} alt="" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                    </div>
                    <div style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>📍 {cityLine || '—'}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* LOCATION GUIDES ───────────────────────────────────────── */}
        <div style={{ background: 'white', borderRadius: 10, border: '1px solid var(--cream-dark)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--cream-dark)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>📚 Location Guides <span style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 400 }}>({guides.length})</span></div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>Includes the auto Portfolio guide and any quick-share single-location links.</div>
            </div>
            <button onClick={() => setAddGuide(true)} style={{ padding: '8px 16px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ New guide</button>
          </div>
          {guides.length === 0 ? (
            <div style={{ padding: '2rem 1.5rem', textAlign: 'center', fontSize: 13, color: 'var(--ink-soft)' }}>No guides yet.</div>
          ) : (
            <div style={{ padding: '1rem 1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>
              {guides.map((g, i) => (
                <LocationGuideCard
                  key={g.id}
                  bgClass={['bg-1','bg-2','bg-3','bg-4','bg-5','bg-6'][i % 6]}
                  guide={{
                    id:                g.id,
                    session_name:      g.session_name,
                    slug:               g.slug,
                    created_at:        g.created_at,
                    is_full_portfolio: g.is_full_portfolio,
                    expires_at:        g.expires_at,
                    expire_on_submit:  g.expire_on_submit,
                    pick_count:        0,
                    location_count:    (g.portfolio_location_ids?.length ?? 0) + (g.location_ids?.length ?? 0),
                    cover_photo_url:   g.cover_photo_url,
                  }}
                  featured={g.is_full_portfolio}
                  copyState="idle"
                  deleteState="idle"
                  onCopy={() => setToast('Copy URL is photographer-side only')}
                  onEdit={() => setEditGuide(g)}
                  onDelete={g.is_full_portfolio ? undefined : async () => {
                    if (!confirm(`Delete "${g.session_name}"? This is permanent.`)) return
                    const { error } = await supabase.from('share_links').delete().eq('id', g.id)
                    if (error) { setToast(`⚠ ${error.message}`); return }
                    setToast('Guide deleted')
                    loadAll()
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MODALS — reuse the photographer-side components with the
          target user's id. RLS bypass (admins table) lets the admin's
          JWT write to the target's rows + storage paths. */}
      {editPortfolio && (
        <PortfolioEditModal
          portfolioId={editPortfolio}
          userId={targetId}
          onClose={() => setEditPortfolio(null)}
          onSaved={() => { setEditPortfolio(null); loadAll(); setToast('✓ Saved') }}
          onDeleted={() => { setEditPortfolio(null); loadAll(); setToast('Location removed') }}
        />
      )}
      {addPortfolio && (
        <AddPortfolioLocationModal
          userId={targetId}
          onClose={() => setAddPortfolio(false)}
          onCreated={() => { setAddPortfolio(false); loadAll(); setToast('✓ Added to portfolio') }}
        />
      )}
      {(addGuide || editGuide) && target && (
        <CreateLocationGuideModal
          portfolio={portfolioLite}
          preselectAll={false}
          userId={targetId}
          photographerName={target.full_name ?? ''}
          isPro={targetIsPro}
          editLink={editGuide ?? undefined}
          onAddLocation={() => { setEditGuide(null); setAddGuide(false); setAddPortfolio(true) }}
          onPortfolioChanged={loadAll}
          onClose={() => { setAddGuide(false); setEditGuide(null) }}
          onCreated={() => { setAddGuide(false); setEditGuide(null); loadAll(); setToast(editGuide ? '✓ Guide updated' : '✓ Guide created') }}
        />
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', background: 'var(--ink)', color: 'var(--cream)', padding: '10px 18px', borderRadius: 10, fontSize: 13, border: '1px solid rgba(255,255,255,.1)', zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,.3)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
