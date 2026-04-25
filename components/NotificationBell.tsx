'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  pushSupported,
  pushPermission,
  subscribeToPush,
  unsubscribeFromPush,
  isCurrentlySubscribed,
} from '@/lib/push'

// In-app notification bell. Counts client_picks created after the signed-in
// photographer's last "seen" timestamp (stored in profiles.preferences as
// last_picks_seen_at). Polls every 45s so missed picks show up without needing
// Realtime or a full push pipeline.
//
// Click → navigates to /dashboard and marks everything read.

interface PickPreview {
  id: string
  client_email: string | null
  location_name: string | null
  created_at: string
}

export default function NotificationBell() {
  const router = useRouter()
  const [userId,  setUserId]  = useState<string | null>(null)
  const [lastSeen, setLastSeen] = useState<string | null>(null)
  const [unread,  setUnread]  = useState<PickPreview[]>([])
  // Dropdown renders a snapshot taken at open time so it persists even
  // after `unread` refetches with the new last-seen filter and goes
  // empty — which is what was making the list vanish immediately on tap.
  const [snapshot, setSnapshot] = useState<PickPreview[]>([])
  const [open,    setOpen]    = useState(false)
  const [pushStatus, setPushStatus] = useState<'unknown' | 'unsupported' | 'subscribed' | 'unsubscribed' | 'blocked'>('unknown')
  const [pushBusy, setPushBusy]     = useState(false)
  const [pushError, setPushError]   = useState<string | null>(null)
  const timerRef = useRef<any>(null)

  // Refresh the push status whenever the dropdown opens so the button
  // reflects whatever state the browser is actually in (e.g. user
  // changed permission from site settings).
  const refreshPushStatus = useCallback(async () => {
    if (!pushSupported()) { setPushStatus('unsupported'); return }
    const perm = pushPermission()
    if (perm === 'denied') { setPushStatus('blocked'); return }
    const subscribed = await isCurrentlySubscribed()
    setPushStatus(subscribed ? 'subscribed' : 'unsubscribed')
  }, [])
  useEffect(() => { if (open) refreshPushStatus() }, [open, refreshPushStatus])
  useEffect(() => { refreshPushStatus() }, [refreshPushStatus])

  async function togglePush() {
    setPushBusy(true); setPushError(null)
    try {
      if (pushStatus === 'subscribed') {
        const r = await unsubscribeFromPush()
        if (!r.ok) setPushError(r.error)
      } else {
        const r = await subscribeToPush()
        if (!r.ok) setPushError(r.error)
      }
      await refreshPushStatus()
    } finally { setPushBusy(false) }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled || !user) return
      const { data: profile } = await supabase.from('profiles').select('preferences').eq('id', user.id).single()
      if (cancelled) return
      setUserId(user.id)
      setLastSeen(profile?.preferences?.last_picks_seen_at ?? null)
    })()
    return () => { cancelled = true }
  }, [])

  const refresh = useCallback(async () => {
    if (!userId) return
    // First fetch the share-link ids this photographer owns. Then count picks
    // on those links created after lastSeen. (No join with IN() on Supabase JS.)
    const { data: links } = await supabase.from('share_links').select('id').eq('user_id', userId)
    const ids = (links ?? []).map(l => l.id)
    if (ids.length === 0) { setUnread([]); return }
    let q = supabase
      .from('client_picks')
      .select('id,client_email,location_name,created_at,share_link_id')
      .in('share_link_id', ids)
      .order('created_at', { ascending: false })
      .limit(20)
    if (lastSeen) q = q.gt('created_at', lastSeen)
    const { data } = await q
    setUnread((data ?? []) as any)
  }, [userId, lastSeen])

  useEffect(() => {
    if (!userId) return
    refresh()
    timerRef.current = setInterval(refresh, 45000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [userId, refresh])

  async function openAndMarkSeen() {
    // Snapshot the list up front — the server update below changes
    // `lastSeen`, which refetches and clears `unread`, so the dropdown
    // needs its own copy that doesn't disappear on the user.
    setSnapshot(unread)
    setOpen(true)
    if (!userId || unread.length === 0) return
    const now = new Date().toISOString()
    // Read current preferences and merge — don't clobber other keys.
    const { data: profile } = await supabase.from('profiles').select('preferences').eq('id', userId).single()
    const prefs = { ...(profile?.preferences ?? {}), last_picks_seen_at: now }
    await supabase.from('profiles').update({ preferences: prefs }).eq('id', userId)
    setLastSeen(now)
  }

  function closeDropdown() {
    setOpen(false)
    // Let the user reopen a fresh empty dropdown on their next tap. (If
    // a new pick arrives in the meantime, it'll show up via the poll.)
    setSnapshot([])
  }

  // Click-outside-to-close. The bell lives inside AppNav's sticky stacking
  // context (z-index 200), which clamps any nested overlay's z-index — a
  // fixed-position backdrop *inside* the bell renders below the actual page
  // content, so its onClick never fires for taps outside the nav. Instead
  // we listen at document level and check if the click landed outside the
  // bell+dropdown subtree.
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: PointerEvent) {
      const root = containerRef.current
      if (!root) return
      if (!root.contains(e.target as Node)) closeDropdown()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  if (!userId) return null

  const count = unread.length

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        onClick={() => (open ? closeDropdown() : openAndMarkSeen())}
        aria-label={`Notifications (${count} unread)`}
        style={{
          position: 'relative',
          width: 34,
          height: 34,
          borderRadius: 8,
          background: 'rgba(255,255,255,.06)',
          border: '1px solid rgba(255,255,255,.12)',
          color: 'var(--cream)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 15,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        🔔
        {count > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, padding: '0 5px', background: 'var(--gold)', color: 'var(--ink)', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(26,22,18,.96)' }}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div style={{ position: 'absolute', top: 44, right: 0, zIndex: 9600, width: 320, maxWidth: '94vw', background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10, boxShadow: '0 16px 40px rgba(0,0,0,.25)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--cream-dark)', fontFamily: 'var(--font-playfair),serif', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
              Notifications
            </div>
            {snapshot.length === 0 ? (
              <div style={{ padding: '20px 14px', fontSize: 13, color: 'var(--ink-soft)', textAlign: 'center', fontStyle: 'italic' }}>
                You&apos;re all caught up.
              </div>
            ) : (
              <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                {snapshot.map(p => (
                  <div
                    key={p.id}
                    onClick={() => { closeDropdown(); router.push('/dashboard') }}
                    style={{ padding: '10px 14px', borderBottom: '1px solid var(--cream-dark)', cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 2 }}>
                      📍 <strong>{p.client_email ?? 'A client'}</strong> picked <strong>{p.location_name ?? 'a location'}</strong>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                      {new Date(p.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Push notification toggle — installing the PWA and enabling
                this lets the photographer get native notifications when a
                client picks, even when the app isn't open. */}
            {pushStatus !== 'unknown' && pushStatus !== 'unsupported' && (
              <div style={{ padding: '10px 14px', borderTop: '1px solid var(--cream-dark)', background: 'var(--cream)', fontSize: 12 }}>
                {pushStatus === 'blocked' ? (
                  <div style={{ color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                    🔕 Push notifications are blocked for this site. Re-enable them in your browser settings.
                  </div>
                ) : (
                  <button
                    onClick={togglePush}
                    disabled={pushBusy}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, background: pushStatus === 'subscribed' ? 'white' : 'var(--ink)', color: pushStatus === 'subscribed' ? 'var(--ink-soft)' : 'var(--cream)', border: pushStatus === 'subscribed' ? '1px solid var(--cream-dark)' : 'none', fontSize: 12, fontWeight: 500, cursor: pushBusy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: pushBusy ? 0.6 : 1 }}
                  >
                    {pushBusy        ? 'Working…'
                      : pushStatus === 'subscribed'   ? '🔕 Turn off push notifications'
                      : '🔔 Get push notifications for new picks'}
                  </button>
                )}
                {pushError && (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--rust)', lineHeight: 1.5 }}>{pushError}</div>
                )}
              </div>
            )}
            <div
              onClick={() => { closeDropdown(); router.push('/dashboard') }}
              style={{ padding: '10px 14px', fontSize: 12, color: 'var(--gold)', cursor: 'pointer', textAlign: 'center', background: 'var(--cream)' }}
            >
              Open dashboard →
            </div>
          </div>
        </>
      )}
    </div>
  )
}
