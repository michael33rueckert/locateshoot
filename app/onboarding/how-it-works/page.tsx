'use client'

import { useState } from 'react'
import Link from 'next/link'
import AppNav from '@/components/AppNav'

// Multi-step walkthrough shown to new photographers (and re-visitable from
// the Getting Started link in the footer). Single page, one card visible at
// a time, Next / Back navigation. The opening + closing slides are pitch
// frames — the three middle slides are the actual how-to. Order matters:
// portfolio first (the foundation), then guides (the magic), then booking
// tool integration (where the time savings show up).

interface Bullet { headline: string; detail: string }
interface Step {
  eyebrow?: string
  icon:     string
  title:    string
  pitch?:   string                              // big intro line for pitch slides
  bullets?: Bullet[]
  cta?:     { href: string; label: string }
}

const STEPS: Step[] = [
  {
    icon:    '⏱',
    title:   'Stop the 20-message location chain.',
    pitch:   'Your client picks the spot for their session. You get the email. The shoot is on the calendar. That\'s it — no back-and-forth, no "what about this park?" thread, no Pinterest screenshots at 11pm.',
  },
  {
    eyebrow: 'Step 1',
    icon:    '📍',
    title:   'Build your portfolio of locations.',
    bullets: [
      { headline: 'Save the spots you actually shoot.',
        detail:   'Browse the Explore map and save your favorites, or drop in hidden gems with "+ Add new location".' },
      { headline: 'Upload your real photos.',
        detail:   'Your work over generic Google shots, every time. Clients book what they can see themselves in.' },
      { headline: 'Notes once, reuse forever.',
        detail:   'Parking, access, best light, permit details — write it down and stop answering the same questions every shoot.' },
    ],
    cta: { href: '/explore', label: 'Browse the map →' },
  },
  {
    eyebrow: 'Step 2',
    icon:    '📚',
    title:   'Bundle locations into a Location Guide.',
    bullets: [
      { headline: '♾ Save for future use.',
        detail:   'Never expires. Build one per city or theme — "Kansas City Guide", "Golden Hour Guide" — and reuse it for every booking.' },
      { headline: '📅 Or expire on a date.',
        detail:   'Use when a client has a deadline to make a decision.' },
      { headline: '🔂 Or expire after they pick.',
        detail:   'Single-use. The link burns out the moment the client submits. Great for one-off sessions.' },
      { headline: '🧭 Multi-pick + distance caps.',
        detail:   'Let them pick 2+ spots for multi-location sessions, with an optional "max miles apart" cap.' },
    ],
    cta: { href: '/location-guides', label: 'Create your first guide →' },
  },
  {
    eyebrow: 'Step 3',
    icon:    '🔗',
    title:   'Drop the link in your booking tools.',
    bullets: [
      { headline: 'Anywhere a URL works, the guide works.',
        detail:   'HoneyBook project pages, Dubsado workflow emails, Calendly confirmations, plain text messages — paste and go.' },
      { headline: 'Get notified the moment they pick.',
        detail:   'Email + push notification on your device. The selection lands on your dashboard automatically.' },
      { headline: 'Use your own domain.',
        detail:   'Set up locations.yourstudio.com in Profile and your share links use it instead of locateshoot.com.' },
    ],
    cta: { href: '/profile', label: 'Set up your domain →' },
  },
  {
    icon:    '✨',
    title:   'You\'re set.',
    pitch:   'Build out a few locations, make your first guide, and send it to a client. Your dashboard tracks every pick from here on.',
  },
]

export default function HowItWorksPage() {
  const [idx, setIdx] = useState(0)
  const total   = STEPS.length
  const step    = STEPS[idx]
  const isFirst = idx === 0
  const isLast  = idx === total - 1
  const isPitch = !step.bullets

  return (
    <div style={{ minHeight: '100svh', background: 'var(--cream)', display: 'flex', flexDirection: 'column' }}>
      <AppNav />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 720, width: '100%', margin: '0 auto', padding: '2rem 1.25rem 2rem' }}>
        {/* Eyebrow header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 999, background: 'rgba(196,146,42,.1)', color: 'var(--gold)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em' }}>
            Welcome to LocateShoot
          </div>
        </div>

        {/* Step dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: '1.75rem' }}>
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`Go to step ${i + 1}`}
              style={{
                width: i === idx ? 26 : 8,
                height: 8,
                borderRadius: 8,
                background: i === idx ? 'var(--gold)' : i < idx ? 'rgba(196,146,42,.4)' : 'var(--cream-dark)',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                transition: 'all .2s',
              }}
            />
          ))}
        </div>

        {/* Current step card */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-dark)', padding: '2rem 1.75rem 2.25rem', boxShadow: '0 4px 18px rgba(26,22,18,.06)', marginBottom: '1.5rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            {step.eyebrow && (
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--gold)', marginBottom: 10 }}>
                {step.eyebrow}
              </div>
            )}
            <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 14, filter: 'drop-shadow(0 2px 6px rgba(26,22,18,.08))' }}>{step.icon}</div>
            <h2 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 'clamp(24px,4vw,30px)', fontWeight: 800, color: 'var(--ink)', lineHeight: 1.2, maxWidth: 520, margin: '0 auto' }}>
              {step.title}
            </h2>
          </div>

          {step.pitch && (
            <p style={{ fontSize: 16, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.65, textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
              {step.pitch}
            </p>
          )}

          {step.bullets && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '1rem 0 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {step.bullets.map((b, j) => (
                <li key={j} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)', marginTop: 9 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4, marginBottom: 3 }}>
                      {b.headline}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.55 }}>
                      {b.detail}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {step.cta && (
            <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
              <Link href={step.cta.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--gold)', textDecoration: 'none' }}>
                {step.cta.label}
              </Link>
            </div>
          )}
        </div>

        {/* Nav controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <button
            onClick={() => setIdx(i => Math.max(0, i - 1))}
            disabled={isFirst}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: '1px solid var(--cream-dark)',
              background: 'white',
              color: 'var(--ink-soft)',
              fontSize: 13,
              fontWeight: 500,
              cursor: isFirst ? 'default' : 'pointer',
              fontFamily: 'inherit',
              opacity: isFirst ? 0.4 : 1,
              visibility: isFirst ? 'hidden' : 'visible',
            }}
          >
            ← Back
          </button>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300 }}>
            {idx + 1} of {total}
          </span>
          {isLast ? (
            <Link href="/dashboard" style={{ padding: '12px 24px', borderRadius: 8, background: 'var(--gold)', color: 'var(--ink)', fontSize: 14, fontWeight: 600, textDecoration: 'none', boxShadow: '0 4px 14px rgba(196,146,42,.25)' }}>
              Take me to my dashboard →
            </Link>
          ) : (
            <button
              onClick={() => setIdx(i => Math.min(total - 1, i + 1))}
              style={{
                padding: '12px 24px',
                borderRadius: 8,
                background: 'var(--gold)',
                color: 'var(--ink)',
                border: 'none',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: '0 4px 14px rgba(196,146,42,.25)',
              }}
            >
              {isPitch && isFirst ? 'Get started →' : 'Next →'}
            </button>
          )}
        </div>

        <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, textAlign: 'center', marginTop: '1.25rem' }}>
          Revisit this guide anytime from the <strong>Getting Started</strong> link in the footer.
        </div>
      </div>
    </div>
  )
}
