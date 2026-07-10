'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Mounted globally. Any signed-in session whose AAL is below what the user
 * has enrolled (currentLevel=aal1, nextLevel=aal2) gets blocked behind a
 * forced TOTP challenge modal — covers password login, OAuth login, and
 * resumed sessions alike. Users can sign out instead of verifying.
 */
export default function MfaGate() {
  const [needed,      setNeeded]      = useState(false)
  const [factorId,    setFactorId]    = useState<string>('')
  const [code,        setCode]        = useState('')
  const [error,       setError]       = useState('')
  const [loading,     setLoading]     = useState(false)

  // "Lost access?" reset flow — sends a reset link to the account
  // email. Kept collapsed by default so the primary path (type your
  // code) stays uncluttered.
  const [showReset,     setShowReset]     = useState(false)
  const [resetBusy,     setResetBusy]     = useState(false)
  const [resetSent,     setResetSent]     = useState(false)
  const [resetError,    setResetError]    = useState('')
  const [resetEmail,    setResetEmail]    = useState<string | null>(null)

  async function check() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setNeeded(false); return }
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    // Already at aal2 — verified earlier this session, no challenge needed.
    if (aal?.currentLevel === 'aal2') { setNeeded(false); return }
    // Use listFactors directly rather than the AAL nextLevel field —
    // right after signInWithPassword the factor list hasn't always been
    // fetched yet, so nextLevel can momentarily read 'aal1' even for
    // an MFA-enabled account. listFactors hits the API and is reliable.
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const totp = factors?.totp?.find(f => f.status === 'verified')
    if (!totp) { setNeeded(false); return }
    setFactorId(totp.id)
    setResetEmail(user.email ?? null)
    setNeeded(true)
  }

  useEffect(() => {
    check()
    const { data: sub } = supabase.auth.onAuthStateChange(() => { check() })
    return () => { sub.subscription.unsubscribe() }
  }, [])

  async function verify() {
    setError(''); setLoading(true)
    try {
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId })
      if (cErr) throw cErr
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId, challengeId: challenge.id, code: code.trim(),
      })
      if (vErr) throw vErr
      setNeeded(false); setCode('')
      // Refresh so server components re-render with the upgraded session.
      window.location.reload()
    } catch (err: any) {
      setError(err.message ?? 'Invalid code — please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function bailOut() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  async function sendResetLink() {
    setResetBusy(true); setResetError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Session lost — sign in again.')
      const res = await fetch('/api/mfa-reset/request', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.message ?? 'Could not send reset email.')
      setResetSent(true)
    } catch (err: any) {
      setResetError(err?.message ?? 'Could not send reset email.')
    } finally {
      setResetBusy(false)
    }
  }

  if (!needed) return null

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,.92)', backdropFilter: 'blur(10px)', zIndex: 10000 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: '#1a1612', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16,
        width: 420, maxWidth: '94vw', zIndex: 10001, padding: '1.5rem',
        boxShadow: '0 24px 64px rgba(0,0,0,.6)',
      }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 14, fontWeight: 900, color: '#f5f0e8', display: 'flex', alignItems: 'center', gap: 6, marginBottom: '1.5rem' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#c4922a', display: 'inline-block' }} />
          LocateShoot
        </div>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 700, color: '#f5f0e8', marginBottom: 6 }}>
          Two-factor code
        </div>
        <div style={{ fontSize: 13, color: 'rgba(245,240,232,.45)', fontWeight: 300, marginBottom: '1.25rem', lineHeight: 1.5 }}>
          This account has MFA enabled. Enter the 6-digit code from your authenticator app to continue.
        </div>

        <input
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123 456"
          maxLength={6}
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter' && code.length === 6) verify() }}
          style={{
            width: '100%', padding: '11px 14px',
            border: '1px solid rgba(255,255,255,.15)', borderRadius: 6,
            fontFamily: 'var(--font-mono, Menlo, monospace)', fontSize: 22,
            letterSpacing: 6, textAlign: 'center',
            color: '#f5f0e8', background: 'rgba(255,255,255,.08)', outline: 'none',
            marginBottom: '1rem',
          }}
        />

        {error && (
          <div style={{ padding: '8px 12px', background: 'rgba(181,75,42,.15)', border: '1px solid rgba(181,75,42,.3)', borderRadius: 6, fontSize: 13, color: '#ff9b7b', marginBottom: 10, lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        <button
          onClick={verify}
          disabled={loading || code.length !== 6}
          style={{ width: '100%', padding: '12px', borderRadius: 8, background: '#c4922a', color: '#1a1612', border: 'none', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: loading || code.length !== 6 ? 'default' : 'pointer', opacity: loading || code.length !== 6 ? 0.6 : 1, marginBottom: '1rem' }}
        >
          {loading ? 'Verifying…' : 'Verify'}
        </button>

        {/* Recovery panel — collapsed by default. Expands into a
            confirmation card that fires the reset email off to the
            account address. Deliberately quiet visually so it doesn't
            compete with the primary code-entry path. */}
        {!showReset ? (
          <div style={{ textAlign: 'center', marginBottom: '.75rem' }}>
            <button
              onClick={() => setShowReset(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(245,240,232,.55)', fontFamily: 'inherit', fontSize: 12, padding: 0, textDecoration: 'underline' }}
            >
              Lost access to your authenticator?
            </button>
          </div>
        ) : (
          <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', marginBottom: '.75rem' }}>
            {resetSent ? (
              <>
                <div style={{ fontSize: 13, color: '#f5f0e8', fontWeight: 600, marginBottom: 6 }}>Check your email</div>
                <div style={{ fontSize: 12, color: 'rgba(245,240,232,.55)', lineHeight: 1.55 }}>
                  We sent a reset link to <strong style={{ color: '#f5f0e8' }}>{resetEmail ?? 'your account address'}</strong>. Click it within 30 minutes to clear MFA. Then sign in with your password.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, color: '#f5f0e8', fontWeight: 600, marginBottom: 6 }}>Email a reset link?</div>
                <div style={{ fontSize: 12, color: 'rgba(245,240,232,.55)', lineHeight: 1.55, marginBottom: 10 }}>
                  We&apos;ll send a one-time link to <strong style={{ color: '#f5f0e8' }}>{resetEmail ?? 'your account address'}</strong> that removes MFA from your account. Only whoever controls that inbox can use it.
                </div>
                {resetError && (
                  <div style={{ padding: '7px 10px', background: 'rgba(181,75,42,.15)', border: '1px solid rgba(181,75,42,.3)', borderRadius: 5, fontSize: 12, color: '#ff9b7b', marginBottom: 10, lineHeight: 1.5 }}>
                    {resetError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={sendResetLink}
                    disabled={resetBusy}
                    style={{ flex: 1, padding: '9px', borderRadius: 6, background: '#b54b2a', color: 'white', border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: resetBusy ? 'default' : 'pointer', opacity: resetBusy ? 0.6 : 1 }}
                  >
                    {resetBusy ? 'Sending…' : 'Send reset link'}
                  </button>
                  <button
                    onClick={() => { setShowReset(false); setResetError('') }}
                    disabled={resetBusy}
                    style={{ padding: '9px 14px', borderRadius: 6, background: 'transparent', color: 'rgba(245,240,232,.6)', border: '1px solid rgba(255,255,255,.15)', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div style={{ textAlign: 'center' }}>
          <button
            onClick={bailOut}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(245,240,232,.45)', fontFamily: 'inherit', fontSize: 12, padding: 0 }}
          >
            Sign out instead
          </button>
        </div>
      </div>
    </>
  )
}
