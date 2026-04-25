'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Inline upgrade prompt shown wherever a free photographer hits a Pro
// feature. Two visual variants:
//   - 'card'   — full-width card with description + dual cadence buttons
//                (use as a section block / empty state)
//   - 'inline' — compact one-line nudge with a single Upgrade button
//                (use inside existing sections without dominating them)
//
// The Upgrade button kicks straight to Stripe Checkout for the chosen
// cadence — same flow as the Profile → Billing tab. On success the user
// lands back on /profile#billing with a confirmation toast.

interface Props {
  feature: string                 // human-readable name of the locked feature, e.g. "permit info"
  description?: string            // optional longer copy for the card variant
  variant?: 'card' | 'inline'
  className?: string
}

export default function UpgradePrompt({ feature, description, variant = 'card', className }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function startCheckout(cadence: 'monthly' | 'yearly') {
    setError(null); setBusy(true)
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
        body: JSON.stringify({ cadence }),
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
    } finally { setBusy(false) }
  }

  if (variant === 'inline') {
    return (
      <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(196,146,42,.08)', border: '1px solid rgba(196,146,42,.25)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 500 }}>⭐ {feature} is a Pro feature</span>
        <button onClick={() => startCheckout('monthly')} disabled={busy} style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 12, fontWeight: 500, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Loading…' : 'Upgrade — $12/mo'}
        </button>
        {error && <span style={{ fontSize: 11, color: 'var(--rust)', flex: '1 0 100%' }}>{error}</span>}
      </div>
    )
  }

  return (
    <div className={className} style={{ padding: '1.25rem 1.25rem 1.5rem', background: 'white', border: '1px solid rgba(196,146,42,.35)', borderRadius: 10, boxShadow: '0 2px 10px rgba(196,146,42,.05)' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999, background: 'rgba(196,146,42,.12)', color: 'var(--gold)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>
        ⭐ Pro feature
      </div>
      <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
        Unlock {feature}
      </div>
      {description && (
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.6, margin: '0 0 1rem' }}>
          {description}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => startCheckout('monthly')} disabled={busy} style={{ padding: '10px 20px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Loading…' : 'Upgrade — $12/month'}
        </button>
        <button onClick={() => startCheckout('yearly')} disabled={busy} style={{ padding: '10px 20px', borderRadius: 4, background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--sand)', fontSize: 13, fontWeight: 500, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>
          Yearly — save $24
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 10, fontWeight: 300 }}>
        Cancel anytime · Secure checkout via Stripe
      </div>
      {error && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--rust)' }}>{error}</div>}
    </div>
  )
}
