'use client'

import Link from 'next/link'
import AppNav from '@/components/AppNav'

// Shown to new photographers right after the initial location-picker step.
// Separate route so we can link back to it from Profile later without
// re-triggering the picker.
//
// Layout intent: each step is a card with a few short bullet headlines —
// the headlines are what someone skimming will actually read. Smaller
// detail text beneath each bullet adds nuance without burying the lede.

interface Bullet {
  headline: string
  detail:   string
}

const SECTIONS: { eyebrow: string; icon: string; title: string; bullets: Bullet[]; cta?: { href: string; label: string } }[] = [
  {
    eyebrow: 'Step 1',
    icon:    '📍',
    title:   'Build your portfolio',
    bullets: [
      { headline: 'Add the spots you actually shoot.',
        detail:   'Browse the Explore map and save the locations you love, or drop in hidden gems with "+ Add new location".' },
      { headline: 'Upload your real photos for each one.',
        detail:   'Clients trust your work over generic Google shots — and yours are usually better anyway.' },
      { headline: 'Write notes once, save time forever.',
        detail:   'Access details, parking info, best times — so you stop answering the same questions every shoot.' },
    ],
    cta: { href: '/explore', label: 'Browse the map →' },
  },
  {
    eyebrow: 'Step 2',
    icon:    '📚',
    title:   'Bundle locations into Location Guides',
    bullets: [
      { headline: '♾ Save for future use.',
        detail:   'Never expires. Build one per city or theme — "Kansas City Guide", "Golden Hour Guide" — and reuse it for every booking.' },
      { headline: '📅 Expire on a specific date.',
        detail:   'Use when a client has a deadline to make a decision.' },
      { headline: '🔂 Expire after the client picks.',
        detail:   'Single-use. The link burns out the moment they submit.' },
      { headline: '🧭 Let them pick 2+ spots, capped by distance.',
        detail:   'Optional "max miles apart" keeps multi-location sessions inside your shoot window.' },
    ],
    cta: { href: '/location-guides', label: 'Create your first guide →' },
  },
  {
    eyebrow: 'Step 3',
    icon:    '⚙',
    title:   'Wire it into your booking tools',
    bullets: [
      { headline: 'Drop the URL anywhere.',
        detail:   'It\'s just a link. HoneyBook project pages, Dubsado workflow emails, Calendly confirmations — all work.' },
      { headline: 'Get notified the moment they pick.',
        detail:   'Email + push notification on your device. Their selection lands on your dashboard automatically.' },
      { headline: 'Use your own domain if you want.',
        detail:   'Set up locations.yourstudio.com in Profile and your share links use it instead of locateshoot.com.' },
    ],
  },
]

export default function HowItWorksPage() {
  return (
    <div style={{ minHeight: '100svh', background: 'var(--cream)' }}>
      <AppNav />

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '2.5rem 1.5rem 6rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 999, background: 'rgba(196,146,42,.1)', color: 'var(--gold)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14 }}>
            Welcome to LocateShoot
          </div>
          <h1 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 'clamp(28px,5vw,44px)', fontWeight: 900, color: 'var(--ink)', lineHeight: 1.15, marginBottom: 14 }}>
            Here&apos;s how it works
          </h1>
          <p style={{ fontSize: 15, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.65, maxWidth: 520, margin: '0 auto' }}>
            Three things to know — your portfolio, your Location Guides, and how to plug this into the booking tools you already use.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {SECTIONS.map((s, i) => (
            <div key={i} style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-dark)', padding: '1.5rem 1.5rem 1.75rem', boxShadow: '0 2px 8px rgba(26,22,18,.04)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--gold)' }}>{s.eyebrow}</span>
                <span style={{ fontSize: 22 }}>{s.icon}</span>
              </div>
              <h2 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 24, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2, marginBottom: 16 }}>
                {s.title}
              </h2>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {s.bullets.map((b, j) => (
                  <li key={j} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ flexShrink: 0, width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)', marginTop: 9 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4, marginBottom: 3 }}>
                        {b.headline}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.55 }}>
                        {b.detail}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {s.cta && (
                <div style={{ marginTop: 18 }}>
                  <Link href={s.cta.href} style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', textDecoration: 'none' }}>
                    {s.cta.label}
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: '2.5rem' }}>
          <Link href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 32px', borderRadius: 8, background: 'var(--gold)', color: 'var(--ink)', fontSize: 15, fontWeight: 600, textDecoration: 'none', boxShadow: '0 4px 14px rgba(196,146,42,.25)' }}>
            Got it — take me to my dashboard →
          </Link>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, marginTop: 12 }}>
            You can always revisit this guide from the <strong>Getting Started</strong> link at the bottom of the site.
          </div>
        </div>
      </div>
    </div>
  )
}
