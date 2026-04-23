'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import AddressSearch, { type AddressResult } from '@/components/AddressSearch'

// Shared "add to portfolio" modal. Uses the AddressSearch geocoder to set
// coords and auto-fills name/city/state from the first few parts of the
// result label. Mounted from the Dashboard and from /portfolio.

export default function AddPortfolioLocationModal({
  userId, onClose, onCreated,
}: {
  userId: string; onClose: () => void; onCreated: () => void
}) {
  const [name,    setName]    = useState('')
  const [city,    setCity]    = useState('')
  const [state,   setState]   = useState('')
  const [desc,    setDesc]    = useState('')
  const [access,  setAccess]  = useState<'public'|'private'>('public')
  const [isSecret,setIsSecret]= useState(false)
  const [pin,     setPin]     = useState<AddressResult | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState('')

  function onAddr(r: AddressResult) {
    setPin(r)
    const parts = (r.label ?? '').split(',').map(s => s.trim()).filter(Boolean)
    if (!name.trim() && parts[0]) setName(parts[0])
    if (!city.trim() && parts[1]) setCity(parts[1])
    if (!state.trim() && parts[2]) setState(parts[2].split(' ')[0])
  }

  async function create() {
    if (!name.trim()) { setErr('Name is required.'); return }
    if (!pin)         { setErr('Search for a location to set coordinates.'); return }
    setSaving(true); setErr('')
    const { error } = await supabase.from('portfolio_locations').insert({
      user_id:            userId,
      source_location_id: null,
      name:               name.trim(),
      description:        desc.trim() || null,
      city:               city.trim() || null,
      state:              state.trim() || null,
      latitude:           pin.lat,
      longitude:          pin.lng,
      access_type:        access,
      is_secret:          isSecret,
    })
    setSaving(false)
    if (error) { setErr(error.message); return }
    onCreated()
  }

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 5 }
  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--cream-dark)', borderRadius: 4, fontFamily: 'var(--font-dm-sans),sans-serif', fontSize: 14, color: 'var(--ink)', background: 'white', outline: 'none' }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,.7)', backdropFilter: 'blur(4px)', zIndex: 900 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'white', borderRadius: 16, width: 540, maxWidth: '92vw', maxHeight: '92vh', overflowY: 'auto', zIndex: 1000, boxShadow: '0 24px 64px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem', gap: 12 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 3 }}>+ Add new portfolio location</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300 }}>Lives in your portfolio only — not added to the public Explore map.</div>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--cream-dark)', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Search for the location *</label>
            <AddressSearch onSelect={onAddr} placeholder="Try 'Loose Park Kansas City' or a full address…" />
            {pin && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', borderRadius: 6, marginTop: 8, background: 'rgba(74,103,65,.08)', border: '1px solid rgba(74,103,65,.2)', fontSize: 13, color: 'var(--sage)' }}>
                <span>📍</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>Pinned</div>
                  <div style={{ fontSize: 11, fontWeight: 300, color: 'var(--ink-soft)', marginTop: 1 }}>{pin.shortLabel ?? pin.label}</div>
                </div>
                <button onClick={() => setPin(null)} style={{ fontSize: 11, color: 'var(--rust)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Clear</button>
              </div>
            )}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="e.g. The Willow Bend Overlook" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '1rem' }}>
            <div>
              <label style={labelStyle}>City</label>
              <input value={city} onChange={e => setCity(e.target.value)} style={inputStyle} placeholder="Kansas City" />
            </div>
            <div>
              <label style={labelStyle}>State</label>
              <input value={state} onChange={e => setState(e.target.value)} style={inputStyle} placeholder="MO" />
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Description</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="What's special about this spot?" />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Access</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['public','private'] as const).map(opt => (
                <button key={opt} onClick={() => setAccess(opt)} style={{ flex: 1, padding: '8px 12px', borderRadius: 4, fontSize: 13, fontWeight: 500, border: `1px solid ${access === opt ? 'var(--gold)' : 'var(--cream-dark)'}`, background: access === opt ? 'rgba(196,146,42,.08)' : 'white', color: access === opt ? 'var(--gold)' : 'var(--ink-soft)', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {opt === 'public' ? '● Public' : '🔒 Private'}
                </button>
              ))}
            </div>
          </div>

          <div onClick={() => setIsSecret(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, marginBottom: '1.25rem', cursor: 'pointer', background: isSecret ? 'rgba(124,92,191,.05)' : 'var(--cream)', border: `1px solid ${isSecret ? 'rgba(124,92,191,.3)' : 'var(--cream-dark)'}` }}>
            <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${isSecret ? '#7c5cbf' : 'var(--sand)'}`, background: isSecret ? '#7c5cbf' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white' }}>{isSecret ? '✓' : ''}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>Mark as secret</div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, marginTop: 2 }}>Shown on share links with only a general area — exact coords stay private.</div>
            </div>
          </div>

          {err && <div style={{ padding: '8px 12px', background: 'rgba(181,75,42,.08)', border: '1px solid rgba(181,75,42,.2)', borderRadius: 6, fontSize: 13, color: 'var(--rust)', marginBottom: '1rem' }}>{err}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={create} disabled={saving || !name.trim() || !pin} style={{ flex: 1, padding: '12px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: saving || !name.trim() || !pin ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Add to portfolio'}
            </button>
            <button onClick={onClose} style={{ padding: '12px 20px', borderRadius: 4, background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--sand)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          </div>
        </div>
      </div>
    </>
  )
}
