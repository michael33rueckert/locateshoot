'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// Landing page for the "Reset two-factor" email link.
//
// The email delivers a raw token in the query string. We don't consume
// it on page load — that would let email scanners / preview bots trip
// the single-use token. Instead we display a confirmation card and
// require an explicit click, which POSTs to /api/mfa-reset/confirm.
//
// After confirmation we also sign the current session out so the user
// starts fresh with password-only sign-in — otherwise a still-live
// AAL1 session could hit the MfaGate again and confuse them.

function MfaResetInner() {
  const params = useSearchParams()
  const router = useRouter()
  const token  = params.get('token')

  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'error'>(token ? 'idle' : 'error')
  const [err,   setErr]   = useState<string>(token ? '' : 'Missing reset token. Open the reset link from your email again.')

  useEffect(() => {
    if (!token) return
    // Nothing to preload — user has to click Confirm.
  }, [token])

  async function confirm() {
    if (!token) return
    setState('busy'); setErr('')
    try {
      const res = await fetch('/api/mfa-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(j.message ?? 'Could not reset MFA. Try opening the link again.')
        setState('error')
        return
      }
      // Sign out so the AAL1 session doesn't linger. Non-fatal if
      // supabase-js can't find a session — the user is being sent to
      // the sign-in flow either way.
      try { await supabase.auth.signOut() } catch { /* no-op */ }
      setState('ok')
    } catch {
      setErr('Network error — please try again.')
      setState('error')
    }
  }

  return (
    <div style={{ minHeight: '100svh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1.25rem' }}>
      <div style={{ background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 12, padding: '2rem', maxWidth: 460, width: '100%', boxShadow: '0 8px 32px rgba(26,22,18,.06)' }}>
        <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 14, fontWeight: 900, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: '1.25rem' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)', display: 'inline-block' }} />
          LocateShoot
        </div>

        {state === 'ok' ? (
          <>
            <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 24, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>
              Two-factor removed
            </div>
            <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              MFA has been cleared on your account. Sign in with your email and password to continue. We recommend re-enabling MFA from Profile → Password &amp; Security once you&apos;re back in.
            </p>
            <Link href="/" style={{ display: 'block', width: '100%', padding: '12px', borderRadius: 6, background: 'var(--gold)', color: 'var(--ink)', fontSize: 14, fontWeight: 600, textDecoration: 'none', textAlign: 'center' }}>
              Go to sign in
            </Link>
          </>
        ) : state === 'error' ? (
          <>
            <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--rust)', marginBottom: 10 }}>
              Couldn&apos;t reset MFA
            </div>
            <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              {err}
            </p>
            <Link href="/" style={{ display: 'block', width: '100%', padding: '12px', borderRadius: 6, background: 'var(--ink)', color: 'var(--cream)', fontSize: 14, fontWeight: 600, textDecoration: 'none', textAlign: 'center' }}>
              Back to home
            </Link>
          </>
        ) : (
          <>
            <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 24, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>
              Reset two-factor?
            </div>
            <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.6, marginBottom: 12 }}>
              This will remove <strong>all authenticator apps</strong> from your account. You&apos;ll be able to sign in with just your email and password.
            </p>
            <div style={{ padding: '10px 14px', background: 'rgba(196,146,42,.08)', border: '1px solid rgba(196,146,42,.25)', borderRadius: 6, fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.55, marginBottom: '1.25rem' }}>
              After you&apos;re signed in, go to <strong>Profile → Password &amp; Security</strong> and enroll a fresh authenticator so your account is protected again.
            </div>
            <button
              onClick={confirm}
              disabled={state === 'busy'}
              style={{ width: '100%', padding: '12px', borderRadius: 6, background: 'var(--rust)', color: 'white', fontSize: 14, fontWeight: 600, cursor: state === 'busy' ? 'default' : 'pointer', border: 'none', fontFamily: 'inherit', opacity: state === 'busy' ? 0.6 : 1, marginBottom: 8 }}
            >
              {state === 'busy' ? 'Resetting…' : 'Yes, remove my MFA'}
            </button>
            <Link href="/" style={{ display: 'block', width: '100%', padding: '11px', borderRadius: 6, background: 'white', border: '1px solid var(--cream-dark)', color: 'var(--ink-soft)', fontSize: 13, textDecoration: 'none', textAlign: 'center' }}>
              Cancel
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

export default function MfaResetPage() {
  // useSearchParams needs to be under Suspense for the app-router build.
  return (
    <Suspense fallback={<div style={{ minHeight: '100svh', background: 'var(--cream)' }} />}>
      <MfaResetInner />
    </Suspense>
  )
}
