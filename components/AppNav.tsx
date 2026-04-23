'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ADMIN_EMAIL } from '@/lib/admin'

/**
 * Consistent top-bar nav used on every internal page. Logo always on the left,
 * hamburger always on the right on mobile/tablet. Desktop shows inline links.
 *
 * Pages can pass `rightExtra` for a context-specific action (e.g. onboarding's
 * "Skip" button) — it renders next to the hamburger.
 */
export default function AppNav({ rightExtra }: { rightExtra?: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  const [open,   setOpen]   = useState(false)
  const [email,  setEmail]  = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

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

  const LINKS = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/explore',   label: 'Explore map' },
    { href: '/share',     label: 'New share' },
    { href: '/profile',   label: 'Profile' },
    ...(isAdmin ? [{ href: '/admin', label: 'Admin' }] : []),
  ]

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      <nav style={{ position: 'sticky', top: 0, zIndex: 200, background: 'rgba(26,22,18,.96)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', height: 60 }}>
        <Link href={signedIn ? '/dashboard' : '/'} style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 900, color: 'var(--cream)', display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', display: 'inline-block' }} />LocateShoot
        </Link>

        {/* Desktop inline links */}
        <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          {signedIn && LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              style={{
                fontSize: 13,
                color: isActive(l.href) ? 'var(--gold)' : 'rgba(245,240,232,.55)',
                fontWeight: isActive(l.href) ? 600 : 400,
                textDecoration: 'none',
              }}
            >
              {l.label}
            </Link>
          ))}
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
              {LINKS.map(l => (
                <Link
                  key={l.href}
                  href={l.href}
                  style={{
                    color: isActive(l.href) ? 'var(--gold)' : undefined,
                    fontWeight: isActive(l.href) ? 600 : undefined,
                  }}
                >
                  {isActive(l.href) ? '• ' : ''}{l.label}
                </Link>
              ))}
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
