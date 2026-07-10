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
  banned_until:             string | null
  stripe_subscription_id:   string | null
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

  // ── Danger Zone state ──
  // Deactivate modal: checkbox for the optional "also take share links
  // offline" step. Delete modal: email echo + MFA code, both required.
  const [deactivateOpen,      setDeactivateOpen]      = useState(false)
  const [deactivateShares,    setDeactivateShares]    = useState(false)
  const [deactivateBusy,      setDeactivateBusy]      = useState(false)
  const [deleteOpen,          setDeleteOpen]          = useState(false)
  const [deleteEmail,         setDeleteEmail]         = useState('')
  const [deleteMfaCode,       setDeleteMfaCode]       = useState('')
  const [deleteBusy,          setDeleteBusy]          = useState(false)
  const [deleteError,         setDeleteError]         = useState('')

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

  // ── Danger Zone handlers ──

  async function doDeactivate() {
    setDeactivateBusy(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setDeactivateBusy(false); return }
    const res = await fetch(`/api/admin/users/${targetId}/deactivate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ takeSharesOffline: deactivateShares }),
    })
    const j = await res.json().catch(() => ({}))
    setDeactivateBusy(false)
    if (!res.ok) { setToast(`⚠ ${j.message ?? j.error ?? 'Deactivate failed'}`); return }
    setDeactivateOpen(false)
    const extra = deactivateShares && j.sharesExpired ? ` · ${j.sharesExpired} share link${j.sharesExpired === 1 ? '' : 's'} expired` : ''
    setDeactivateShares(false)
    setToast(`✓ Deactivated${extra}`)
    loadAll()
  }

  async function doReactivate() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(`/api/admin/users/${targetId}/reactivate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setToast(`⚠ ${j.message ?? j.error ?? 'Reactivate failed'}`); return }
    setToast('✓ Reactivated — this user can sign in again')
    loadAll()
  }

  async function doDelete() {
    setDeleteError('')
    if (!target?.email) { setDeleteError('Target email unknown — reload the page.'); return }
    if (deleteEmail.trim().toLowerCase() !== target.email.toLowerCase()) {
      setDeleteError("Email doesn't match — type this user's exact email to confirm.")
      return
    }
    if (deleteMfaCode.trim().length !== 6) {
      setDeleteError('Enter the 6-digit code from your authenticator app.')
      return
    }
    setDeleteBusy(true)

    // Step 1: fresh MFA challenge on your admin session. mfa.verify()
    // returns a refreshed session at aal2 and puts it in the client
    // cache; the DELETE handler decodes the aal claim to require it.
    try {
      const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors()
      if (fErr) throw fErr
      const totp = factors?.totp?.find(f => f.status === 'verified')
      if (!totp) throw new Error('No MFA factor enrolled on your admin account. Enroll one in Profile → Security first.')
      const ch = await supabase.auth.mfa.challenge({ factorId: totp.id })
      if (ch.error) throw ch.error
      const vr = await supabase.auth.mfa.verify({ factorId: totp.id, challengeId: ch.data.id, code: deleteMfaCode.trim() })
      if (vr.error) throw vr.error
    } catch (err: any) {
      setDeleteBusy(false)
      setDeleteError(err?.message ?? 'MFA verification failed. Try again.')
      return
    }

    // Step 2: grab the fresh aal2 access token and call DELETE.
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setDeleteBusy(false)
      setDeleteError('Session lost after MFA — please sign in again.')
      return
    }

    const res = await fetch(`/api/admin/users/${targetId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const j = await res.json().catch(() => ({}))
    setDeleteBusy(false)
    if (!res.ok) {
      setDeleteError(j.message ?? j.error ?? 'Delete failed — nothing changed.')
      return
    }

    // Success — bounce back to the admin index so we're not looking at
    // a now-empty user page. Warnings (Stripe / partial table delete)
    // bubble up in the toast so the admin can follow up.
    setDeleteOpen(false)
    const warnings: string[] = []
    if (j.stripeWarning) warnings.push(`Stripe: ${j.stripeWarning}`)
    if (j.tableWarnings?.length) warnings.push(...j.tableWarnings)
    router.replace('/admin')
    // Toast survives navigation? No — but the redirect is enough
    // signal on its own; the user is now off the deleted profile.
    if (warnings.length) console.warn('Delete warnings:', warnings)
  }

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
            {target?.banned_until && (
              <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: 'var(--rust)', color: 'white' }}>Deactivated</span>
            )}
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
            // Horizontal "tiles" — matches /portfolio + dashboard shape so
            // the admin sees the same compact list view the photographer
            // would.
            <div style={{ padding: '1rem 1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 10 }}>
              {portfolio.map(loc => {
                const cityLine = loc.city && loc.state ? `${loc.city}, ${loc.state}` : (loc.city ?? loc.state ?? '')
                return (
                  <div key={loc.id} onClick={() => setEditPortfolio(loc.id)}
                    style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--cream-dark)', background: 'white', cursor: 'pointer', transition: 'all .15s', display: 'flex', alignItems: 'stretch', gap: 12, padding: 10 }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--cream-dark)' }}>
                    <div style={{ width: 76, height: 76, flexShrink: 0, borderRadius: 6, background: 'var(--cream-dark)', position: 'relative', overflow: 'hidden' }}>
                      {loc.preview_url && <img src={thumbUrl(loc.preview_url) ?? loc.preview_url} alt="" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>📍 {cityLine || '—'}</div>
                      <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Tap to edit →</div>
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

        {/* DANGER ZONE ────────────────────────────────────────────── */}
        <div style={{ marginTop: '1.5rem', background: 'white', borderRadius: 10, border: '1px solid rgba(181,75,42,.3)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(181,75,42,.15)', background: 'rgba(181,75,42,.04)' }}>
            <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--rust)' }}>⚠ Danger Zone</div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>Account-level actions. Deactivate is reversible; Delete is not.</div>
          </div>

          <div style={{ padding: '1.25rem' }}>
            {/* Deactivate / Reactivate row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingBottom: '1rem', borderBottom: '1px solid var(--cream-dark)', marginBottom: '1rem' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                  {target?.banned_until ? 'Reactivate account' : 'Deactivate account'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2, lineHeight: 1.5 }}>
                  {target?.banned_until
                    ? "Currently deactivated — this photographer can't sign in. Reactivating lifts the sign-in ban. Any share links you took offline at deactivation stay expired unless you edit them individually."
                    : "Block sign-in without touching any of their data. Portfolio, Location Guides, and photos all stay put. Reversible."}
                </div>
              </div>
              {target?.banned_until ? (
                <button onClick={doReactivate} style={{ padding: '9px 20px', borderRadius: 6, border: '1px solid var(--sage)', background: 'white', color: 'var(--sage)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Reactivate</button>
              ) : (
                <button onClick={() => { setDeactivateShares(false); setDeactivateOpen(true) }} style={{ padding: '9px 20px', borderRadius: 6, border: '1px solid var(--rust)', background: 'white', color: 'var(--rust)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Deactivate…</button>
              )}
            </div>

            {/* Delete row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Delete account and all data</div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2, lineHeight: 1.5 }}>
                  Permanently removes their profile, portfolio, Location Guides, photos, and auth login. {target?.stripe_subscription_id ? 'Cancels their Stripe subscription. ' : ''}Requires typing their email and your MFA code. This cannot be undone.
                </div>
              </div>
              <button onClick={() => { setDeleteEmail(''); setDeleteMfaCode(''); setDeleteError(''); setDeleteOpen(true) }} style={{ padding: '9px 20px', borderRadius: 6, border: 'none', background: 'var(--rust)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Delete…</button>
            </div>
          </div>
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

      {/* DEACTIVATE MODAL */}
      {deactivateOpen && target && (
        <>
          <div onClick={() => !deactivateBusy && setDeactivateOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,8,6,.6)', zIndex: 9700 }} />
          <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', background: 'white', borderRadius: 12, width: 480, maxWidth: '94vw', padding: '1.5rem', zIndex: 9800, boxShadow: '0 24px 64px rgba(0,0,0,.35)' }}>
            <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Deactivate this account?</div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.55, marginBottom: '1.25rem' }}>
              <strong style={{ color: 'var(--ink)' }}>{target.email}</strong> won&apos;t be able to sign in. Everything they&apos;ve created — portfolio, guides, photos — stays exactly as it is. You can reactivate them any time.
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '10px 12px', borderRadius: 6, background: 'var(--cream)', marginBottom: '1.25rem' }}>
              <input type="checkbox" checked={deactivateShares} onChange={e => setDeactivateShares(e.target.checked)} disabled={deactivateBusy} style={{ marginTop: 3, cursor: 'pointer' }} />
              <div>
                <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>Also take existing share links offline</div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2, lineHeight: 1.5 }}>
                  Any client hitting one of their /pick URLs will see the &quot;guide expired&quot; page. The auto Full-Portfolio guide is left alone so it snaps back when you reactivate.
                </div>
              </div>
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeactivateOpen(false)} disabled={deactivateBusy} style={{ padding: '10px 18px', borderRadius: 6, background: 'white', border: '1px solid var(--cream-dark)', color: 'var(--ink-soft)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={doDeactivate} disabled={deactivateBusy} style={{ padding: '10px 20px', borderRadius: 6, border: 'none', background: 'var(--rust)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: deactivateBusy ? 0.6 : 1 }}>
                {deactivateBusy ? 'Deactivating…' : 'Deactivate'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* DELETE MODAL — email echo + step-up MFA before the DELETE call */}
      {deleteOpen && target && (
        <>
          <div onClick={() => !deleteBusy && setDeleteOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,8,6,.7)', zIndex: 9700 }} />
          <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', background: 'white', borderRadius: 12, width: 500, maxWidth: '94vw', maxHeight: '90svh', overflowY: 'auto', padding: '1.5rem', zIndex: 9800, boxShadow: '0 24px 64px rgba(0,0,0,.4)' }}>
            <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--rust)', marginBottom: 6 }}>Delete this account?</div>
            <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.55, marginBottom: '1rem' }}>
              This permanently removes <strong>{target.email}</strong>&apos;s entire account — profile, {portfolio.length} portfolio location{portfolio.length === 1 ? '' : 's'}, {guides.length} Location Guide{guides.length === 1 ? '' : 's'}, all photos, and their auth login.
              {target.stripe_subscription_id && <> Their Stripe subscription will also be cancelled.</>}
            </div>
            <div style={{ padding: '10px 14px', background: 'rgba(181,75,42,.08)', border: '1px solid rgba(181,75,42,.25)', borderRadius: 6, fontSize: 12, color: 'var(--rust)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              There is no undo. If you&apos;re not 100% sure, use Deactivate instead.
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                Type the user&apos;s email to confirm
              </label>
              <input
                type="email"
                value={deleteEmail}
                onChange={e => setDeleteEmail(e.target.value)}
                placeholder={target.email ?? ''}
                disabled={deleteBusy}
                autoComplete="off"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--cream-dark)', borderRadius: 6, fontFamily: 'inherit', fontSize: 14, outline: 'none', color: 'var(--ink)', background: 'white', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                Your MFA code
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={deleteMfaCode}
                onChange={e => setDeleteMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123 456"
                maxLength={6}
                disabled={deleteBusy}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--cream-dark)', borderRadius: 6, fontFamily: 'var(--font-mono, Menlo, monospace)', fontSize: 20, letterSpacing: 6, textAlign: 'center', outline: 'none', color: 'var(--ink)', background: 'white', boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 6, lineHeight: 1.5 }}>
                Open your authenticator app and enter your current 6-digit LocateShoot code.
              </div>
            </div>

            {deleteError && (
              <div style={{ padding: '9px 12px', background: 'rgba(181,75,42,.1)', border: '1px solid rgba(181,75,42,.3)', borderRadius: 6, fontSize: 13, color: 'var(--rust)', marginBottom: '1rem', lineHeight: 1.5 }}>
                {deleteError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteOpen(false)} disabled={deleteBusy} style={{ padding: '10px 18px', borderRadius: 6, background: 'white', border: '1px solid var(--cream-dark)', color: 'var(--ink-soft)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button
                onClick={doDelete}
                disabled={deleteBusy || deleteMfaCode.length !== 6 || !deleteEmail.trim()}
                style={{ padding: '10px 20px', borderRadius: 6, border: 'none', background: 'var(--rust)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: deleteBusy || deleteMfaCode.length !== 6 || !deleteEmail.trim() ? 0.55 : 1 }}
              >
                {deleteBusy ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', background: 'var(--ink)', color: 'var(--cream)', padding: '10px 18px', borderRadius: 10, fontSize: 13, border: '1px solid rgba(255,255,255,.1)', zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,.3)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
