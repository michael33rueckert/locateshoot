'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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
  const [open,    setOpen]    = useState(false)
  const timerRef = useRef<any>(null)

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
    setOpen(true)
    if (!userId || unread.length === 0) return
    const now = new Date().toISOString()
    // Read current preferences and merge — don't clobber other keys.
    const { data: profile } = await supabase.from('profiles').select('preferences').eq('id', userId).single()
    const prefs = { ...(profile?.preferences ?? {}), last_picks_seen_at: now }
    await supabase.from('profiles').update({ preferences: prefs }).eq('id', userId)
    setLastSeen(now)
    // Clear the local unread count; the dropdown still shows the picks it
    // rendered on open until it's closed.
    setTimeout(() => setUnread([]), 0)
  }

  if (!userId) return null

  const count = unread.length

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => (open ? setOpen(false) : openAndMarkSeen())}
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
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'transparent' }} />
          <div style={{ position: 'absolute', top: 44, right: 0, zIndex: 9600, width: 320, maxWidth: '94vw', background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10, boxShadow: '0 16px 40px rgba(0,0,0,.25)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--cream-dark)', fontFamily: 'var(--font-playfair),serif', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
              Notifications
            </div>
            {unread.length === 0 ? (
              <div style={{ padding: '20px 14px', fontSize: 13, color: 'var(--ink-soft)', textAlign: 'center', fontStyle: 'italic' }}>
                You&apos;re all caught up.
              </div>
            ) : (
              <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                {unread.map(p => (
                  <div
                    key={p.id}
                    onClick={() => { setOpen(false); router.push('/dashboard') }}
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
            <div
              onClick={() => { setOpen(false); router.push('/dashboard') }}
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
