'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Global beta-feedback capture. Mounted in the root layout so every
// page has a small tab at the bottom-right that opens a structured
// form. Submissions POST to /api/feedback which emails
// feedback@locateshoot.com with the type, page URL, viewport, UA,
// and reporter info.

type FeedbackType = 'bug' | 'idea' | 'praise' | 'other'

const TYPE_OPTIONS: { value: FeedbackType; label: string; helper: string }[] = [
  { value: 'bug',    label: '🐛 Bug',     helper: 'Something is broken or not working as expected' },
  { value: 'idea',   label: '💡 Idea',    helper: 'A feature or improvement you\'d like to see' },
  { value: 'praise', label: '❤️ Praise',  helper: 'Something you love — knowing what to keep is gold' },
  { value: 'other',  label: '💬 Other',   helper: 'General comment, question, or feedback' },
]

export default function FeedbackButton() {
  const pathname = usePathname() ?? ''
  const [open,           setOpen]           = useState(false)
  const [type,           setType]           = useState<FeedbackType>('bug')
  const [msg,            setMsg]            = useState('')
  const [stepsToRepro,   setStepsToRepro]   = useState('')
  const [contactConsent, setContactConsent] = useState(true)
  const [sending,        setSending]        = useState(false)
  const [sent,           setSent]           = useState(false)
  const [err,            setErr]            = useState('')
  const [signedIn,       setSignedIn]       = useState<boolean | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session?.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s?.user))
    return () => subscription.unsubscribe()
  }, [])

  // Only photographers/admins can send feedback — hide for anonymous visitors
  // (including the landing page and the client-facing /pick/* share links).
  if (pathname.startsWith('/pick')) return null
  if (signedIn !== true) return null

  async function submit() {
    if (!msg.trim()) { setErr('Please describe what you\'d like to report.'); return }
    setSending(true); setErr('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const viewport = typeof window !== 'undefined' ? `${window.innerWidth}×${window.innerHeight}` : undefined
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          message:        msg.trim(),
          feedbackType:   type,
          stepsToRepro:   type === 'bug' && stepsToRepro.trim() ? stepsToRepro.trim() : undefined,
          pageUrl:        typeof window !== 'undefined' ? window.location.href : undefined,
          viewport,
          contactConsent,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setErr(body?.message ?? 'Could not send right now — please try again in a moment.')
        return
      }
      setSent(true)
      setMsg(''); setStepsToRepro('')
    } catch { setErr('Network error — please try again.') }
    finally { setSending(false) }
  }

  function close() {
    setOpen(false)
    // Reset transient state so the next open is fresh.
    setTimeout(() => { setSent(false); setErr(''); setType('bug'); setStepsToRepro('') }, 250)
  }

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 6 }
  const fieldStyle: React.CSSProperties = { width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--cream-dark)', borderRadius: 6, fontFamily: 'inherit', fontSize: 14, color: 'var(--ink)', outline: 'none', background: 'white' }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        style={{
          position: 'fixed',
          right: 'calc(env(safe-area-inset-right, 0) + 14px)',
          bottom: 'calc(env(safe-area-inset-bottom, 0) + 14px)',
          zIndex: 9000,
          padding: '9px 14px',
          borderRadius: 999,
          background: 'rgba(26,22,18,.88)',
          color: 'var(--cream)',
          border: '1px solid rgba(255,255,255,.15)',
          boxShadow: '0 8px 24px rgba(0,0,0,.25)',
          backdropFilter: 'blur(8px)',
          fontFamily: 'inherit',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        💬 Feedback
      </button>

      {open && (
        <>
          <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(10,8,6,.6)', backdropFilter: 'blur(6px)', zIndex: 9500 }} />
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'white',
              borderRadius: 14,
              width: 540,
              maxWidth: '94vw',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: '1.5rem',
              zIndex: 9600,
              boxShadow: '0 24px 64px rgba(0,0,0,.35)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: 'var(--gold)', color: 'var(--ink)', letterSpacing: '.05em' }}>BETA</span>
              <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>Send feedback</div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: '1.25rem', lineHeight: 1.55 }}>
              Bug reports, ideas, praise, anything. We read every message.
            </div>

            {sent ? (
              <>
                <div style={{ padding: '14px 16px', background: 'rgba(74,103,65,.08)', border: '1px solid rgba(74,103,65,.25)', borderRadius: 8, color: 'var(--sage)', fontSize: 14, marginBottom: 12, lineHeight: 1.55 }}>
                  ✓ Thanks — got it. We&apos;ll follow up if we need more details.
                </div>
                <button onClick={close} style={{ width: '100%', padding: '10px', borderRadius: 6, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Close
                </button>
              </>
            ) : (
              <>
                {/* Type picker — pill row. Auto-shows the steps-to-
                    reproduce field when 'Bug' is selected. */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={labelStyle}>What&apos;s this about?</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 6 }}>
                    {TYPE_OPTIONS.map(opt => {
                      const active = type === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setType(opt.value)}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 6,
                            border: `1.5px solid ${active ? 'var(--gold)' : 'var(--cream-dark)'}`,
                            background: active ? 'rgba(196,146,42,.08)' : 'white',
                            fontSize: 13,
                            fontWeight: active ? 600 : 400,
                            color: 'var(--ink)',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            transition: 'all .12s',
                          }}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 6, fontWeight: 300 }}>
                    {TYPE_OPTIONS.find(o => o.value === type)?.helper}
                  </div>
                </div>

                {/* Main message */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={labelStyle}>{type === 'bug' ? 'What went wrong?' : type === 'idea' ? 'What would you like to see?' : type === 'praise' ? 'What did you love?' : 'Tell us more'}</label>
                  <textarea
                    value={msg}
                    onChange={e => setMsg(e.target.value)}
                    rows={4}
                    autoFocus
                    placeholder={
                      type === 'bug'    ? 'e.g. The "Send my picks" button stayed disabled even after I selected a location.'
                      : type === 'idea' ? 'e.g. Bulk-edit photos across multiple portfolio locations at once.'
                      : type === 'praise' ? 'e.g. The Pick page templates look amazing on mobile.'
                      : ''
                    }
                    style={{ ...fieldStyle, resize: 'vertical', minHeight: 90 }}
                  />
                </div>

                {/* Steps-to-reproduce — only when type is bug. Optional
                    but strongly encouraged; preformatted so we can
                    track down the issue without a follow-up. */}
                {type === 'bug' && (
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={labelStyle}>Steps to reproduce <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--ink-soft)' }}>(optional, but huge help)</span></label>
                    <textarea
                      value={stepsToRepro}
                      onChange={e => setStepsToRepro(e.target.value)}
                      rows={4}
                      placeholder={"1. Go to Dashboard\n2. Click '+ New guide'\n3. ..."}
                      style={{ ...fieldStyle, resize: 'vertical', minHeight: 80, fontFamily: 'monospace', fontSize: 13 }}
                    />
                  </div>
                )}

                {/* Contact consent — defaults true so we can follow up.
                    Photographer's email + the page they were on are
                    auto-attached server-side; no need to type them. */}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: '1rem' }} onClick={() => setContactConsent(p => !p)}>
                  <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1, border: `1.5px solid ${contactConsent ? 'var(--gold)' : 'var(--sand)'}`, background: contactConsent ? 'var(--gold)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--ink)', transition: 'all .15s' }}>
                    {contactConsent ? '✓' : ''}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>
                    OK to email me if we have follow-up questions
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, marginTop: 2 }}>
                      We&apos;ll only reach out about this report.
                    </div>
                  </div>
                </label>

                {err && <div style={{ fontSize: 12, color: 'var(--rust)', marginBottom: 10 }}>{err}</div>}
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: 12, lineHeight: 1.5 }}>
                  We&apos;ll auto-attach the page URL, your viewport size, and your browser info so we can reproduce. Your email is included if you&apos;re signed in.
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={submit}
                    disabled={!msg.trim() || sending}
                    style={{ flex: 1, padding: '11px', borderRadius: 6, background: 'var(--ink)', color: 'var(--cream)', border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: msg.trim() && !sending ? 1 : 0.5 }}
                  >
                    {sending ? 'Sending…' : 'Send feedback'}
                  </button>
                  <button onClick={close} style={{ padding: '11px 18px', borderRadius: 6, background: 'white', color: 'var(--ink-soft)', border: '1px solid var(--cream-dark)', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>
  )
}
