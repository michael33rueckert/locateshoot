'use client'

import { useState } from 'react'
import AddressSearch, { type AddressResult } from '@/components/AddressSearch'
import MapCoordPicker from '@/components/MapCoordPicker'
import CategoryPicker from '@/components/admin/CategoryPicker'

// Admin-only "Add a new location" modal. Fields mirror LocationEditModal
// so a row created here is fully-formed and doesn't need a follow-up
// edit to be useful on the map. Save is delegated to the caller —
// they're the ones holding the auth token / API path.

export interface NewLocation {
  name:            string
  description:     string | null
  city:            string | null
  state:           string | null
  latitude:        number
  longitude:       number
  category:        string | null
  access_type:     string | null
  tags:            string[] | null
  permit_required: boolean | null
  permit_fee:      string | null
  permit_notes:    string | null
  permit_website:  string | null
  permit_certainty:string | null
  best_time:       string | null
  parking_info:    string | null
  status:          string
  rating:          number | null
  quality_score:   number | null
}

export default function AddLocationModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (loc: NewLocation) => Promise<void>
}) {
  const [f, setF] = useState<Omit<NewLocation, 'latitude' | 'longitude'> & { latitude: number | null; longitude: number | null }>({
    name: '', description: null,
    city: null, state: null,
    latitude: null, longitude: null,
    category: null, access_type: 'public',
    tags: null,
    permit_required: null, permit_fee: null, permit_notes: null,
    permit_website: null, permit_certainty: null,
    best_time: null, parking_info: null,
    status: 'published',
    rating: null, quality_score: 75,
  })
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState<string | null>(null)

  function upd<K extends keyof typeof f>(k: K, v: (typeof f)[K]) { setF(p => ({ ...p, [k]: v })) }

  function onAddr(r: AddressResult) {
    upd('latitude',  r.lat)
    upd('longitude', r.lng)
    const parts = (r.label ?? '').split(',').map(s => s.trim()).filter(Boolean)
    setF(p => ({
      ...p,
      latitude:  r.lat,
      longitude: r.lng,
      name:  p.name  || (parts[0] ?? ''),
      city:  p.city  || (parts[1] ?? null),
      state: p.state || (parts[2]?.split(' ')[0] ?? null),
    }))
  }

  async function handleSave() {
    setErr(null)
    if (!f.name.trim()) { setErr('Name is required.'); return }
    if (f.latitude == null || f.longitude == null || !Number.isFinite(f.latitude) || !Number.isFinite(f.longitude)) {
      setErr('Latitude and longitude are required — search for the address or drop a pin on the map.')
      return
    }
    setSaving(true)
    try {
      await onCreate({ ...f, latitude: f.latitude, longitude: f.longitude } as NewLocation)
    } catch (e: any) {
      setErr(e?.message ?? 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--cream-dark)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, outline: 'none', background: 'white', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 4 }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,.6)', backdropFilter: 'blur(4px)', zIndex: 5000 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'white', borderRadius: 12, width: 640, maxWidth: '94vw', maxHeight: '92svh', overflow: 'hidden', zIndex: 5001, boxShadow: '0 24px 64px rgba(0,0,0,.3)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--cream-dark)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>+ Add location to the map</div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, marginTop: 2 }}>Published on save so it's visible on Explore immediately.</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--cream-dark)', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--ink-soft)', flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ padding: '1rem 1.25rem', overflowY: 'auto', flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

          {/* Address search + map picker — coords are required, so
              this block owns the top of the form to make the flow
              obvious. */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Search address to pre-fill *</label>
            <AddressSearch onSelect={onAddr} placeholder="Try 'Loose Park Kansas City' or a full address…" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Or drop / drag the pin on the map *</label>
            <MapCoordPicker
              lat={f.latitude}
              lng={f.longitude}
              onChange={(la, ln) => setF(p => ({ ...p, latitude: la, longitude: ln }))}
              height={260}
            />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Name *</label>
            <input style={inp} value={f.name} onChange={e => upd('name', e.target.value)} placeholder="e.g. Loose Park Rose Garden" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Description</label>
            <textarea style={{ ...inp, minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }} value={f.description ?? ''} onChange={e => upd('description', e.target.value || null)} placeholder="What makes this a good shoot spot?" />
          </div>

          <div>
            <label style={lbl}>City</label>
            <input style={inp} value={f.city ?? ''} onChange={e => upd('city', e.target.value || null)} />
          </div>
          <div>
            <label style={lbl}>State</label>
            <input style={inp} value={f.state ?? ''} onChange={e => upd('state', e.target.value || null)} />
          </div>

          <div>
            <label style={lbl}>Latitude</label>
            <input style={inp} type="number" step="any" value={f.latitude ?? ''} onChange={e => upd('latitude', e.target.value === '' ? null : parseFloat(e.target.value))} />
          </div>
          <div>
            <label style={lbl}>Longitude</label>
            <input style={inp} type="number" step="any" value={f.longitude ?? ''} onChange={e => upd('longitude', e.target.value === '' ? null : parseFloat(e.target.value))} />
          </div>

          <div>
            <label style={lbl}>Status</label>
            <select style={inp} value={f.status} onChange={e => upd('status', e.target.value)}>
              <option value="published">published</option>
              <option value="pending">pending</option>
              <option value="draft">draft</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Access type</label>
            <select style={inp} value={f.access_type ?? ''} onChange={e => upd('access_type', e.target.value || null)}>
              <option value="">—</option>
              <option value="public">public</option>
              <option value="private">private</option>
            </select>
          </div>

          <div>
            <label style={lbl}>Category</label>
            <CategoryPicker value={f.category} onChange={v => upd('category', v)} />
          </div>
          <div>
            <label style={lbl}>Tags (comma-separated)</label>
            <input style={inp} value={(f.tags ?? []).join(', ')} onChange={e => upd('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))} />
          </div>

          <div>
            <label style={lbl}>Rating</label>
            <input style={inp} type="number" step="0.1" min={0} max={5} value={f.rating ?? ''} onChange={e => upd('rating', e.target.value === '' ? null : parseFloat(e.target.value))} placeholder="0–5" />
          </div>
          <div>
            <label style={lbl}>Quality score</label>
            <input style={inp} type="number" value={f.quality_score ?? ''} onChange={e => upd('quality_score', e.target.value === '' ? null : parseInt(e.target.value, 10))} placeholder="0–100" />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Best time</label>
            <input style={inp} value={f.best_time ?? ''} onChange={e => upd('best_time', e.target.value || null)} placeholder="e.g. Golden hour, weekday mornings" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Parking info</label>
            <input style={inp} value={f.parking_info ?? ''} onChange={e => upd('parking_info', e.target.value || null)} placeholder="Where to park and how to walk in" />
          </div>

          <div style={{ gridColumn: '1 / -1', paddingTop: 8, borderTop: '1px solid var(--cream-dark)' }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>Permit</div>
          </div>

          <div>
            <label style={lbl}>Permit required</label>
            <select style={inp} value={f.permit_required == null ? '' : String(f.permit_required)} onChange={e => upd('permit_required', e.target.value === '' ? null : e.target.value === 'true')}>
              <option value="">unknown</option>
              <option value="true">yes</option>
              <option value="false">no</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Permit certainty</label>
            <select style={inp} value={f.permit_certainty ?? ''} onChange={e => upd('permit_certainty', e.target.value || null)}>
              <option value="">—</option>
              <option value="unknown">unknown</option>
              <option value="likely">likely</option>
              <option value="verified">verified</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Permit fee</label>
            <input style={inp} value={f.permit_fee ?? ''} onChange={e => upd('permit_fee', e.target.value || null)} />
          </div>
          <div>
            <label style={lbl}>Permit website</label>
            <input style={inp} value={f.permit_website ?? ''} onChange={e => upd('permit_website', e.target.value || null)} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Permit notes</label>
            <textarea style={{ ...inp, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }} value={f.permit_notes ?? ''} onChange={e => upd('permit_notes', e.target.value || null)} />
          </div>
        </div>

        {err && (
          <div style={{ padding: '10px 14px', background: 'rgba(181,75,42,.08)', borderTop: '1px solid rgba(181,75,42,.25)', color: 'var(--rust)', fontSize: 12, flexShrink: 0 }}>
            {err}
          </div>
        )}

        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--cream-dark)', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} disabled={saving} style={{ padding: '9px 16px', borderRadius: 4, background: 'white', border: '1px solid var(--cream-dark)', color: 'var(--ink-soft)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '9px 18px', borderRadius: 4, background: 'var(--gold)', border: 'none', color: 'var(--ink)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Adding…' : 'Add to map'}
          </button>
        </div>
      </div>
    </>
  )
}
