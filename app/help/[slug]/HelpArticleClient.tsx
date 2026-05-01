'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import type { HelpArticle } from '@/lib/help'

interface Props {
  article: HelpArticle
}

export default function HelpArticleClient({ article }: Props) {
  const router = useRouter()
  // Same auth gate as the help index — direct URLs to articles
  // shouldn't render for anonymous visitors either.
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) { router.replace('/'); return }
      setSignedIn(true)
    })
  }, [router])

  const [vote, setVote] = useState<'up' | 'down' | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function sendFeedback(v: 'up' | 'down') {
    if (vote || submitting) return
    setSubmitting(true)
    setVote(v)
    // Fire-and-forget — if the request fails the UI still shows
    // their vote since most users don't notice silent failures and
    // the alternative (rolling back) feels worse than a missed log.
    try {
      await fetch('/api/help-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: article.slug, vote: v }),
      })
    } catch {
      // Non-fatal. The vote is purely a signal for us; missing one
      // submission isn't worth alarming the reader.
    }
    setSubmitting(false)
  }

  if (signedIn !== true) {
    return (
      <div style={{ minHeight: '100svh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid rgba(0,0,0,.1)', borderTop: '2px solid var(--gold)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100svh', background: 'var(--cream)' }}>
      <AppNav />

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '1.5rem 1.25rem 4rem' }}>
        {/* Breadcrumb back to the index */}
        <Link href="/help" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-soft)', textDecoration: 'none', marginBottom: '1.5rem' }}>
          ← Back to help center
        </Link>

        <article>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--gold)', marginBottom: 8 }}>
            {article.category}
          </div>
          <h1 style={{
            fontFamily: 'var(--font-playfair),serif',
            fontSize: 'clamp(26px,5vw,34px)',
            fontWeight: 800,
            color: 'var(--ink)',
            margin: '0 0 10px',
            lineHeight: 1.2,
          }}>
            {article.title}
          </h1>
          {article.summary && (
            <p style={{ fontSize: 15, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.6, margin: '0 0 1.5rem' }}>
              {article.summary}
            </p>
          )}
          {article.updated && (
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: '1.75rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--cream-dark)' }}>
              Last updated: {article.updated}
            </div>
          )}

          {/* Markdown body. The custom components apply our
              typography to the standard tags ReactMarkdown emits so
              the article reads like the rest of the site instead of
              browser defaults. */}
          <div className="help-article-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1:     ({ children }) => <h2 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: '2rem 0 0.75rem', lineHeight: 1.25 }}>{children}</h2>,
                h2:     ({ children }) => <h2 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 19, fontWeight: 700, color: 'var(--ink)', margin: '1.75rem 0 0.6rem', lineHeight: 1.3 }}>{children}</h2>,
                h3:     ({ children }) => <h3 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: '1.25rem 0 0.5rem', lineHeight: 1.3 }}>{children}</h3>,
                p:      ({ children }) => <p style={{ fontSize: 15, color: 'var(--ink)', fontWeight: 300, lineHeight: 1.7, margin: '0 0 1rem' }}>{children}</p>,
                ul:     ({ children }) => <ul style={{ fontSize: 15, color: 'var(--ink)', fontWeight: 300, lineHeight: 1.7, margin: '0 0 1rem', paddingLeft: '1.5rem' }}>{children}</ul>,
                ol:     ({ children }) => <ol style={{ fontSize: 15, color: 'var(--ink)', fontWeight: 300, lineHeight: 1.7, margin: '0 0 1rem', paddingLeft: '1.5rem' }}>{children}</ol>,
                li:     ({ children }) => <li style={{ marginBottom: 6 }}>{children}</li>,
                strong: ({ children }) => <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{children}</strong>,
                em:     ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
                a:      ({ href, children }) => (
                  <a href={href} style={{ color: 'var(--gold)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                    {children}
                  </a>
                ),
                code:   ({ children }) => <code style={{ background: 'var(--cream-dark)', padding: '1px 6px', borderRadius: 4, fontSize: 13, fontFamily: 'ui-monospace, monospace' }}>{children}</code>,
                blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid var(--gold)', paddingLeft: 14, color: 'var(--ink-soft)', fontStyle: 'italic', margin: '1rem 0' }}>{children}</blockquote>,
                hr:     () => <hr style={{ border: 'none', borderTop: '1px solid var(--cream-dark)', margin: '2rem 0' }} />,
              }}
            >
              {article.body}
            </ReactMarkdown>
          </div>
        </article>

        {/* "Was this helpful?" — tracks signal on what's working and
            what isn't. Records anonymous votes; the API attaches
            user_id when the request includes a Bearer token. */}
        <div style={{ marginTop: '3rem', padding: '1.25rem 1.5rem', background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10 }}>
          {vote
            ? (
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', textAlign: 'center', fontWeight: 300, lineHeight: 1.6 }}>
                Thanks for the feedback. {vote === 'down' && (
                  <>If you have a sec, tap the <strong>Feedback</strong> button at the bottom-right and tell us what was missing.</>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>Was this article helpful?</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => sendFeedback('up')}
                    disabled={submitting}
                    style={{ padding: '7px 16px', borderRadius: 4, border: '1px solid var(--cream-dark)', background: 'white', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)' }}
                  >
                    👍 Yes
                  </button>
                  <button
                    onClick={() => sendFeedback('down')}
                    disabled={submitting}
                    style={{ padding: '7px 16px', borderRadius: 4, border: '1px solid var(--cream-dark)', background: 'white', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)' }}
                  >
                    👎 No
                  </button>
                </div>
              </div>
            )}
        </div>

        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <Link href="/help" style={{ fontSize: 13, color: 'var(--ink-soft)', textDecoration: 'none' }}>
            ← Back to help center
          </Link>
        </div>
      </div>
    </div>
  )
}
