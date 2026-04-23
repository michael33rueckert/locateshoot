'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ADMIN_EMAIL } from '@/lib/admin'

/**
 * Consistent top-bar nav used on every internal page (dashboard, explore,
 * profile, admin, onboarding, share). Logo always on the left, hamburger
 * always on the right on mobile/tablet. Desktop shows inline links.
 *
 * Pages can pass a `rightExtra` slot for a context-specific action (e.g.
 * onboarding's "Skip" button) — it renders next to the hamburger.
 */
export default function AppNav({ rightExtra }: { rightExtra?: React.ReactNode }) {
  const [open,    setOpen]    = useState(false)
  const [email,   setEmail]   = useState<string | null>(null)
  const [loaded,  setLoaded]  = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email ?? null)
      setLoaded(true)
    })
  }, [])

  const isAdmin = email === ADMIN_EMAIL
  const signedIn = !!email

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <>
      <nav style={{ position: 'sticky', top: 0, zIndex: 200, background: 'rgba(26,22,18,.96)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', height: 60 }}>
        <Link href={signedIn ? '/dashboard' : '/'} style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 900, color: 'var(--cream)', display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', display: 'inline-block' }} />LocateShoot
        </Link>

        {/* Desktop inline links */}
        <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          {signedIn && <>
            <Link href="/dashboard" style={{ fontSize: 13, color: 'rgba(245,240,232,.55)', textDecoration: 'none' }}>Dashboard</Link>
            <Link href="/explore"   style={{ fontSize: 13, color: 'rgba(245,240,232,.55)', textDecoration: 'none' }}>Explore map</Link>
            <Link href="/share"     style={{ fontSize: 13, color: 'rgba(245,240,232,.55)', textDecoration: 'none' }}>New share</Link>
            <Link href="/profile"   style={{ fontSize: 13, color: 'rgba(245,240,232,.55)', textDecoration: 'none' }}>Profile</Link>
            {isAdmin && <Link href="/admin" style={{ fontSize: 13, color: 'rgba(245,240,232,.55)', textDecoration: 'none' }}>Admin</Link>}
          </>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {rightExtra}
          <button className="nav-links" onClick={signedIn ? signOut : undefined} style={{ padding: '5px 12px', borderRadius: 4, background: 'transparent', border: '1px solid rgba(255,255,255,.2)', color: 'rgba(245,240,232,.6)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: signedIn ? undefined : 'none' }}>Sign out</button>
          <button className="hamburger-btn" onClick={() => setOpen(p => !p)} aria-label="Menu">
            {open ? '✕' : '☰'}
          </button>
        </div>
      </nav>

      {open && (
        <div className="mobile-menu" onClick={() => setOpen(false)}>
          {signedIn ? (
            <>
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/explore">Explore map</Link>
              <Link href="/share">New share</Link>
              <Link href="/profile">Profile</Link>
              {isAdmin && <Link href="/admin">Admin</Link>}
              <button onClick={signOut} style={{ fontSize: 15, color: 'rgba(245,240,232,.7)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '12px 0', textAlign: 'left' }}>Sign out</button>
            </>
          ) : loaded ? (
            <Link href="/">Sign in</Link>
          ) : null}
        </div>
      )}
    </>
  )
}
