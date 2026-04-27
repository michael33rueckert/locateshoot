'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isAdminEmail } from '@/lib/admin'
import NotificationBell from '@/components/NotificationBell'

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
  // 'deferred' — Chrome has fired beforeinstallprompt and we can trigger it directly.
  // 'ios' — iOS Safari; must use Share → Add to Home Screen.
  // 'manual' — a Chromium/Firefox/etc. browser where the event hasn't fired yet
  //            (or never will); we show per-browser instructions instead.
  const [canInstall, setCanInstall] = useState<'deferred' | 'ios' | 'manual' | null>(null)
  const [installHint, setInstallHint] = useState<null | 'ios' | 'manual'>(null)

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
      else setCanInstall('manual')
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
      if (!d) { setInstallHint('manual'); return }
      try {
        await d.prompt()
        const { outcome } = await d.userChoice
        if (outcome === 'accepted') { (window as any).__lsDeferredInstall = null; setCanInstall('manual') }
      } catch {
        setInstallHint('manual')
      }
    } else if (canInstall === 'ios') {
      setInstallHint('ios')
    } else {
      setInstallHint('manual')
    }
  }

  function browserHint(): React.ReactNode {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    const isEdge = /Edg\//.test(ua)
    const isChrome = !isEdge && /Chrome\//.test(ua) && !/OPR\//.test(ua)
    const isFirefox = /Firefox\//.test(ua)
    const isAndroid = /Android/.test(ua)
    if (isAndroid && (isChrome || isEdge)) {
      return <>Tap the browser menu (⋮) then <strong style={{ color: 'var(--gold)' }}>Install app</strong> or <strong style={{ color: 'var(--gold)' }}>Add to Home Screen</strong>.</>
    }
    if (isChrome) {
      return <>Look for the <strong style={{ color: 'var(--gold)' }}>install icon</strong> in the address bar, or open the ⋮ menu → <strong>Cast, save, and share</strong> → <strong>Install page as app</strong>.</>
    }
    if (isEdge) {
      return <>Open the ⋯ menu → <strong style={{ color: 'var(--gold)' }}>Apps</strong> → <strong>Install this site as an app</strong>.</>
    }
    if (isFirefox) {
      return <>Firefox doesn&apos;t install PWAs on desktop. On Android, tap the menu → <strong>Install</strong>. On desktop, use Chrome or Edge.</>
    }
    return <>Open your browser&apos;s menu and look for <strong style={{ color: 'var(--gold)' }}>Install</strong> or <strong>Add to Home Screen</strong>.</>
  }

  const isAdmin = isAdminEmail(email)
  const signedIn = !!email

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const LINKS = [
    { href: '/dashboard',                label: 'Dashboard' },
    { href: '/portfolio',                label: 'Portfolio' },
    { href: '/explore',                  label: 'Explore map' },
    { href: '/location-guides',          label: 'Location Guides' },
    { href: '/profile',                  label: 'Profile' },
    { href: '/onboarding/how-it-works',  label: 'Getting Started' },
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
          {signedIn && <NotificationBell />}
          {canInstall && (
            <button
              className="nav-links"
              onClick={installApp}
              title="Install LocateShoot"
              style={{ padding: '5px 10px', borderRadius: 4, background: canInstall === 'manual' ? 'transparent' : 'rgba(196,146,42,.12)', border: `1px solid ${canInstall === 'manual' ? 'rgba(255,255,255,.15)' : 'rgba(196,146,42,.35)'}`, color: canInstall === 'manual' ? 'rgba(245,240,232,.6)' : 'var(--gold)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
            >
              📲 Install
            </button>
          )}
          <button className="nav-links" onClick={signedIn ? signOut : undefined} style={{ padding: '5px 12px', borderRadius: 4, background: 'transparent', border: '1px solid rgba(255,255,255,.2)', color: 'rgba(245,240,232,.6)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: signedIn ? undefined : 'none' }}>Sign out</button>
          <button className="hamburger-btn" onClick={() => setOpen(p => !p)} aria-label="Menu">
            {open ? '✕' : '☰'}
          </button>
        </div>
      </nav>

      {open && (
        <>
          {/* Full-screen backdrop below the dropdown so any tap on the
              page underneath closes the menu — without this the menu
              only collapses when the user lands precisely on the X
              button or on a link inside the panel. Sits below the menu
              (z-index 499 vs 500) but above page content. */}
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', top: 60, left: 0, right: 0, bottom: 0, zIndex: 499, background: 'transparent' }} />
          <div className="mobile-menu" onClick={() => setOpen(false)}>
            {signedIn && LINKS.map(l => (
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
                style={{ fontSize: 15, color: canInstall === 'manual' ? 'rgba(245,240,232,.75)' : 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '12px 0', textAlign: 'left' }}
              >
                📲 Install app
              </button>
            )}
            {signedIn ? (
              <button onClick={signOut} style={{ fontSize: 15, color: 'rgba(245,240,232,.7)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '12px 0', textAlign: 'left' }}>Sign out</button>
            ) : loaded ? (
              <Link href="/">Sign in</Link>
            ) : null}
          </div>
        </>
      )}

      {installHint && (
        <>
          <div onClick={() => setInstallHint(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,8,6,.7)', backdropFilter: 'blur(4px)', zIndex: 9999 }} />
          <div style={{ position: 'fixed', left: '50%', bottom: 'calc(env(safe-area-inset-bottom, 0) + 20px)', transform: 'translateX(-50%)', zIndex: 10000, maxWidth: 'min(94vw, 440px)', background: 'rgba(26,22,18,.98)', color: 'var(--cream)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 14, padding: '16px 18px', boxShadow: '0 16px 48px rgba(0,0,0,.4)', fontSize: 14, lineHeight: 1.55 }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Install LocateShoot</div>
            <div style={{ color: 'rgba(245,240,232,.8)' }}>
              {installHint === 'ios'
                ? <>Tap <strong style={{ color: 'var(--gold)' }}>Share ↑</strong> at the bottom of Safari, then <strong>Add to Home Screen</strong>.</>
                : browserHint()}
            </div>
            <button onClick={() => setInstallHint(null)} style={{ marginTop: 14, width: '100%', padding: '9px', borderRadius: 8, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Got it
            </button>
          </div>
        </>
      )}
    </>
  )
}
