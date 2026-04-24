'use client'

import { useState } from 'react'

// Configures max_picks + max_pick_distance_miles for a new auto-syncing
// full-portfolio share link. Used from both the Dashboard and /portfolio.
export default function MultiLocationModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (settings: { maxPicks: number; maxMiles: number | null }) => Promise<void>
}) {
  const [maxPicks, setMaxPicks] = useState(2)
  const [maxMiles, setMaxMiles] = useState<string>('5')
  const [saving, setSaving]     = useState(false)

  async function submit() {
    const mi = parseFloat(maxMiles)
    const parsedMiles = Number.isFinite(mi) && mi > 0 ? mi : null
    setSaving(true)
    try { await onCreate({ maxPicks, maxMiles: parsedMiles }) }
    finally { setSaving(false) }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,.6)', backdropFilter: 'blur(6px)', zIndex: 1000 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'white', borderRadius: 16, width: 460, maxWidth: '94vw', padding: '1.75rem', zIndex: 1001, boxShadow: '0 24px 64px rgba(0,0,0,.3)' }}>
        <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>🧭 Multi-location link</div>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.55, marginBottom: '1.25rem' }}>
          Auto-syncs with your full portfolio. Lets clients pick more than one location — enforce a max distance between picks so they stay within your session window.
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 6 }}>
            Client can pick up to
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => setMaxPicks(n)}
                style={{ padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: `1.5px solid ${maxPicks === n ? 'var(--gold)' : 'var(--cream-dark)'}`, background: maxPicks === n ? 'rgba(196,146,42,.12)' : 'white', color: maxPicks === n ? 'var(--gold)' : 'var(--ink-soft)' }}>
                {n} locations
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 6 }}>
            Max distance between picks (miles)
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              min={0}
              step={0.5}
              value={maxMiles}
              onChange={e => setMaxMiles(e.target.value)}
              placeholder="e.g. 5"
              style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--cream-dark)', borderRadius: 6, fontFamily: 'inherit', fontSize: 14, color: 'var(--ink)', outline: 'none' }}
            />
            <button onClick={() => setMaxMiles('')} style={{ padding: '9px 12px', borderRadius: 6, border: '1px solid var(--cream-dark)', background: 'white', fontSize: 12, color: 'var(--ink-soft)', fontFamily: 'inherit', cursor: 'pointer' }}>No limit</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 6, fontStyle: 'italic' }}>
            Leave blank for no cap. For a 1-hour session, 3–5 miles is typical.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={submit} disabled={saving} style={{ flex: 1, padding: '12px', borderRadius: 6, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Creating…' : `Create & copy ${maxPicks}-location link`}
          </button>
          <button onClick={onClose} disabled={saving} style={{ padding: '12px 18px', borderRadius: 6, background: 'white', color: 'var(--ink-soft)', border: '1px solid var(--cream-dark)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
        </div>
      </div>
    </>
  )
}
