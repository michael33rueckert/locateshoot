'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// Conversational help interface that sits above the categorized
// article list on /help. Sends each turn (capped to the last few)
// to /api/help-chat, which calls Gemini under the hood with the
// help-article corpus as the only allowed source. The articles the
// model referenced by title get rendered as a "Sources" pill row
// under the answer so the photographer can read the full context.

interface Source {
  slug:     string
  title:    string
  category: string
}

interface Message {
  id:      number
  role:    'user' | 'model' | 'error'
  content: string
  sources?: Source[]
}

const STARTER_QUESTIONS = [
  'How do I send my first Location Guide?',
  'What\'s the difference between Starter and Pro?',
  'My client said the link doesn\'t work — what do I do?',
  'Can I let clients pick more than one location?',
]

export default function HelpChatPanel() {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const messageIdRef = useRef(0)
  const threadRef = useRef<HTMLDivElement | null>(null)

  // Scroll the thread to the bottom on every new message so the
  // latest turn is visible without manual scrolling.
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  function nextId() {
    messageIdRef.current += 1
    return messageIdRef.current
  }

  async function ask(q: string) {
    const question = q.trim()
    if (!question || busy) return
    setOpen(true)
    setBusy(true)
    setDraft('')

    const userMsg: Message = { id: nextId(), role: 'user', content: question }
    setMessages(prev => [...prev, userMsg])

    // Build the history payload from the in-state messages BEFORE the
    // new user message — the API expects the prior turns and the new
    // question goes in the `question` field separately.
    const history = messages
      .filter(m => m.role === 'user' || m.role === 'model')
      .map(m => ({ role: m.role, content: m.content }))

    let token: string | undefined
    try {
      const { data: { session } } = await supabase.auth.getSession()
      token = session?.access_token
    } catch {
      // Falls through to "unable to chat" below.
    }
    if (!token) {
      setMessages(prev => [...prev, {
        id: nextId(),
        role: 'error',
        content: 'You need to be signed in to use the help assistant.',
      }])
      setBusy(false)
      return
    }

    try {
      const res = await fetch('/api/help-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question, history }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessages(prev => [...prev, {
          id: nextId(),
          role: 'error',
          content: typeof data.message === 'string'
            ? data.message
            : "Sorry, I couldn't reach the assistant. Please try again.",
        }])
      } else {
        setMessages(prev => [...prev, {
          id: nextId(),
          role: 'model',
          content: typeof data.answer === 'string' ? data.answer : '(no answer returned)',
          sources: Array.isArray(data.sources) ? data.sources : undefined,
        }])
      }
    } catch {
      setMessages(prev => [...prev, {
        id: nextId(),
        role: 'error',
        content: "Sorry, the connection dropped. Please try again.",
      }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ background: 'var(--ink)', color: 'var(--cream)', borderRadius: 14, padding: '1.5rem', marginBottom: '2rem', boxShadow: '0 8px 28px rgba(26,22,18,.18)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(196,146,42,.18)', border: '1px solid rgba(196,146,42,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
          ✨
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 17, fontWeight: 700 }}>Ask the help assistant</div>
          <div style={{ fontSize: 11, color: 'rgba(245,240,232,.55)', fontWeight: 300 }}>Powered by AI · Answers come from the help articles below</div>
        </div>
      </div>

      <form
        onSubmit={e => { e.preventDefault(); ask(draft) }}
        style={{ display: 'flex', gap: 8, marginBottom: 12 }}
      >
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="e.g. How do I share a guide with my client?"
          disabled={busy}
          style={{
            flex: 1,
            padding: '11px 14px',
            background: 'rgba(255,255,255,.06)',
            border: '1px solid rgba(255,255,255,.12)',
            borderRadius: 8,
            color: 'var(--cream)',
            fontFamily: 'inherit',
            fontSize: 14,
            outline: 'none',
            opacity: busy ? 0.6 : 1,
          }}
          maxLength={600}
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          style={{
            padding: '11px 18px',
            borderRadius: 8,
            background: 'var(--gold)',
            color: 'var(--ink)',
            border: 'none',
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 600,
            cursor: busy || !draft.trim() ? 'default' : 'pointer',
            opacity: busy || !draft.trim() ? 0.5 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {busy ? 'Thinking…' : 'Ask →'}
        </button>
      </form>

      {/* Starter questions — shown only before any conversation has
          happened. Tapping one fires the question immediately. */}
      {!open && messages.length === 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {STARTER_QUESTIONS.map(q => (
            <button
              key={q}
              onClick={() => ask(q)}
              disabled={busy}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                background: 'rgba(255,255,255,.05)',
                border: '1px solid rgba(255,255,255,.1)',
                color: 'rgba(245,240,232,.75)',
                fontFamily: 'inherit',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Chat thread — only renders after the first question. */}
      {open && messages.length > 0 && (
        <div
          ref={threadRef}
          style={{
            maxHeight: 420,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: '4px 2px',
          }}
        >
          {messages.map(m => (
            <div key={m.id} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '88%',
                padding: '10px 14px',
                borderRadius: 10,
                fontSize: 14,
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                fontWeight: m.role === 'user' ? 500 : 300,
                background: m.role === 'user'
                  ? 'rgba(196,146,42,.15)'
                  : m.role === 'error'
                    ? 'rgba(181,75,42,.18)'
                    : 'rgba(255,255,255,.06)',
                border: m.role === 'user'
                  ? '1px solid rgba(196,146,42,.3)'
                  : m.role === 'error'
                    ? '1px solid rgba(181,75,42,.35)'
                    : '1px solid rgba(255,255,255,.1)',
                color: 'var(--cream)',
              }}>
                {m.content}
                {m.sources && m.sources.length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.08)' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(245,240,232,.5)', marginBottom: 6 }}>
                      Sources
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {m.sources.map(s => (
                        <Link
                          key={s.slug}
                          href={`/help/${s.slug}`}
                          style={{
                            padding: '3px 9px',
                            borderRadius: 999,
                            background: 'rgba(196,146,42,.12)',
                            border: '1px solid rgba(196,146,42,.3)',
                            color: 'var(--gold)',
                            fontSize: 11,
                            fontWeight: 500,
                            textDecoration: 'none',
                          }}
                        >
                          {s.title}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(255,255,255,.06)',
                border: '1px solid rgba(255,255,255,.1)',
                color: 'rgba(245,240,232,.6)',
                fontSize: 13,
                fontStyle: 'italic',
              }}>
                Thinking…
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
