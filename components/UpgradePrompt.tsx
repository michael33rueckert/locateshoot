'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Inline upgrade prompt shown wherever a free photographer hits a paid
// feature. Two visual variants:
//   - 'card'   — full-width card with both Starter + Pro side-by-side,
//                each listing its features and its own checkout button
//                (use as a section block / cap-hit prompt)
//   - 'inline' — compact one-line nudge with a single Upgrade button
//                (use inside existing sections without dominating them)
//
// The Upgrade buttons kick straight to Stripe Checkout for the chosen
// tier + cadence — same flow as the Profile → Billing tab. On success
// the user lands back on /profile#billing with a confirmation toast.

type Tier = 'starter' | 'pro'
type CurrentPlan = 'free' | 'starter' | 'pro'

interface Props {
  feature: string                 // human-readable name of the locked feature, e.g. "unlimited portfolio locations"
  description?: string            // optional longer copy above the plan cards
  variant?: 'card' | 'inline'
  className?: string
  // The viewer's current plan. 'free' shows both Starter + Pro side-
  // by-side. 'starter' shows only Pro (Starter is already what they
  // have). 'pro' shouldn't render this component at all — caller bug.
  // Defaults to 'free' for backwards compat with older callers.
  currentPlan?: CurrentPlan
}

const STARTER_FEATURES = [
  'Everything in Free',
  'Unlimited Location Guides',
  'Unlimited portfolio locations',
  '✉ Client confirmation email with directions',
  '📊 Share analytics — views & time spent',
  '📌 Pinterest & blog post links per location',
  '📋 Permit info fields on each location',
]

const PRO_FEATURES = [
  'Everything in Starter',
  '🌐 Custom domain for your Location Guides',
  '🎨 White-label pages with your own logo',
  '🖌 Customizable Location Guide templates',
  'Layout, font & color editor',
]

