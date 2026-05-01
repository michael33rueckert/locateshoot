'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import type { HelpArticleMeta } from '@/lib/help'

interface Props {
  articles:   HelpArticleMeta[]
  categories: string[]   // canonical category order
}

export default function HelpIndexClient({ articles, categories }: Props) {
  const router = useRouter()
  // Auth gate — the help center is for signed-in photographers only.
  // We check session on mount and bounce anonymous visitors to home
  // so a leaked /help URL doesn't expose internal product docs.
  // null = unknown (loading), false = anon, true = signed in.
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) { router.replace('/'); return }
      setSignedIn(true)
    })
  }, [router])

  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return articles
    return articles.filter(a =>
      a.title.toLowerCase().includes(q)
      || a.summary.toLowerCase().includes(q)
      || a.category.toLowerCase().includes(q)
    )
  }, [articles, query])

  // Group filtered articles by category in the canonical order. Any
  // category not in `categories` lands at the end alphabetically.
  const groups = useMemo(() => {
    const map = new Map<string, HelpArticleMeta[]>()
    for (const a of filtered) {
      const list = map.get(a.category) ?? []
      list.push(a)
      map.set(a.category, list)
    }
    const known = categories.filter(c => map.has(c)).map(c => [c, map.get(c)!] as const)
    const extras = [...map.keys()].filter(c => !categories.includes(c)).sort().map(c => [c, map.get(c)!] as const)
    return [...known, ...extras]
  }, [filtered, categories])

  // While we don't know if the visitor is signed in, render a spinner
  // — prevents the help content from flashing before the redirect
  // fires for anonymous URLs.
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

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--gold)', marginBottom: 8 }}>Help center</div>
          <h1 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 'clamp(28px,5vw,38px)', fontWeight: 800, color: 'var(--ink)', margin: '0 0 8px', lineHeight: 1.15 }}>
            How can we help?
          </h1>
          <p style={{ fontSize: 15, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.6, margin: 0 }}>
            Walkthroughs, feature guides, and answers to the most common questions. Use the search below or browse by category.
          </p>
        </div>

        {/* Search bar — client-side, filters across title + summary +
            category. No fuzzy matching for now; substring is enough
            for a small article set. The AI assistant lives in the
            floating ✨ Help button (bottom-right) so visitors who
            want chat have it without it dominating this index. */}
        <div style={{ position: 'relative', marginBottom: '2rem' }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search articles…"
            style={{
              width: '100%',
              padding: '14px 44px 14px 16px',
              border: '1px solid var(--cream-dark)',
              borderRadius: 8,
              fontFamily: 'inherit',
              fontSize: 15,
              outline: 'none',
              color: 'var(--ink)',
              background: 'white',
              boxShadow: '0 2px 6px rgba(26,22,18,.04)',
            }}
          />
          {query
            ? <button onClick={() => setQuery('')} aria-label="Clear search" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--ink-soft)', lineHeight: 1, padding: 0 }}>✕</button>
            : <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 15, color: 'var(--ink-soft)', pointerEvents: 'none' }}>🔍</span>}
        </div>

        {/* Empty state — both "no articles at all" and "search returned
            nothing" get a friendly empty card. */}
        {groups.length === 0 ? (
          <div style={{ background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10, padding: '2.5rem 1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.4 }}>📭</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
              {query ? `No articles match "${query}"` : 'No help articles yet'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.6, maxWidth: 400, margin: '0 auto' }}>
              {query
                ? 'Try a different keyword, or browse the categories.'
                : 'Articles will show up here as they’re written.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {groups.map(([category, list]) => (
              <section key={category}>
                <h2 style={{
                  fontFamily: 'var(--font-playfair),serif',
                  fontSize: 18,
                  fontWeight: 700,
                  color: 'var(--ink)',
                  margin: '0 0 12px',
                }}>
                  {category}
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: 'var(--ink-soft)' }}>({list.length})</span>
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {list.map(a => (
                    <Link
                      key={a.slug}
                      href={`/help/${a.slug}`}
                      style={{
                        display: 'block',
                        padding: '14px 16px',
                        background: 'white',
                        border: '1px solid var(--cream-dark)',
                        borderRadius: 8,
                        textDecoration: 'none',
                        transition: 'border-color .15s, box-shadow .15s',
                      }}
                    >
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
                        {a.title}
                      </div>
                      {a.summary && (
                        <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.55 }}>
                          {a.summary}
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <div style={{ marginTop: '3rem', padding: '1.25rem', background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10, textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>Can&apos;t find what you&apos;re looking for?</div>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.6 }}>
            Tap the <strong>Feedback</strong> button at the bottom-right of any signed-in page and we&apos;ll get back to you.
          </div>
        </div>
      </div>
    </div>
  )
}
