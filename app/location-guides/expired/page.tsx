'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AppNav from '@/components/AppNav'
import { supabase } from '@/lib/supabase'
import { buildShareUrl } from '@/lib/custom-domain'
import { thumbUrl } from '@/lib/image'

// Archive-style page for expired Location Guides. Reached via a link
// on /location-guides + the dashboard's Location Guides section; NOT
// in the site menu (it's a low-frequency management surface, we don't
// want it competing for attention with the main app pages).
//
// A guide counts as "expired" here when EITHER:
//   - expires_at is set and in the past, OR
//   - expire_on_submit is true AND at least one client_pick exists
//     for that share_link (the one-shot link was burned by a client
//     submitting).
//
// Per-row actions:
//   - 🔄 Reactivate — null out whichever expiration flag applied so
//     the same URL loads for clients again.
//   - 📋 Duplicate — create a fresh share_link with the same
//     locations + message + name (suffixed " (copy)") on a new
//     never-expires slug. Original stays expired. Useful when the
//     photographer wants a NEW link to send to a NEW client with the
//     same setup, without changing the state of the old one.
//   - Delete — same destructive action from the main guides list.

interface ExpiredGuideRow {
  id:                       string
  session_name:             string
  slug:                     string
  created_at:               string
  portfolio_location_ids:   string[] | null
  location_ids:             string[] | null
  is_full_portfolio:        boolean
  expires_at:               string | null
  expire_on_submit:         boolean
  cover_photo_url:          string | null
  quick_share:              boolean
  pick_count:               number
  // Reason label — pre-computed so the render pass just uses it.
  reason:                   'time' | 'used'
}

interface ProfileLite {
  id:                       string
  full_name:                string | null
  custom_domain:            string | null
  custom_domain_verified:   boolean
}

const BG_CYCLE = ['bg-1','bg-2','bg-3','bg-4','bg-5','bg-6']

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins} min ago`
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`
  return `${days} day${days !== 1 ? 's' : ''} ago`
}