export default function UpgradePrompt({ feature, description, variant = 'card', className, currentPlan = 'free' }: Props) {
  const showStarter = currentPlan === 'free'
  const router = useRouter()
  const [busyTier, setBusyTier] = useState<Tier | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Yearly toggle so the photographer can see the yearly discount and
  // pick the cadence in one step. Defaults to monthly to match the
  // marketing pricing section on the home page.
  const [yearly, setYearly] = useState(false)

  async function startCheckout(tier: Tier, cadence: 'monthly' | 'yearly') {
    setError(null); setBusyTier(tier)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        // Anonymous viewer (e.g. a client looking at a free photographer's
        // share page) shouldn't see this prompt at all — but fall back to
        // sending them to the marketing pricing section just in case.
        router.push('/#pricing')
        return
      }
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ tier, cadence }),
      })
      const data = await res.json()
      if (data.alreadyPro) {
        router.refresh(); return
      }
      if (!res.ok || !data.url) {
        setError(data.message ?? 'Could not start checkout.')
        return
      }
      window.location.href = data.url
    } finally { setBusyTier(null) }
  }

  if (variant === 'inline') {
    return (
      <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(196,146,42,.08)', border: '1px solid rgba(196,146,42,.25)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 500 }}>⭐ {feature} is a paid feature</span>
        <button onClick={() => startCheckout('starter', 'monthly')} disabled={busyTier !== null} style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 12, fontWeight: 500, cursor: busyTier ? 'default' : 'pointer', fontFamily: 'inherit', opacity: busyTier ? 0.6 : 1 }}>
          {busyTier ? 'Loading…' : 'Upgrade — $12/mo'}
        </button>
        {error && <span style={{ fontSize: 11, color: 'var(--rust)', flex: '1 0 100%' }}>{error}</span>}
      </div>
    )
  }

  const starterPrice = yearly ? '$10' : '$12'
  const proPrice     = yearly ? '$21' : '$25'

  return (
    <div className={className} style={{ padding: '1.25rem 1.25rem 1.5rem', background: 'white', border: '1px solid rgba(196,146,42,.35)', borderRadius: 10, boxShadow: '0 2px 10px rgba(196,146,42,.05)' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999, background: 'rgba(196,146,42,.12)', color: 'var(--gold)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>
        ⭐ Upgrade to unlock
      </div>
      <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
        Unlock {feature}
      </div>
      {description && (
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.6, margin: '0 0 1rem' }}>
          {description}
        </p>
      )}

      {/* Monthly/yearly toggle — both plan cards reflect the choice. */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '4px 10px', borderRadius: 999, background: 'var(--cream)', border: '1px solid var(--cream-dark)', marginBottom: '1rem', cursor: 'pointer' }} onClick={() => setYearly(p => !p)}>
        <span style={{ fontSize: 12, color: !yearly ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: !yearly ? 600 : 400 }}>Monthly</span>
        <div style={{ width: 32, height: 18, borderRadius: 10, background: yearly ? 'var(--gold)' : 'var(--ink)', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
          <div style={{ position: 'absolute', top: 2, left: yearly ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: 'white', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
        </div>
        <span style={{ fontSize: 12, color: yearly ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: yearly ? 600 : 400 }}>
          Yearly <span style={{ fontSize: 10, color: 'var(--sage)', fontWeight: 700, marginLeft: 2 }}>Save ~16%</span>
        </span>
      </div>

      {/* Plan cards — Starter + Pro side-by-side on desktop, stacked on
          mobile. Each card lists its key features and has its own
          checkout button so the photographer doesn't have to scroll
          back to a marketing page to compare. Starter card is hidden
          when the viewer is already on Starter (Pro-only upgrade).
          When only Pro renders, the grid auto-fits it to a single
          centered column with a sensible max width so it doesn't
          stretch absurdly wide. */}
      <div style={{ display: 'grid', gridTemplateColumns: showStarter ? 'repeat(auto-fit, minmax(220px, 1fr))' : 'minmax(0, 360px)', gap: 12 }}>
        {/* Starter */}
        {showStarter && (
        <div style={{ padding: '1rem', border: '1.5px solid var(--gold)', borderRadius: 8, background: 'rgba(196,146,42,.03)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--gold)' }}>Starter</div>
            <span style={{ padding: '1px 7px', borderRadius: 20, fontSize: 9, fontWeight: 700, background: 'var(--gold)', color: 'var(--ink)', letterSpacing: '.04em' }}>POPULAR</span>
          </div>
          <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 28, fontWeight: 900, color: 'var(--ink)', lineHeight: 1, marginBottom: 2 }}>
            {starterPrice}<span style={{ fontSize: 14, fontWeight: 400, color: 'var(--ink-soft)' }}>/mo</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: 12 }}>
            {yearly ? 'Billed $120/year' : 'Billed monthly'} · cancel anytime
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', flex: 1 }}>
            {STARTER_FEATURES.map(f => (
              <li key={f} style={{ display: 'grid', gridTemplateColumns: '14px 1fr', gap: 6, fontSize: 12, color: 'var(--ink-mid)', padding: '3px 0', lineHeight: 1.4, alignItems: 'start' }}>
                <span style={{ color: 'var(--sage)', fontWeight: 700 }}>✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <button onClick={() => startCheckout('starter', yearly ? 'yearly' : 'monthly')} disabled={busyTier !== null} style={{ width: '100%', padding: '10px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 13, fontWeight: 600, cursor: busyTier ? 'default' : 'pointer', fontFamily: 'inherit', opacity: busyTier === 'starter' ? 0.6 : 1 }}>
            {busyTier === 'starter' ? 'Loading…' : 'Start with Starter'}
          </button>
        </div>
        )}

        {/* Pro */}
        <div style={{ padding: '1rem', border: '1.5px solid var(--cream-dark)', borderRadius: 8, background: 'white', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--gold)', marginBottom: 4 }}>Pro</div>
          <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 28, fontWeight: 900, color: 'var(--ink)', lineHeight: 1, marginBottom: 2 }}>
            {proPrice}<span style={{ fontSize: 14, fontWeight: 400, color: 'var(--ink-soft)' }}>/mo</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: 12 }}>
            {yearly ? 'Billed $250/year' : 'Billed monthly'} · 14-day free trial
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', flex: 1 }}>
            {PRO_FEATURES.map(f => (
              <li key={f} style={{ display: 'grid', gridTemplateColumns: '14px 1fr', gap: 6, fontSize: 12, color: 'var(--ink-mid)', padding: '3px 0', lineHeight: 1.4, alignItems: 'start' }}>
                <span style={{ color: 'var(--sage)', fontWeight: 700 }}>✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <button onClick={() => startCheckout('pro', yearly ? 'yearly' : 'monthly')} disabled={busyTier !== null} style={{ width: '100%', padding: '10px', borderRadius: 4, background: 'var(--ink)', color: 'var(--cream)', border: 'none', fontSize: 13, fontWeight: 600, cursor: busyTier ? 'default' : 'pointer', fontFamily: 'inherit', opacity: busyTier === 'pro' ? 0.6 : 1 }}>
            {busyTier === 'pro' ? 'Loading…' : 'Start 14-day Pro trial'}
          </button>
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 12, fontWeight: 300 }}>
        Cancel anytime · Secure checkout via Stripe
      </div>
      {error && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--rust)' }}>{error}</div>}
    </div>
  )
}
