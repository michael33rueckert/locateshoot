'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type Mode = 'login' | 'signup' | 'forgot' | 'mfa'

interface Props {
  initialMode: 'login' | 'signup'
  onClose: () => void
}

export default function AuthModal({ initialMode, onClose }: Props) {
  const [mode,      setMode]      = useState<Mode>(initialMode)
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [fullName,  setFullName]  = useState('')
  const [agreed,    setAgreed]    = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [success,   setSuccess]   = useState('')
  const [mfaCode,     setMfaCode]     = useState('')
  const [mfaFactorId, setMfaFactorId] = useState('')

  function switchMode(m: Mode) {
    setMode(m); setError(''); setSuccess('')
  }

  // After a successful password sign-in, check whether this account has an
  // unverified MFA factor pending for this session (currentLevel=aal1, nextLevel=aal2).
  // If so, swap the modal into MFA entry mode; otherwise complete sign-in.
  async function finishLoginOrChallenge() {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
      const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors()
      if (fErr) throw fErr
      const totp = factors?.totp?.find(f => f.status === 'verified')
      if (!totp) {
        // Edge case: aal says there's a higher level available but no verified factor.
        // Let the user through rather than locking them out.
        onClose(); window.location.href = '/dashboard'; return
      }
      setMfaFactorId(totp.id)
      setMode('mfa')
      return
    }
    onClose(); window.location.href = '/dashboard'
  }

  async function submitMfa() {
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId })
    if (cErr) throw cErr
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: mfaFactorId,
      challengeId: challenge.id,
      code: mfaCode.trim(),
    })
    if (vErr) throw vErr
    onClose()
    window.location.href = '/dashboard'
  }

  async function handleSubmit() {
    setError(''); setSuccess(''); setLoading(true)
    try {
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        })
        if (error) throw error
        setSuccess('Password reset link sent — check your email (and your spam folder if you don\'t see it).')
        return
      }

      if (mode === 'signup') {
        if (!agreed) { setError('Please accept the terms to continue.'); return }
        if (!fullName.trim()) { setError('Please enter your full name.'); return }
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() } },
        })
        if (error) throw error
        if (data.user) {
          await supabase.from('profiles').upsert({
            id:        data.user.id,
            email:     data.user.email,
            full_name: fullName.trim(),
          })
        }
        setSuccess('Account created! Check your email to confirm, then sign in. If you don\'t see it within a minute, check your spam or junk folder.')
        return
      }

      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(), password,
        })
        if (error) throw error
        await finishLoginOrChallenge()
        return
      }

      if (mode === 'mfa') {
        await submitMfa()
        return
      }
    } catch (err: any) {
      const raw = String(err?.message ?? '')
      // Supabase's built-in confirmation-email sender hits a tight rate limit
      // on the free tier. Give the user a clearer next step than the raw
      // "Error sending confirmation email" string.
      if (/confirmation email|rate limit|email rate/i.test(raw)) {
        setError('We couldn\'t send the confirmation email right now. Please try again in a few minutes.')
      } else {
        setError(raw || 'Something went wrong — please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '11px 14px',
    border: '1px solid rgba(255,255,255,.15)', borderRadius: 6,
    fontFamily: 'inherit', fontSize: 14,
    color: '#f5f0e8', background: 'rgba(255,255,255,.08)', outline: 'none',
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,.8)', backdropFilter: 'blur(6px)', zIndex: 1000 }}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: '#1a1612', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16,
        width: 420, maxWidth: '94vw', maxHeight: '94vh', overflowY: 'auto',
        zIndex: 1001, boxShadow: '0 24px 64px rgba(0,0,0,.6)',
      }}>

        {/* Header */}
        <div style={{ padding: '1.5rem 1.5rem 0', position: 'relative' }}>
          <button
            onClick={onClose}
            style={{ position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,.08)', border: 'none', cursor: 'pointer', fontSize: 15, color: 'rgba(245,240,232,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >✕</button>

          <div style={{ fontFamily: 'Georgia, serif', fontSize: 14, fontWeight: 900, color: '#f5f0e8', display: 'flex', alignItems: 'center', gap: 6, marginBottom: '1.5rem' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#c4922a', display: 'inline-block' }} />
            LocateShoot
          </div>

          <div style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 700, color: '#f5f0e8', marginBottom: 6 }}>
            {mode === 'login'  ? 'Welcome back' :
             mode === 'signup' ? 'Create your account' :
             mode === 'mfa'    ? 'Two-factor code' :
             'Reset your password'}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(245,240,232,.45)', fontWeight: 300, marginBottom: '1.5rem', lineHeight: 1.5 }}>
            {mode === 'login'  ? 'Sign in to access your dashboard and Location Guides.' :
             mode === 'signup' ? 'Join photographers discovering great locations.' :
             mode === 'mfa'    ? 'Open your authenticator app and enter the 6-digit code for LocateShoot.' :
             "Enter your email and we'll send you a reset link."}
          </div>
        </div>

        <div style={{ padding: '0 1.5rem 1.5rem' }}>

          {/* Disclaimer for signup */}
          {mode === 'signup' && (
            <div
              onClick={() => setAgreed(p => !p)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: 'rgba(255,255,255,.04)', border: `1px solid ${agreed ? 'rgba(196,146,42,.3)' : 'rgba(255,255,255,.1)'}`, borderRadius: 8, marginBottom: '1.25rem', cursor: 'pointer', transition: 'border-color .15s' }}
            >
              <div style={{ width: 17, height: 17, borderRadius: 4, flexShrink: 0, marginTop: 1, border: `1.5px solid ${agreed ? '#c4922a' : 'rgba(255,255,255,.25)'}`, background: agreed ? '#c4922a' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#1a1612', transition: 'all .15s' }}>
                {agreed ? '✓' : ''}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(245,240,232,.4)', lineHeight: 1.6, fontWeight: 300 }}>
                I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(196,146,42,.95)', textDecoration: 'underline' }}>Terms of Use</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(196,146,42,.95)', textDecoration: 'underline' }}>Privacy Policy</a>, and acknowledge that location information is provided for informational purposes only. LocateShoot is not responsible for permit requirements, property access rights, or safety conditions at any listed location. Always verify access before shooting.
              </div>
            </div>
          )}

          {/* Google OAuth removed pre-beta. To restore: see git history
              for the Continue-with-Google button + handleGoogle handler
              that called supabase.auth.signInWithOAuth({provider:
              'google'}). */}

          {/* Full name (signup only) */}
          {mode === 'signup' && (
            <div style={{ marginBottom: 10 }}>
              <input
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                type="text"
                placeholder="Your full name"
                style={inp}
              />
            </div>
          )}

          {/* Email (not in MFA step) */}
          {mode !== 'mfa' && (
            <div style={{ marginBottom: 10 }}>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                type="email"
                placeholder="Email address"
                style={inp}
                onKeyDown={e => { if (e.key === 'Enter' && mode === 'forgot') handleSubmit() }}
              />
            </div>
          )}

          {/* Password (not for forgot / mfa) */}
          {mode !== 'forgot' && mode !== 'mfa' && (
            <div style={{ marginBottom: mode === 'login' ? 6 : '1.25rem' }}>
              <input
                value={password}
                onChange={e => setPassword(e.target.value)}
                type="password"
                placeholder="Password"
                style={inp}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
              />
            </div>
          )}

          {/* 6-digit MFA code */}
          {mode === 'mfa' && (
            <div style={{ marginBottom: '1.25rem' }}>
              <input
                value={mfaCode}
                onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123 456"
                maxLength={6}
                autoFocus
                style={{ ...inp, fontSize: 22, letterSpacing: 6, textAlign: 'center', fontFamily: 'var(--font-mono, Menlo, monospace)' }}
                onKeyDown={e => { if (e.key === 'Enter' && mfaCode.length === 6) handleSubmit() }}
              />
            </div>
          )}

          {/* Forgot password link */}
          {mode === 'login' && (
            <div style={{ textAlign: 'right', marginBottom: '1.25rem' }}>
              <button
                onClick={() => switchMode('forgot')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'rgba(245,240,232,.35)', fontFamily: 'inherit', padding: 0 }}
              >
                Forgot password?
              </button>
            </div>
          )}

          {/* Error / success */}
          {error && (
            <div style={{ padding: '8px 12px', background: 'rgba(181,75,42,.15)', border: '1px solid rgba(181,75,42,.3)', borderRadius: 6, fontSize: 13, color: '#ff9b7b', marginBottom: 10, lineHeight: 1.5 }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ padding: '8px 12px', background: 'rgba(74,103,65,.15)', border: '1px solid rgba(74,103,65,.3)', borderRadius: 6, fontSize: 13, color: '#c8e8c4', marginBottom: 10, lineHeight: 1.5 }}>
              {success}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={loading || (mode === 'signup' && !agreed) || (mode === 'mfa' && mfaCode.length !== 6)}
            style={{ width: '100%', padding: '12px', borderRadius: 8, background: '#c4922a', color: '#1a1612', border: 'none', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: loading || (mode === 'signup' && !agreed) || (mode === 'mfa' && mfaCode.length !== 6) ? 'default' : 'pointer', opacity: loading || (mode === 'signup' && !agreed) || (mode === 'mfa' && mfaCode.length !== 6) ? 0.6 : 1, marginBottom: '1rem' }}
          >
            {loading ? 'Please wait…' :
             mode === 'login'  ? 'Sign In' :
             mode === 'signup' ? 'Create Account' :
             mode === 'mfa'    ? 'Verify' :
             'Send Reset Link'}
          </button>

          {/* Mode switcher */}
          <div style={{ textAlign: 'center', fontSize: 13, color: 'rgba(245,240,232,.4)' }}>
            {mode === 'login' ? (
              <>Don&apos;t have an account?{' '}
                <button onClick={() => switchMode('signup')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c4922a', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, padding: 0 }}>
                  Sign up free
                </button>
              </>
            ) : mode === 'signup' ? (
              <>Already have an account?{' '}
                <button onClick={() => switchMode('login')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c4922a', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, padding: 0 }}>
                  Sign in
                </button>
              </>
            ) : mode === 'mfa' ? (
              <button
                onClick={async () => { await supabase.auth.signOut(); switchMode('login'); setPassword(''); setMfaCode('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(245,240,232,.55)', fontFamily: 'inherit', fontSize: 13, padding: 0 }}
              >
                ← Use a different account
              </button>
            ) : (
              <>Remember your password?{' '}
                <button onClick={() => switchMode('login')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c4922a', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, padding: 0 }}>
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}