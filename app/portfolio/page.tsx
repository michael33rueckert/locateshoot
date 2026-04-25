'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import PortfolioEditModal from '@/components/PortfolioEditModal'
import AddPortfolioLocationModal from '@/components/AddPortfolioLocationModal'
import { thumbUrl } from '@/lib/image'
import { useReorderDrag } from '@/hooks/useReorderDrag'

// Dedicated full-screen portfolio view. Reads the same portfolio_locations rows
// that the Dashboard's portfolio section does, so edits in either place stay in
// sync automatically.

interface PortfolioLocation {
  id: string
  source_location_id: string | null
  name: string
  city: string | null
  state: string | null
  is_secret: boolean
  created_at: string
  photo_count: number
  preview_url: string | null
}

const BG_CYCLE = ['bg-1','bg-2','bg-3','bg-4','bg-5','bg-6']

interface ProfileLite {
  id: string
  full_name: string | null
  custom_domain: string | null
  custom_domain_verified: boolean | null
}

export default function PortfolioPage() {
  const [userId,   setUserId]   = useState<string | null>(null)
  const [profile,  setProfile]  = useState<ProfileLite | null>(null)
  const [locs,     setLocs]     = useState<PortfolioLocation[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [filter,   setFilter]   = useState<'all' | 'with-photos' | 'needs-photos'>('all')
  const [editing,  setEditing]  = useState<string | null>(null)
  const [showAdd,  setShowAdd]  = useState(false)
  const [toast,    setToast]    = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/'; return }
      setUserId(user.id)
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id,full_name,custom_domain,custom_domain_verified')
        .eq('id', user.id)
        .single()
      if (profileData) setProfile(profileData as any)
      const { data: rows } = await supabase
        .from('portfolio_locations')
        .select('id,source_location_id,name,city,state,is_secret,created_at,sort_order')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
      if (!rows || rows.length === 0) { setLocs([]); return }

      const pIds = rows.map((p: any) => p.id)
      const sourceIds = rows.map((p: any) => p.source_location_id).filter(Boolean)

      // One aggregate row per location instead of N photo rows. Scales with
      // portfolio size, not photo count.
      const { data: summary } = await supabase.rpc('portfolio_photo_summary', { pids: pIds })
      const ownCount: Record<string, number> = {}
      const ownUrl:   Record<string, string> = {}
      ;(summary ?? []).forEach((r: any) => {
        if (!r.portfolio_location_id) return
        ownCount[r.portfolio_location_id] = Number(r.cnt ?? 0)
        if (r.first_url) ownUrl[r.portfolio_location_id] = r.first_url
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

      setLocs(rows.map((p: any) => ({
        ...p,
        photo_count: ownCount[p.id] ?? 0,
        preview_url: ownUrl[p.id] ?? (p.source_location_id ? sourceUrl[p.source_location_id] ?? null : null),
      })))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const filtered = locs.filter(l => {
    const q = search.trim().toLowerCase()
    const matchesSearch = !q || l.name.toLowerCase().includes(q) || (l.city?.toLowerCase().includes(q) ?? false)
    const matchesFilter =
      filter === 'all' ? true
      : filter === 'with-photos' ? l.photo_count > 0
      : l.photo_count === 0
    return matchesSearch && matchesFilter
  })

  const needsPhotosCount = locs.filter(l => l.photo_count === 0).length

  // Reorder portfolio locations. Writes sort_order on every row so the order
  // is stable. Driven by the useReorderDrag hook below — works on mouse,
  // pen, and touch via Pointer Events (HTML5 drag-and-drop was touch-hostile,
  // which is why the old implementation needed ‹ › arrow fallbacks).
  async function reorderPortfolio(fromId: string, toId: string) {
    if (fromId === toId) return
    const fromIdx = locs.findIndex(l => l.id === fromId)
    const toIdx   = locs.findIndex(l => l.id === toId)
    if (fromIdx < 0 || toIdx < 0) return
    const next = [...locs]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    const prev = locs
    setLocs(next)
    const results = await Promise.all(next.map((l, idx) =>
      supabase.from('portfolio_locations').update({ sort_order: idx }).eq('id', l.id)
    ))
    const err = results.find(r => r.error)?.error
    if (err) {
      setLocs(prev)
      setToast(`⚠ Could not save order: ${err.message}`)
      console.error('reorderPortfolio failed', err)
    }
  }

  const reorder = useReorderDrag(reorderPortfolio)

  return (
    <div style={{ minHeight: '100svh', background: 'var(--cream)' }}>
      <AppNav />

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 'clamp(26px,5vw,38px)', fontWeight: 900, color: 'var(--ink)', marginBottom: 6 }}>
              My Portfolio
            </h1>
            <p style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300, maxWidth: 560, lineHeight: 1.6 }}>
              Your curated locations. These are what clients see on every share link you send — keep each one loaded up with your best photos and notes.
            </p>
          </div>
          <div className="portfolio-header-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
            <button onClick={() => setShowAdd(true)} style={{ padding: '10px 18px', borderRadius: 6, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Add new location</button>
            <Link href="/explore" style={{ padding: '10px 18px', borderRadius: 6, background: 'white', color: 'var(--ink)', border: '1px solid var(--cream-dark)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none' }}>+ Add from Explore</Link>
            <Link href="/location-guides" style={{ padding: '10px 18px', borderRadius: 6, background: 'var(--ink)', color: 'var(--cream)', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none' }}>📚 Location Guides</Link>
          </div>
        </div>

        <style>{`
          /* When the header wraps to a second row on narrow screens, the action
             cluster would otherwise sit right-aligned because of the outer
             space-between. Stretch it to full width + left-align the buttons. */
          @media (max-width: 760px) {
            .portfolio-header-actions {
              width: 100%;
              justify-content: flex-start;
            }
          }
        `}</style>

        {/* Summary row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginBottom: '1.5rem' }}>
          {[
            { label: 'Total locations', value: locs.length, sub: 'in your portfolio' },
            { label: 'With your photos', value: locs.length - needsPhotosCount, sub: 'ready to share' },
            { label: 'Need photos', value: needsPhotosCount, sub: needsPhotosCount > 0 ? 'upload yours to replace Google' : 'all set' },
          ].map(s => (
            <div key={s.label} style={{ background: 'white', borderRadius: 10, padding: '12px 16px', border: '1px solid var(--cream-dark)' }}>
              <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-soft)', marginBottom: 5 }}>{s.label}</div>
              <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 26, fontWeight: 700, color: 'var(--ink)', lineHeight: 1, marginBottom: 3 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: needsPhotosCount > 0 && s.label === 'Need photos' ? 'var(--rust)' : 'var(--sage)' }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Search + filter */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or city…"
            style={{ flex: 1, minWidth: 220, padding: '9px 14px', borderRadius: 6, border: '1px solid var(--cream-dark)', background: 'white', fontSize: 13, fontFamily: 'inherit', color: 'var(--ink)', outline: 'none' }}
          />
          {(['all', 'with-photos', 'needs-photos'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: '7px 14px', borderRadius: 999, fontSize: 12, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', border: `1px solid ${filter === f ? 'var(--gold)' : 'var(--cream-dark)'}`, background: filter === f ? 'rgba(196,146,42,.08)' : 'white', color: filter === f ? 'var(--gold)' : 'var(--ink-soft)' }}>
              {f === 'all' ? `All (${locs.length})` : f === 'with-photos' ? 'With photos' : `Needs photos${needsPhotosCount > 0 ? ` (${needsPhotosCount})` : ''}`}
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
            <div style={{ width: 28, height: 28, border: '2px solid var(--cream-dark)', borderTop: '2px solid var(--gold)', borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300 }}>Loading your portfolio…</div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : locs.length === 0 ? (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid var(--cream-dark)', padding: '3rem 1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>📍</div>
            <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Your portfolio is empty</div>
            <div style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.7, marginBottom: 20, maxWidth: 440, margin: '0 auto 20px' }}>
              Browse the Explore map and add locations you want to offer clients, or create your own with the button above.
            </div>
            <Link href="/explore" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 6, background: 'var(--gold)', color: 'var(--ink)', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>Browse the map →</Link>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid var(--cream-dark)', padding: '2.5rem 1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 4 }}>No matches</div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300 }}>Try a different search or clear the filter.</div>
          </div>
        ) : (
          <>
            {filter === 'all' && !search.trim() && locs.length > 1 && (
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 8, fontStyle: 'italic' }}>
                Press and hold any card, then drag to reorder. The order here is how clients see your portfolio.
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 14 }}>
              {filtered.map((loc, idx) => {
                const cityLine = loc.city && loc.state ? `${loc.city}, ${loc.state}` : (loc.city ?? loc.state ?? '')
                const noPhotos = loc.photo_count === 0
                const isDragging = reorder.draggingId === loc.id
                // Only allow reorder drag when the user isn't filtering/searching,
                // otherwise the drop indexes would be misleading.
                const canReorder = filter === 'all' && !search.trim() && locs.length > 1
                const bind = canReorder ? reorder.bindItem(loc.id) : {}
                const isOver = reorder.overId === loc.id && reorder.draggingId && reorder.draggingId !== loc.id
                return (
                  <div key={loc.id} onClick={() => setEditing(loc.id)}
                    {...bind}
                    style={{
                      borderRadius: 10, overflow: 'hidden',
                      border: `1px solid ${isOver ? 'var(--gold)' : 'var(--cream-dark)'}`,
                      background: 'white',
                      cursor: canReorder ? 'grab' : 'pointer',
                      transition: 'all .15s',
                      opacity: isDragging ? 0.4 : 1,
                      position: 'relative',
                      // pan-y pre-drag lets the user scroll the page by
                      // dragging a card up/down; the hook flips this to
                      // 'none' the instant long-press commits.
                      touchAction: canReorder ? 'pan-y' : 'auto',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      WebkitTouchCallout: 'none',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(26,22,18,.08)' }}
                    onMouseLeave={e => { if (!reorder.draggingId) { e.currentTarget.style.borderColor = 'var(--cream-dark)'; e.currentTarget.style.boxShadow = 'none' } }}>
                    <div className={BG_CYCLE[idx % BG_CYCLE.length]} style={{ aspectRatio: '4 / 3', position: 'relative', overflow: 'hidden' }}>
                      {loc.preview_url && <img src={thumbUrl(loc.preview_url) ?? loc.preview_url} alt="" loading="lazy" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                      {noPhotos && (
                        <div style={{ position: 'absolute', top: 8, right: 8, padding: '3px 10px', borderRadius: 999, background: 'rgba(196,146,42,.95)', color: 'white', fontSize: 10, fontWeight: 600 }}>
                          ⚠ Add your photos
                        </div>
                      )}
                      {loc.is_secret && <div style={{ position: 'absolute', top: 8, left: 8, padding: '3px 10px', borderRadius: 999, background: 'rgba(124,92,191,.9)', color: 'white', fontSize: 10, fontWeight: 600 }}>🤫 Secret</div>}
                    </div>
                    <div style={{ padding: '12px 14px' }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 6 }}>📍 {cityLine || '—'}</div>
                      <div style={{ fontSize: 11, color: noPhotos ? 'var(--gold)' : 'var(--ink-soft)', fontWeight: noPhotos ? 600 : 300 }}>
                        {noPhotos ? '→ Tap to upload your photos' : 'Tap to edit →'}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {editing && userId && (
        <PortfolioEditModal
          portfolioId={editing}
          userId={userId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); setToast('✓ Saved') }}
          onDeleted={() => { setEditing(null); load(); setToast('Location removed from portfolio') }}
        />
      )}
      {showAdd && userId && (
        <AddPortfolioLocationModal
          userId={userId}
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); load(); setToast('✓ Added to your portfolio') }}
        />
      )}
      {toast && (
        <div style={{ position: 'fixed', bottom: '5rem', right: '1.25rem', background: 'var(--ink)', color: 'var(--cream)', padding: '10px 18px', borderRadius: 10, fontSize: 13, border: '1px solid rgba(255,255,255,.1)', zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,.3)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
