'use client'

import { useEffect, useState } from 'react'

// Chrome/Edge/Android fire a `beforeinstallprompt` event we can defer and fire later.
// iOS Safari does not — the only way in is Share → Add to Home Screen, so we show
// a short instruction instead.

type DeferredPrompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const LS_DISMISSED = 'locateshoot_install_dismissed_v1'

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) && !(window as any).MSStream
}
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as any).standalone === true
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<DeferredPrompt | null>(null)
  const [showIOS,  setShowIOS]  = useState(false)
  const [visible,  setVisible]  = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isStandalone()) return
    if (localStorage.getItem(LS_DISMISSED)) return

    // Only nudge signed-in users. Reading directly from Supabase here would pull the
    // whole client into the bundle; instead we look at the Supabase auth cookie name
    // prefix that the client library sets. If none is present, stay silent.
    const hasAuthCookie = document.cookie.split(';').some(c => c.trim().startsWith('sb-') && c.includes('-auth-token'))
    if (!hasAuthCookie) return

    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferred(e as DeferredPrompt)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', onBip)

    // iOS: show the manual instructions after a short delay on first visit
    if (isIOS()) {
      const t = setTimeout(() => { setShowIOS(true); setVisible(true) }, 4000)
      return () => { clearTimeout(t); window.removeEventListener('beforeinstallprompt', onBip) }
    }
    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  function dismiss() {
    localStorage.setItem(LS_DISMISSED, '1')
    setVisible(false)
  }

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    if (outcome === 'accepted' || outcome === 'dismissed') {
      localStorage.setItem(LS_DISMISSED, '1')
      setDeferred(null)
      setVisible(false)
    }
  }

  if (!visible) return null

  const pill: React.CSSProperties = {
    position: 'fixed',
    left: '50%',
    bottom: 'calc(env(safe-area-inset-bottom, 0) + 14px)',
    transform: 'translateX(-50%)',
    zIndex: 9998,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px 10px 12px',
    borderRadius: 14,
    background: 'rgba(26,22,18,.96)',
    color: 'var(--cream)',
    border: '1px solid rgba(255,255,255,.12)',
    boxShadow: '0 12px 40px rgba(0,0,0,.35)',
    backdropFilter: 'blur(10px)',
    fontSize: 13,
    maxWidth: 'min(94vw, 440px)',
  }

  return (
    <div style={pill}>
      <span style={{ width: 28, height: 28, borderRadius: 8, background: '#1a1612', border: '1px solid rgba(255,255,255,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
        <span style={{ position: 'absolute', top: 4, left: 7, width: 5, height: 5, borderRadius: '50%', background: 'var(--gold)' }} />
        <span style={{ fontFamily: 'Georgia, serif', fontWeight: 900, fontSize: 11, color: 'var(--cream)' }}>LS</span>
      </span>
      <div style={{ flex: 1, lineHeight: 1.35 }}>
        {showIOS
          ? <>Install LocateShoot — tap <strong style={{ color: 'var(--gold)' }}>Share ↑</strong>, then <strong>Add to Home Screen</strong>.</>
          : <>Install LocateShoot for faster access and offline use.</>}
      </div>
      {!showIOS && (
        <button onClick={install} style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Install
        </button>
      )}
      <button onClick={dismiss} aria-label="Dismiss" style={{ padding: 4, borderRadius: 6, background: 'transparent', color: 'rgba(245,240,232,.55)', border: 'none', fontSize: 16, cursor: 'pointer', fontFamily: 'inherit' }}>
        ✕
      </button>
    </div>
  )
}
