'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

// Global feedback capture. Mounted in the root layout so every page has a small
// tab at the bottom-right that opens a modal. Submissions POST to /api/feedback
// which emails feedback@locateshoot.com.

export default function FeedbackButton() {
  const [open,    setOpen]    = useState(false)
  const [msg,     setMsg]     = useState('')
  const [sending, setSending] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [err,     setErr]     = useState('')

  async function submit() {
    if (!msg.trim()) return
    setSending(true); setErr('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          message: msg.trim(),
          pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        }),
      })
      if (!res.ok) { setErr('Could not send right now — please try again in a moment.'); return }
      setSent(true); setMsg('')
    } catch { setErr('Network error — please try again.') }
    finally { setSending(false) }
  }

  function close() {
    setOpen(false)
    // Reset transient state so the next open is fresh.
    setTimeout(() => { setSent(false); setErr('') }, 250)
  }

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
              width: 440,
              maxWidth: '94vw',
              padding: '1.5rem',
              zIndex: 9600,
              boxShadow: '0 24px 64px rgba(0,0,0,.35)',
            }}
          >
            <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
              💬 Send feedback
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: '1rem', lineHeight: 1.55 }}>
              Bug reports, feature ideas, or anything else — our team reads every message and will follow up if needed.
            </div>

            {sent ? (
              <>
                <div style={{ padding: '12px 14px', background: 'rgba(74,103,65,.08)', border: '1px solid rgba(74,103,65,.25)', borderRadius: 8, color: 'var(--sage)', fontSize: 13, marginBottom: 12 }}>
                  ✓ Thanks — got it.
                </div>
                <button onClick={close} style={{ width: '100%', padding: '10px', borderRadius: 6, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Close
                </button>
              </>
            ) : (
              <>
                <textarea
                  value={msg}
                  onChange={e => setMsg(e.target.value)}
                  rows={5}
                  autoFocus
                  placeholder="What's on your mind?"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--cream-dark)', borderRadius: 6, fontFamily: 'inherit', fontSize: 14, color: 'var(--ink)', outline: 'none', resize: 'vertical', marginBottom: 10 }}
                />
                {err && <div style={{ fontSize: 12, color: 'var(--rust)', marginBottom: 8 }}>{err}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={submit}
                    disabled={!msg.trim() || sending}
                    style={{ flex: 1, padding: '10px', borderRadius: 6, background: 'var(--ink)', color: 'var(--cream)', border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: msg.trim() && !sending ? 1 : 0.5 }}
                  >
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                  <button onClick={close} style={{ padding: '10px 16px', borderRadius: 6, background: 'white', color: 'var(--ink-soft)', border: '1px solid var(--cream-dark)', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer' }}>
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
