'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface AuthModalProps {
  initialMode?: 'login' | 'signup'
  onClose: () => void
}

export default function AuthModal({ initialMode = 'login', onClose }: AuthModalProps) {
  const [mode,      setMode]      = useState<'login' | 'signup'>(initialMode)
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [fullName,  setFullName]  = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [success,   setSuccess]   = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    setSuccess(null)
    setLoading(true)

    try {
      if (mode === 'signup') {
        // Create account
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            // After confirming email, user is redirected to /auth/callback
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        })

        if (error) throw error

        setSuccess(
          "Account created! Check your email for a confirmation link. " +
          "Click it and you'll be taken straight to your dashboard."
        )
      } else {
        // Sign in
        const { error } = await supabase.auth.signInWithPassword({ email, password })

        if (error) {
          // Make the error message friendlier
          if (error.message.includes('Invalid login credentials')) {
            throw new Error('Incorrect email or password. Please try again.')
          }
          if (error.message.includes('Email not confirmed')) {
            throw new Error('Please confirm your email first — check your inbox for the link we sent.')
          }
          throw error
        }

        // Successful login — redirect to dashboard
        window.location.href = '/dashboard'
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleSignIn() {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) setError(error.message)
  }

  function switchMode(newMode: 'login' | 'signup') {
    setMode(newMode)
    setError(null)
    setSuccess(null)
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px',
    border: '1px solid var(--cream-dark)',
    borderRadius: 4,
    fontFamily: 'var(--font-dm-sans), sans-serif',
    fontSize: 14, color: 'var(--ink)', background: 'white', outline: 'none',
    transition: 'border-color 0.18s',
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,0.8)', backdropFilter: 'blur(4px)', zIndex: 2000 }}
      />

      {/* Modal box */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'white', borderRadius: 10,
        width: 460, maxWidth: '90vw',
        padding: '2.5rem',
        zIndex: 2001,
        boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
      }}>
        {/* Close */}
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: '1rem', right: '1rem', width: 32, height: 32, borderRadius: '50%', background: 'var(--cream-dark)', border: 'none', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)' }}
        >
          ✕
        </button>

        {/* Title */}
        <div style={{ fontFamily: 'var(--font-playfair), serif', fontSize: 26, fontWeight: 700, color: 'var(--ink)', marginBottom: '0.5rem' }}>
          {mode === 'login' ? 'Welcome back' : 'Join LocateShoot'}
        </div>
        <p style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: '2rem', lineHeight: 1.5 }}>
          {mode === 'login'
            ? 'Sign in to access your saved locations and client share links.'
            : 'Free forever. No credit card required.'}
        </p>

        {/* Tabs */}
        <div style={{ display: 'flex', border: '1px solid var(--cream-dark)', borderRadius: 4, overflow: 'hidden', marginBottom: '1.5rem' }}>
          {(['login', 'signup'] as const).map(m => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              style={{
                flex: 1, padding: '10px', textAlign: 'center',
                fontSize: 14, cursor: 'pointer', border: 'none',
                fontFamily: 'var(--font-dm-sans), sans-serif',
                background: mode === m ? 'var(--ink)' : 'transparent',
                color: mode === m ? 'var(--cream)' : 'var(--ink-soft)',
                fontWeight: mode === m ? 500 : 400,
                transition: 'all 0.15s',
              }}
            >
              {m === 'login' ? 'Sign In' : 'Join Free'}
            </button>
          ))}
        </div>

        {/* Success message */}
        {success && (
          <div style={{ padding: '12px 14px', background: 'rgba(74,103,65,0.08)', border: '1px solid rgba(74,103,65,0.25)', borderRadius: 8, marginBottom: '1rem', fontSize: 13, color: 'var(--sage)', lineHeight: 1.55 }}>
            ✓ {success}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div style={{ padding: '12px 14px', background: 'rgba(181,75,42,0.08)', border: '1px solid rgba(181,75,42,0.25)', borderRadius: 8, marginBottom: '1rem', fontSize: 13, color: 'var(--rust)', lineHeight: 1.55 }}>
            ⚠ {error}
          </div>
        )}

        {/* Form */}
        {!success && (
          <>
            {mode === 'signup' && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Full name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Jane Smith"
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = 'var(--gold)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--cream-dark)')}
                />
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
                placeholder="you@example.com"
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--gold)')}
                onBlur={e => (e.target.style.borderColor = 'var(--cream-dark)')}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
                placeholder="••••••••"
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--gold)')}
                onBlur={e => (e.target.style.borderColor = 'var(--cream-dark)')}
              />
              {mode === 'signup' && (
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4, fontWeight: 300 }}>
                  At least 6 characters
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={loading || !email || !password || (mode === 'signup' && !fullName)}
              style={{
                width: '100%', padding: '13px',
                background: 'var(--gold)', color: 'var(--ink)',
                border: 'none', borderRadius: 4,
                fontFamily: 'var(--font-dm-sans), sans-serif',
                fontSize: 15, fontWeight: 500, cursor: 'pointer',
                marginBottom: '1rem', transition: 'all 0.18s',
                opacity: loading || !email || !password || (mode === 'signup' && !fullName) ? 0.6 : 1,
              }}
            >
              {loading
                ? 'Please wait…'
                : mode === 'login' ? 'Sign In' : 'Create Free Account'}
            </button>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1rem' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--cream-dark)' }} />
              <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>or</span>
              <div style={{ flex: 1, height: 1, background: 'var(--cream-dark)' }} />
            </div>

            {/* Google */}
            <button
              onClick={handleGoogleSignIn}
              style={{
                width: '100%', padding: '11px',
                background: 'white', color: 'var(--ink)',
                border: '1px solid var(--cream-dark)', borderRadius: 4,
                fontFamily: 'var(--font-dm-sans), sans-serif',
                fontSize: 14, fontWeight: 500, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.18s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--sand)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--cream-dark)')}
            >
              {/* Google logo SVG */}
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
                <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
                <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/>
                <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/>
              </svg>
              Continue with Google
            </button>
          </>
        )}

        {/* Footer note */}
        {mode === 'signup' && !success && (
          <p style={{ fontSize: 11, color: 'var(--ink-soft)', textAlign: 'center', marginTop: '1rem', fontWeight: 300, lineHeight: 1.5 }}>
            By creating an account you agree to our{' '}
            <a href="/terms" style={{ color: 'var(--gold)' }}>Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy" style={{ color: 'var(--gold)' }}>Privacy Policy</a>.
          </p>
        )}
      </div>
    </>
  )
}