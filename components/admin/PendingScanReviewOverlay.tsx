'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { usePlacePhotos } from '@/hooks/usePlacePhotos'

// Tinder-style review UI for AI-scanner candidates sitting in
// status='pending'. Fullscreen overlay opened from the admin page —
// one card at a time, swipe left to delete the row outright, swipe
// right to flip it to status='published' so it goes live on Explore.
// Buttons at the bottom mirror the gestures for desktop / mouse use.
//
// Photos are pulled live from Google Places (same hook the Explore
// DetailPanel uses) so the admin sees what clients will see on the
// map before deciding — no need to first upload local photos.

interface PendingLoc {
  id:            string
  name:          string
  city:          string | null
  state:         string | null
  latitude:      number | null
  longitude:     number | null
  description:   string | null
  category:      string | null
  quality_score: number | null
  rating:        number | null
  tags:          string[] | null
  best_time:     string | null
  parking_info:  string | null
  created_at:    string
}

const DECISION_THRESHOLD = 110  // px of horizontal drag to trigger a decision

export default function PendingScanReviewOverlay({ onClose }: { onClose: () => void }) {
  const [queue,    setQueue]    = useState<PendingLoc[]>([])
  const [loading,  setLoading]  = useState(true)
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [total,    setTotal]    = useState(0)
  const [done,     setDone]     = useState(0)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    // Fetch through the service-role admin endpoint so RLS on
    // `locations` (written for published rows) can't hide pending
    // scanner picks from the queue.
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setError('Not signed in'); setLoading(false); return }
    const res = await fetch('/api/admin/pending-scans', { headers: { Authorization: `Bearer ${token}` } })
    setLoading(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j?.error ?? `HTTP ${res.status}`)
      return
    }
    const json = await res.json()
    const rows = (json?.rows ?? []) as PendingLoc[]
    setQueue(rows)
    setTotal(rows.length)
    setDone(0)
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (busy || queue.length === 0) return
      if (e.key === 'ArrowRight') decide('keep')
      if (e.key === 'ArrowLeft')  decide('reject')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, busy])

  const current = queue[0] ?? null

  async function decide(kind: 'keep' | 'reject') {
    if (!current || busy) return
    setBusy(true); setError(null)
    const id = current.id
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setError('Not signed in'); setBusy(false); return }
    try {
      if (kind === 'keep') {
        const res = await fetch(`/api/admin/locations/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: 'published' }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? 'publish failed')
      } else {
        const res = await fetch(`/api/admin/locations/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? 'delete failed')
      }
      setQueue(prev => prev.slice(1))
      setDone(d => d + 1)
    } catch (err: any) {
      setError(err?.message ?? 'action failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,8,6,.85)', zIndex: 8000 }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 8001, display: 'flex', flexDirection: 'column', pointerEvents: 'none' }}>

        {/* Header */}
        <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, pointerEvents: 'auto' }}>
          <div style={{ color: 'var(--cream)', fontSize: 13 }}>
            <div style={{ fontWeight: 600 }}>🤖 Review scanner picks</div>
            <div style={{ fontSize: 11, color: 'rgba(245,240,232,.55)', marginTop: 2 }}>
              {loading ? 'Loading…' : total === 0 ? 'Nothing pending — cron will drop new ones here.' : `${done} / ${total} · ${queue.length} left`}
            </div>
          </div>
          <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 20, background: 'rgba(255,255,255,.1)', color: 'var(--cream)', border: '1px solid rgba(255,255,255,.15)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>✕ Close</button>
        </div>

        {/* Card area */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px 12px', minHeight: 0 }}>
          {loading ? null
            : total === 0 ? (
              <div style={{ pointerEvents: 'auto', textAlign: 'center', color: 'var(--cream)' }}>
                <div style={{ fontSize: 44, marginBottom: 10 }}>✨</div>
                <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Inbox zero.</div>
                <div style={{ fontSize: 13, color: 'rgba(245,240,232,.55)' }}>The daily scan will drop the next batch here at 12:00 UTC.</div>
              </div>
            )
            : queue.length === 0 ? (
              <div style={{ pointerEvents: 'auto', textAlign: 'center', color: 'var(--cream)' }}>
                <div style={{ fontSize: 44, marginBottom: 10 }}>🎉</div>
                <div style={{ fontSize: 17, fontWeight: 600 }}>All caught up.</div>
                <div style={{ fontSize: 13, color: 'rgba(245,240,232,.55)', marginTop: 4 }}>Reviewed {done} candidate{done === 1 ? '' : 's'}.</div>
                <button onClick={onClose} style={{ marginTop: 18, padding: '10px 22px', borderRadius: 6, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
              </div>
            )
            : current ? <ReviewCard key={current.id} loc={current} busy={busy} onDecide={decide} /> : null}
        </div>

        {/* Buttons */}
        {current && (
          <div style={{ padding: '0 16px calc(env(safe-area-inset-bottom, 0) + 20px)', display: 'flex', gap: 14, justifyContent: 'center', pointerEvents: 'auto' }}>
            <button
              onClick={() => decide('reject')}
              disabled={busy}
              style={{ width: 68, height: 68, borderRadius: 34, background: 'white', color: 'var(--rust)', border: '2px solid rgba(255,255,255,.4)', fontSize: 28, fontWeight: 700, cursor: busy ? 'default' : 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,.35)', fontFamily: 'inherit', opacity: busy ? .5 : 1 }}
              title="Delete (←)"
            >✕</button>
            <button
              onClick={() => decide('keep')}
              disabled={busy}
              style={{ width: 68, height: 68, borderRadius: 34, background: 'white', color: 'var(--sage)', border: '2px solid rgba(255,255,255,.4)', fontSize: 28, fontWeight: 700, cursor: busy ? 'default' : 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,.35)', fontFamily: 'inherit', opacity: busy ? .5 : 1 }}
              title="Keep — publish to map (→)"
            >✓</button>
          </div>
        )}

        {error && (
          <div style={{ position: 'absolute', bottom: 110, left: '50%', transform: 'translateX(-50%)', padding: '10px 16px', background: 'rgba(181,75,42,.9)', color: 'white', borderRadius: 8, fontSize: 12, pointerEvents: 'auto' }}>{error}</div>
        )}
      </div>
    </>
  )
}

// ── Card ─────────────────────────────────────────────────────────────────────

function ReviewCard({ loc, busy, onDecide }: { loc: PendingLoc; busy: boolean; onDecide: (kind: 'keep' | 'reject') => void }) {
  const { photos, loading: photosLoading } = usePlacePhotos(loc.name, loc.city ?? '', loc.latitude ?? 0, loc.longitude ?? 0)
  const [activePhoto, setActivePhoto] = useState(0)

  // Drag state — track finger, translate the card, colored badge fades
  // in as the drag crosses the decision threshold. Vertical drags fall
  // through so the description can scroll on tall content.
  const cardRef = useRef<HTMLDivElement>(null)
  const startX  = useRef(0)
  const startY  = useRef(0)
  const dragging = useRef(false)
  const isVertical = useRef(false)
  const [drag, setDrag] = useState(0)

  function onTouchStart(e: React.TouchEvent) {
    if (busy) return
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    dragging.current = false
    isVertical.current = false
    setDrag(0)
    if (cardRef.current) cardRef.current.style.transition = 'none'
  }
  function onTouchMove(e: React.TouchEvent) {
    if (busy) return
    const dx = e.touches[0].clientX - startX.current
    const dy = e.touches[0].clientY - startY.current
    if (!dragging.current && !isVertical.current) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        if (Math.abs(dx) > Math.abs(dy)) dragging.current = true
        else isVertical.current = true
      }
    }
    if (!dragging.current) return
    setDrag(dx)
    if (cardRef.current) {
      const rotate = dx / 20   // subtle tilt as it drifts
      cardRef.current.style.transform = `translate3d(${dx}px, 0, 0) rotate(${rotate}deg)`
    }
  }
  function onTouchEnd() {
    if (busy || !dragging.current) { setDrag(0); return }
    const dx = drag
    if (Math.abs(dx) > DECISION_THRESHOLD) {
      // Fling off-screen, then commit.
      if (cardRef.current) {
        cardRef.current.style.transition = 'transform 0.24s ease-out'
        const off = dx > 0 ? window.innerWidth : -window.innerWidth
        cardRef.current.style.transform = `translate3d(${off}px, 40px, 0) rotate(${dx > 0 ? 30 : -30}deg)`
      }
      setTimeout(() => onDecide(dx > 0 ? 'keep' : 'reject'), 220)
    } else {
      // Snap back.
      if (cardRef.current) {
        cardRef.current.style.transition = 'transform 0.2s ease-out'
        cardRef.current.style.transform = 'translate3d(0,0,0) rotate(0deg)'
      }
      setDrag(0)
    }
    dragging.current = false
  }

  const keepOpacity   = Math.max(0, Math.min(1, drag  / DECISION_THRESHOLD))
  const rejectOpacity = Math.max(0, Math.min(1, -drag / DECISION_THRESHOLD))
  const hasPhoto = photos.length > 0

  return (
    <div
      ref={cardRef}
      style={{
        pointerEvents: 'auto',
        width: '100%', maxWidth: 460,
        background: 'white', borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,.5)',
        touchAction: 'pan-y',
        maxHeight: 'calc(100vh - 220px)',
        display: 'flex', flexDirection: 'column',
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Photo */}
      <div style={{ position: 'relative', background: '#1a1612', aspectRatio: '4 / 3', flexShrink: 0 }}>
        {photosLoading ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 26, height: 26, border: '2px solid rgba(255,255,255,.2)', borderTop: '2px solid rgba(255,255,255,.7)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
          </div>
        ) : hasPhoto ? (
          <img src={photos[activePhoto]?.url} alt={loc.name} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.45)', fontSize: 13 }}>No Google photo — verify in a browser</div>
        )}
        {/* Decision badges — fade in as the drag crosses the threshold */}
        <div style={{ position: 'absolute', top: 18, right: 18, padding: '8px 16px', borderRadius: 6, border: '3px solid var(--sage)', color: 'var(--sage)', background: 'rgba(255,255,255,.95)', fontSize: 22, fontWeight: 800, letterSpacing: '.1em', transform: 'rotate(8deg)', opacity: keepOpacity, transition: 'none', pointerEvents: 'none' }}>KEEP</div>
        <div style={{ position: 'absolute', top: 18, left: 18, padding: '8px 16px', borderRadius: 6, border: '3px solid var(--rust)', color: 'var(--rust)', background: 'rgba(255,255,255,.95)', fontSize: 22, fontWeight: 800, letterSpacing: '.1em', transform: 'rotate(-8deg)', opacity: rejectOpacity, transition: 'none', pointerEvents: 'none' }}>DELETE</div>
        {hasPhoto && photos.length > 1 && (
          <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,.6)', color: 'white', fontSize: 10, padding: '3px 8px', borderRadius: 20 }}>
            <button onClick={() => setActivePhoto(i => Math.max(0, i - 1))} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '0 4px', fontSize: 12 }}>‹</button>
            {activePhoto + 1}/{photos.length}
            <button onClick={() => setActivePhoto(i => Math.min(photos.length - 1, i + 1))} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '0 4px', fontSize: 12 }}>›</button>
          </div>
        )}
      </div>

      {/* Details — scrolls when the description is long */}
      <div style={{ padding: '14px 18px 16px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
        <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 20, fontWeight: 800, color: 'var(--ink)', marginBottom: 2 }}>{loc.name}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8 }}>
          📍 {[loc.city, loc.state].filter(Boolean).join(', ') || '—'}
          {loc.category && <> · {loc.category}</>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {typeof loc.quality_score === 'number' && (
            <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, background: 'var(--cream)', color: 'var(--ink-soft)', border: '1px solid var(--cream-dark)' }}>Q {loc.quality_score}</span>
          )}
          {typeof loc.rating === 'number' && loc.rating > 0 && (
            <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, background: 'var(--cream)', color: 'var(--ink-soft)', border: '1px solid var(--cream-dark)' }}>★ {loc.rating.toFixed(1)}</span>
          )}
          {loc.latitude != null && loc.longitude != null && (
            <a href={`https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}`} target="_blank" rel="noopener noreferrer" style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, background: 'var(--cream)', color: 'var(--sky)', border: '1px solid var(--cream-dark)', textDecoration: 'none' }}>
              📍 verify on Maps
            </a>
          )}
        </div>
        {loc.description && <p style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.55, marginBottom: 10 }}>{loc.description}</p>}
        {loc.best_time && <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}><strong style={{ color: 'var(--ink)' }}>Best time:</strong> {loc.best_time}</div>}
        {loc.parking_info && <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}><strong style={{ color: 'var(--ink)' }}>Parking:</strong> {loc.parking_info}</div>}
        {(loc.tags ?? []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {(loc.tags ?? []).map(t => (
              <span key={t} style={{ padding: '2px 6px', borderRadius: 3, fontSize: 10, background: 'var(--cream)', color: 'var(--ink-soft)' }}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
