'use client'

import Link from 'next/link'
import AppNav from '@/components/AppNav'

// Shown to new photographers right after the initial location-picker step.
// Separate route so we can link back to it from Profile later without
// re-triggering the picker.

const SECTIONS = [
  {
    eyebrow: 'Step 1',
    icon:    '📍',
    title:   'Build your portfolio',
    body:    `Your portfolio is your curated set of locations — the places you actually shoot. Browse the Explore map and save spots you love, or add your own hidden gems with the "+ Add new location" button. Upload your own photos for each so clients see *your* work, not generic Google shots.`,
    bullets: [
      `Add as many as you want — they live privately to your account.`,
      `Upload the real photos from your sessions. Clients trust photographer work more than stock imagery.`,
      `Edit notes, access details, and parking info so you’re not answering the same questions every shoot.`,
    ],
    cta:     { href: '/explore', label: 'Browse the map →' },
  },
  {
    eyebrow: 'Step 2',
    icon:    '🔗',
    title:   'Send a session share link',
    body:    `When a client books a specific session, create a one-off share link from /share. Pick which locations from your portfolio to show them, drop a pin if they’re traveling to you, and send the link over text or email. They tap one spot, enter their name + email, and you get notified instantly.`,
    bullets: [
      `Set a radius so they only see locations within X miles of the pin.`,
      `Write a custom message so the link feels personal.`,
      `Expires after a set date if you want, or leave it open-ended.`,
    ],
    cta:     { href: '/share', label: 'Try creating one →' },
  },
  {
    eyebrow: 'Step 3',
    icon:    '📚',
    title:   'Build a Location Guide for each city or theme',
    body:    `A Location Guide is a mini-portfolio for one city or shoot style — one reusable link you send every client booking that kind of session. Photographers who shoot in multiple areas make a guide per city: a "Kansas City Guide," an "Overland Park Guide," a "Downtown St. Joseph Guide." Photographers who shoot different session types make one per theme: a "Golden Hour Guide," an "Indoor Studio Guide," a "Family Sessions Guide."`,
    bullets: [
      `🔗 Share entire portfolio — one auto-syncing link with everything you shoot. Perfect if your whole portfolio fits one region.`,
      `🧭 Multi-location link — same auto-sync, but lets clients pick 2+ spots with an optional "max miles apart" cap so they stay inside your session window.`,
      `📚 Custom guide — hand-pick a subset of your portfolio (e.g. just your Kansas City locations) and reuse the link across every KC client.`,
    ],
    cta:     { href: '/dashboard', label: 'Create your first guide →' },
  },
  {
    eyebrow: 'Step 4',
    icon:    '⚙',
    title:   'Wire your guides into HoneyBook, Dubsado, or any booking tool',
    body:    `Every Location Guide is just a URL — which means it drops into anything. Put the city-specific guide in your HoneyBook project page for that session, link it from a Dubsado workflow email, or stick it in your Calendly confirmation. When a client picks, you get an email and they show up in your dashboard.`,
    bullets: [
      `Embed in HoneyBook: Project → Files & Links → paste the URL.`,
      `Dubsado: add to an email template or questionnaire as a button.`,
      `Calendly / Acuity: paste into the confirmation email or intake form.`,
      `A custom domain (e.g. locations.yourstudio.com) is supported — set it in Profile.`,
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
            A quick tour of the three things that matter — your portfolio, share links, and how to plug this into the booking tools you already use.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {SECTIONS.map((s, i) => (
            <div key={i} style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-dark)', padding: '1.5rem 1.5rem 1.75rem', boxShadow: '0 2px 8px rgba(26,22,18,.04)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--gold)' }}>{s.eyebrow}</span>
                <span style={{ fontSize: 22 }}>{s.icon}</span>
              </div>
              <h2 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 24, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2, marginBottom: 10 }}>
                {s.title}
              </h2>
              <p style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.7, marginBottom: s.bullets.length > 0 ? 12 : 0 }}>
                {s.body}
              </p>
              {s.bullets.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {s.bullets.map((b, j) => (
                    <li key={j} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: 'var(--ink)', fontWeight: 400, lineHeight: 1.65 }}>
                      <span style={{ flexShrink: 0, width: 5, height: 5, borderRadius: '50%', background: 'var(--gold)', marginTop: 9 }} />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
              {s.cta && (
                <div style={{ marginTop: 14 }}>
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
