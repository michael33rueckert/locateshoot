'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AppNav from '@/components/AppNav'
import CreateLocationGuideModal, { type GuideLinkLite, type PortfolioLocationLite } from '@/components/CreateLocationGuideModal'
import { supabase } from '@/lib/supabase'
import { buildShareUrl } from '@/lib/custom-domain'

// Full-screen management page for every Location Guide the photographer has
// created. Replaces the old "Recent share links" + "Permanent Links" split —
// both kinds of link now live under the same roof, differentiated only by
// expiration policy.

interface GuideRow extends GuideLinkLite {
  expires_at:       string | null
  expire_on_submit: boolean
  pick_count:       number
}

interface ProfileLite {
  id:                     string
  full_name:              string | null
  custom_domain:          string | null
  custom_domain_verified: boolean
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

function expirationSummary(g: GuideRow): { label: string; color: string; bg: string } {
  if (g.expire_on_submit) {
    if (g.pick_count > 0) return { label: '⏱ Used — expired', color: 'var(--ink-soft)', bg: 'var(--cream-dark)' }
    return { label: '🔂 Single-use', color: 'var(--sky)', bg: 'rgba(61,110,140,.1)' }
  }
  if (g.expires_at) {
    const past = new Date(g.expires_at) < new Date()
    if (past) return { label: '⏱ Expired', color: 'var(--ink-soft)', bg: 'var(--cream-dark)' }
    return { label: `Expires ${new Date(g.expires_at).toLocaleDateString()}`, color: 'var(--rust)', bg: 'rgba(181,75,42,.08)' }
  }
  return { label: '♾ Saved for reuse', color: 'var(--sage)', bg: 'rgba(74,103,65,.1)' }
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
  const [preselectIds, setPreselectIds] = useState<string[]>([])

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
      const [profRes, guidesRes, portRes] = await Promise.all([
        supabase.from('profiles').select('id,full_name,custom_domain,custom_domain_verified').eq('id', user.id).single(),
        supabase.from('share_links')
          .select('id,session_name,slug,created_at,portfolio_location_ids,location_ids,is_full_portfolio,expires_at,expire_on_submit')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase.from('portfolio_locations').select('id,name,city,state').eq('user_id', user.id).order('sort_order', { ascending: true }).order('created_at', { ascending: false }),
      ])
      if (profRes.data) setProfile(profRes.data as any)
      if (portRes.data) setPortfolio(portRes.data as any)
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

  function copyLink(slug: string, id: string) {
    const url = buildShareUrl(slug, { customDomain: profile?.custom_domain ?? null, customDomainVerified: profile?.custom_domain_verified ?? false })
    navigator.clipboard?.writeText(url).catch(() => {})
    setCopiedId(id); setToast('📋 Link copied!')
    setTimeout(() => setCopiedId(null), 2000)
  }

  const q = search.trim().toLowerCase()
  const filtered = guides.filter(g => {
    if (!q) return true
    return g.session_name.toLowerCase().includes(q)
  })

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
            <button onClick={() => setShowCreate(true)} style={{ padding: '10px 18px', borderRadius: 6, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ New guide</button>
          </div>
        </div>

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
        ) : guides.length === 0 ? (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid var(--cream-dark)', padding: '3rem 1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>📚</div>
            <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>No guides yet</div>
            <div style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.7, marginBottom: 20, maxWidth: 480, margin: '0 auto 20px' }}>
              Think of a guide as a mini-portfolio for one city or theme. Make a <em>Kansas City</em> guide, an <em>Overland Park</em> guide, a <em>Golden Hour</em> guide — send each client the one that matches their session.
            </div>
            <button onClick={() => setShowCreate(true)} style={{ padding: '12px 24px', borderRadius: 6, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Create your first guide →</button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid var(--cream-dark)', padding: '2.5rem 1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 4 }}>No matches</div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300 }}>No guide name contains &quot;{search}&quot;.</div>
          </div>
        ) : (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid var(--cream-dark)', overflow: 'hidden' }}>
            {filtered.map((g, i) => {
              const url = buildShareUrl(g.slug, { customDomain: profile?.custom_domain ?? null, customDomainVerified: profile?.custom_domain_verified ?? false })
              const expSummary = expirationSummary(g)
              const locCount = (g.portfolio_location_ids?.length ?? 0) + (g.location_ids?.length ?? 0)
              return (
                <div key={g.id} style={{ padding: '1rem 1.25rem', borderBottom: i < filtered.length - 1 ? '1px solid var(--cream-dark)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {g.session_name}
                        {g.is_full_portfolio && <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: 'rgba(74,103,65,.1)', color: 'var(--sage)', border: '1px solid rgba(74,103,65,.2)' }}>🔗 Auto-syncs with portfolio</span>}
                        <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: expSummary.bg, color: expSummary.color }}>{expSummary.label}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300 }}>
                        {locCount} location{locCount !== 1 ? 's' : ''} · {g.pick_count} pick{g.pick_count !== 1 ? 's' : ''} · Created {timeAgo(g.created_at)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--sky)', fontFamily: 'monospace', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url.replace(/^https?:\/\//, '')}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                      <button onClick={() => copyLink(g.slug, g.id)} style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid var(--cream-dark)', background: 'white', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', color: copiedId === g.id ? 'var(--sage)' : 'var(--ink-soft)' }}>{copiedId === g.id ? '✓ Copied' : 'Copy link'}</button>
                      {!g.is_full_portfolio && <button onClick={() => setEditing(g)} style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid var(--cream-dark)', background: 'white', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink-soft)' }}>Edit</button>}
                      <button onClick={() => deleteGuide(g.id)} onBlur={() => setDeleteId(null)} style={{ padding: '6px 12px', borderRadius: 4, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', background: deleteId === g.id ? 'var(--rust)' : 'rgba(181,75,42,.08)', color: deleteId === g.id ? 'white' : 'var(--rust)' }}>{deleteId === g.id ? 'Confirm' : 'Delete'}</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateLocationGuideModal
          portfolio={portfolio}
          preselectAll={false}
          preselectIds={preselectIds}
          userId={profile?.id ?? ''}
          photographerName={profile?.full_name ?? ''}
          onClose={() => { setShowCreate(false); setPreselectIds([]) }}
          onCreated={() => { setShowCreate(false); setPreselectIds([]); load(); setToast('📚 Guide created!') }}
        />
      )}

      {editing && (
        <CreateLocationGuideModal
          portfolio={portfolio}
          preselectAll={false}
          userId={profile?.id ?? ''}
          photographerName={profile?.full_name ?? ''}
          editLink={editing}
          onClose={() => setEditing(null)}
          onCreated={() => { setEditing(null); load(); setToast('✓ Guide updated') }}
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
