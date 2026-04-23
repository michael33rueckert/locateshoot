'use client'

import { useEffect, useState } from 'react'

// Chrome/Edge/Android fire a `beforeinstallprompt` event we can defer and fire later.
// iOS Safari does not — the only way in is Share → Add to Home Screen, so we show
// a short instruction instead.

type DeferredPrompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Window-level handle to the captured beforeinstallprompt, so the nav menu's
// "Install app" item can fire it on demand even after our banner is dismissed.
declare global {
  interface Window {
    __lsDeferredInstall?: DeferredPrompt | null
  }
}

const LS_DISMISSED = 'locateshoot_install_dismissed_v2'

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

    // Always attach the listener — Chrome decides when to fire based on its own
    // engagement heuristics (valid manifest + SW + interaction). If we never listen,
    // the event's default UI is suppressed and nothing surfaces.
    const onBip = (e: Event) => {
      e.preventDefault()
      const d = e as DeferredPrompt
      window.__lsDeferredInstall = d
      setDeferred(d)
      if (!localStorage.getItem(LS_DISMISSED)) setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', onBip)

    const onInstalled = () => {
      window.__lsDeferredInstall = null
      setDeferred(null)
      setVisible(false)
      localStorage.setItem(LS_DISMISSED, '1')
    }
    window.addEventListener('appinstalled', onInstalled)

    // iOS never fires beforeinstallprompt. Show the manual instructions after a short
    // delay so it doesn't intrude on first paint.
    let iosTimer: any = null
    if (isIOS() && !localStorage.getItem(LS_DISMISSED)) {
      iosTimer = setTimeout(() => { setShowIOS(true); setVisible(true) }, 4000)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBip)
      window.removeEventListener('appinstalled', onInstalled)
      if (iosTimer) clearTimeout(iosTimer)
    }
  }, [])

  function dismiss() {
    localStorage.setItem(LS_DISMISSED, '1')
    setVisible(false)
  }

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    if (outcome === 'accepted') {
      window.__lsDeferredInstall = null
      setDeferred(null)
    }
    // Either way, hide for this session.
    localStorage.setItem(LS_DISMISSED, '1')
    setVisible(false)
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
      <span style={{ width: 28, height: 28, borderRadius: 8, background: '#1a1612', border: '1px solid rgba(255,255,255,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--gold)' }} />
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
