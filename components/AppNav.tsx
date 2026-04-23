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
  const [open,    setOpen]    = useState(false)
  const [email,   setEmail]   = useState<string | null>(null)
  const [loaded,  setLoaded]  = useState(false)
  const [canInstall, setCanInstall] = useState<'deferred' | 'ios' | null>(null)
  const [iosHint, setIosHint] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email ?? null)
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Hide when already installed.
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches
      || (navigator as any).standalone === true
    if (standalone) return

    const refresh = () => {
      if ((window as any).__lsDeferredInstall) setCanInstall('deferred')
      else if (/iPhone|iPad|iPod/.test(navigator.userAgent)) setCanInstall('ios')
      else setCanInstall(null)
    }
    refresh()
    const onBip = () => refresh()
    const onInstalled = () => setCanInstall(null)
    window.addEventListener('beforeinstallprompt', onBip)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBip)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function installApp() {
    if (canInstall === 'deferred') {
      const d = (window as any).__lsDeferredInstall
      if (!d) return
      try {
        await d.prompt()
        const { outcome } = await d.userChoice
        if (outcome === 'accepted') { (window as any).__lsDeferredInstall = null; setCanInstall(null) }
      } catch {
        // Some browsers throw if prompt() was already consumed.
      }
    } else if (canInstall === 'ios') {
      setIosHint(true)
    }
  }

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
              {canInstall && (
                <button
                  onClick={e => { e.stopPropagation(); installApp() }}
                  style={{ fontSize: 15, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '12px 0', textAlign: 'left' }}
                >
                  📲 Install app
                </button>
              )}
              <button onClick={signOut} style={{ fontSize: 15, color: 'rgba(245,240,232,.7)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '12px 0', textAlign: 'left' }}>Sign out</button>
            </>
          ) : loaded ? (
            <Link href="/">Sign in</Link>
          ) : null}
        </div>
      )}

      {iosHint && (
        <>
          <div onClick={() => setIosHint(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,8,6,.7)', backdropFilter: 'blur(4px)', zIndex: 9999 }} />
          <div style={{ position: 'fixed', left: '50%', bottom: 'calc(env(safe-area-inset-bottom, 0) + 20px)', transform: 'translateX(-50%)', zIndex: 10000, maxWidth: 'min(94vw, 420px)', background: 'rgba(26,22,18,.98)', color: 'var(--cream)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 14, padding: '16px 18px', boxShadow: '0 16px 48px rgba(0,0,0,.4)', fontSize: 14, lineHeight: 1.5 }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Install LocateShoot</div>
            <div style={{ color: 'rgba(245,240,232,.75)' }}>
              Tap <strong style={{ color: 'var(--gold)' }}>Share ↑</strong> at the bottom of Safari, then <strong>Add to Home Screen</strong>.
            </div>
            <button onClick={() => setIosHint(false)} style={{ marginTop: 14, width: '100%', padding: '9px', borderRadius: 8, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Got it
            </button>
          </div>
        </>
      )}
    </>
  )
}