export default function ExpiredGuidesPage() {
  const router = useRouter()
  const [profile,  setProfile]  = useState<ProfileLite | null>(null)
  const [guides,   setGuides]   = useState<ExpiredGuideRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [busyId,   setBusyId]   = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [toast,    setToast]    = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/'); return }

      const [profRes, guidesRes] = await Promise.all([
        supabase.from('profiles').select('id,full_name,custom_domain,custom_domain_verified').eq('id', user.id).single(),
        // Filter to non-quick-share since those are single-location
        // shares that don't have expiration semantics. Stepwise
        // fallback for pre-migration Supabase instances (see
        // 20260505_quick_share_links).
        (async () => {
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
        })(),
      ])
      if (profRes.data) setProfile(profRes.data as any)

      const rows = (guidesRes.data ?? []) as any[]
      // Pull pick counts for expire_on_submit guides so we know
      // which ones have been burned by a client submission.
      const shareIds = rows.map(r => r.id)
      const pickMap = new Map<string, number>()
      if (shareIds.length > 0) {
        const { data: picks } = await supabase
          .from('client_picks')
          .select('share_link_id')
          .in('share_link_id', shareIds)
        ;(picks ?? []).forEach((p: any) => {
          if (!p.share_link_id) return
          pickMap.set(p.share_link_id, (pickMap.get(p.share_link_id) ?? 0) + 1)
        })
      }

      const now = Date.now()
      const expired: ExpiredGuideRow[] = []
      for (const r of rows) {
        const pickCount = pickMap.get(r.id) ?? 0
        const timeExpired = !!r.expires_at && new Date(r.expires_at).getTime() < now
        const usedUp     = !!r.expire_on_submit && pickCount > 0
        if (!timeExpired && !usedUp) continue
        expired.push({
          id:                     r.id,
          session_name:           r.session_name,
          slug:                   r.slug,
          created_at:             r.created_at,
          portfolio_location_ids: r.portfolio_location_ids ?? null,
          location_ids:           r.location_ids ?? null,
          is_full_portfolio:      !!r.is_full_portfolio,
          expires_at:             r.expires_at ?? null,
          expire_on_submit:       !!r.expire_on_submit,
          cover_photo_url:        r.cover_photo_url ?? null,
          quick_share:            !!r.quick_share,
          pick_count:             pickCount,
          reason:                 timeExpired ? 'time' : 'used',
        })
      }
      setGuides(expired)
    } finally { setLoading(false) }
  }, [router])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  async function reactivate(g: ExpiredGuideRow) {
    setBusyId(g.id)
    // Clear BOTH expiration flags so the reactivated URL doesn't get
    // stuck expired for the other reason immediately after. Cheaper
    // than branching on which flag applied.
    const { error } = await supabase.from('share_links')
      .update({ expires_at: null, expire_on_submit: false, is_permanent: true })
      .eq('id', g.id)
    setBusyId(null)
    if (error) { setToast(`⚠ ${error.message}`); return }
    setToast('✓ Guide reactivated — the same URL now works again')
    load()
  }

  async function duplicate(g: ExpiredGuideRow) {
    if (!profile) { setToast('⚠ Profile not loaded'); return }
    setBusyId(g.id)
    // Reuse the same slug prefix pattern the create-modal uses so
    // the new URL feels consistent with the original.
    const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 25)
    const nameBase = (g.session_name || 'guide').trim()
    const newName  = nameBase.endsWith(' (copy)') ? nameBase : `${nameBase} (copy)`
    const newSlug  = `${clean(profile.full_name || 'photographer')}-${clean(nameBase)}-${Date.now().toString(36)}`
    const { data: inserted, error } = await supabase.from('share_links').insert({
      user_id:                profile.id,
      slug:                   newSlug,
      session_name:           newName,
      photographer_name:      profile.full_name ?? null,
      portfolio_location_ids: g.portfolio_location_ids,
      location_ids:           g.location_ids ?? [],
      secret_ids:             [],
      expires_at:             null,
      is_permanent:           true,
      is_full_portfolio:      g.is_full_portfolio,
      expire_on_submit:       false,
      cover_photo_url:        g.cover_photo_url,
      max_picks:              1,
    }).select('id,slug').single()
    setBusyId(null)
    if (error || !inserted) { setToast(`⚠ ${error?.message ?? 'Could not duplicate'}`); return }
    const url = buildShareUrl(inserted.slug, {
      customDomain: profile.custom_domain,
      customDomainVerified: !!profile.custom_domain_verified,
    })
    try { await navigator.clipboard?.writeText(url) } catch { /* clipboard may be blocked */ }
    setToast('📋 New guide created — URL copied to clipboard')
  }

  async function remove(g: ExpiredGuideRow) {
    if (deleteId !== g.id) { setDeleteId(g.id); return }
    setBusyId(g.id)
    const { error } = await supabase.from('share_links').delete().eq('id', g.id)
    setBusyId(null); setDeleteId(null)
    if (error) { setToast(`⚠ ${error.message}`); return }
    setGuides(prev => prev.filter(x => x.id !== g.id))
    setToast('Guide deleted')
  }

  return (
    <div style={{ minHeight: '100svh', background: 'var(--cream)' }}>
      <AppNav />

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>
        <Link href="/location-guides" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-soft)', textDecoration: 'none', marginBottom: '1rem' }}>
          ← Back to Location Guides
        </Link>
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 'clamp(26px,5vw,38px)', fontWeight: 900, color: 'var(--ink)', marginBottom: 6 }}>
            ⏱ Expired Location Guides
          </h1>
          <p style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300, maxWidth: 640, lineHeight: 1.6 }}>
            Guides that hit their expiration date or were single-use links that a client already submitted. Reactivate to make the same URL work again, duplicate to send a fresh URL to a new client with the same setup, or delete to clean up.
          </p>
        </div>

        {loading ? (
          <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
            <div style={{ width: 28, height: 28, border: '2px solid var(--cream-dark)', borderTop: '2px solid var(--gold)', borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300 }}>Loading expired guides…</div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : guides.length === 0 ? (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid var(--cream-dark)', padding: '3rem 1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>📭</div>
            <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Nothing expired yet</div>
            <div style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.7, maxWidth: 440, margin: '0 auto' }}>
              Guides land here when their expiration date passes or a single-use link is used. You&apos;ll come back to reactivate or duplicate them for new clients.
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14 }}>
            {guides.map((g, i) => {
              const thumb = thumbUrl(g.cover_photo_url) ?? g.cover_photo_url
              const reasonLabel = g.reason === 'time'
                ? `Expired ${g.expires_at ? new Date(g.expires_at).toLocaleDateString() : ''}`
                : `Used — ${g.pick_count} client pick${g.pick_count === 1 ? '' : 's'}`
              const isBusy = busyId === g.id
              return (
                <div key={g.id} style={{ background: 'white', borderRadius: 10, border: '1px solid var(--cream-dark)', overflow: 'hidden', display: 'flex', flexDirection: 'column', opacity: 0.9, filter: 'saturate(.75)' }}>
                  <div className={thumb ? undefined : BG_CYCLE[i % BG_CYCLE.length]} style={{ aspectRatio: '4 / 3', position: 'relative', background: thumb ? 'var(--cream-dark)' : undefined }}>
                    {thumb && <img src={thumb} alt="" loading="lazy" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                    <span style={{ position: 'absolute', top: 8, left: 8, padding: '3px 10px', borderRadius: 999, fontSize: 10, fontWeight: 600, background: 'rgba(26,22,18,.75)', color: 'white', whiteSpace: 'nowrap' }}>
                      ⏱ {reasonLabel}
                    </span>
                  </div>
                  <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 16, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.25, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.session_name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300 }}>
                        Created {timeAgo(g.created_at)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
                      <button
                        onClick={() => reactivate(g)}
                        disabled={isBusy}
                        title="Turn expiration off so the same URL works again"
                        style={{ flex: 1, minWidth: 110, padding: '8px 12px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 12, fontWeight: 600, cursor: isBusy ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: isBusy ? 0.6 : 1 }}
                      >
                        🔄 Reactivate
                      </button>
                      <button
                        onClick={() => duplicate(g)}
                        disabled={isBusy}
                        title="Create a new guide with the same locations + message on a new URL"
                        style={{ padding: '8px 12px', borderRadius: 4, background: 'white', color: 'var(--ink)', border: '1px solid var(--cream-dark)', fontSize: 12, fontWeight: 500, cursor: isBusy ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: isBusy ? 0.6 : 1 }}
                      >
                        📋 Duplicate
                      </button>
                      <button
                        onClick={() => remove(g)}
                        onBlur={() => setDeleteId(curr => curr === g.id ? null : curr)}
                        disabled={isBusy}
                        style={{ padding: '8px 12px', borderRadius: 4, border: 'none', background: deleteId === g.id ? 'var(--rust)' : 'rgba(181,75,42,.08)', color: deleteId === g.id ? 'white' : 'var(--rust)', fontSize: 12, fontWeight: 500, cursor: isBusy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: isBusy ? 0.6 : 1 }}
                      >
                        {deleteId === g.id ? 'Confirm' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', background: 'var(--ink)', color: 'var(--cream)', padding: '10px 18px', borderRadius: 10, fontSize: 13, border: '1px solid rgba(255,255,255,.1)', zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,.3)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
