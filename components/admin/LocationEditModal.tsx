'use client'

import { useState } from 'react'

// Admin-only edit form for a public location row. Used from the admin
// dashboard's location list and from the explore-page detail panel when
// the signed-in user is the admin. Save is delegated to the caller —
// they're the ones holding the auth token / API path.

export interface ManagedLocation {
  id: string; name: string; description: string | null;
  city: string | null; state: string | null;
  latitude: number | null; longitude: number | null;
  category: string | null; access_type: string | null;
  tags: string[] | null;
  permit_required: boolean | null; permit_fee: string | null; permit_notes: string | null;
  permit_website: string | null; permit_certainty: string | null;
  best_time: string | null; parking_info: string | null;
  status: string; rating: number | null; quality_score: number | null;
  source: string | null; created_at: string;
}

export default function LocationEditModal({ loc, onClose, onSave }: {
  loc: ManagedLocation
  onClose: () => void
  onSave: (updates: Partial<ManagedLocation>) => Promise<void>
}) {
  const [f, setF] = useState<ManagedLocation>(loc)
  const [saving, setSaving] = useState(false)
  function upd<K extends keyof ManagedLocation>(k: K, v: ManagedLocation[K]) { setF(p => ({ ...p, [k]: v })) }

  async function handleSave() {
    setSaving(true)
    const patch: Partial<ManagedLocation> = {}
    ;(['name','description','city','state','latitude','longitude','category','access_type','tags','permit_required','permit_fee','permit_notes','permit_website','permit_certainty','best_time','parking_info','status','rating','quality_score'] as const).forEach(k => {
      if ((f as any)[k] !== (loc as any)[k]) (patch as any)[k] = (f as any)[k]
    })
    if (Object.keys(patch).length === 0) { onClose(); setSaving(false); return }
    await onSave(patch)
    setSaving(false)
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--cream-dark)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, outline: 'none', background: 'white' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 4 }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,.6)', backdropFilter: 'blur(4px)', zIndex: 5000 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'white', borderRadius: 12, width: 620, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', zIndex: 5001, boxShadow: '0 24px 64px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--cream-dark)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>Edit location</div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--cream-dark)', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--ink-soft)' }}>✕</button>
        </div>

        <div style={{ padding: '1rem 1.25rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Name</label>
            <input style={inp} value={f.name ?? ''} onChange={e => upd('name', e.target.value)} />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Description</label>
            <textarea style={{ ...inp, minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }} value={f.description ?? ''} onChange={e => upd('description', e.target.value)} />
          </div>

          <div>
            <label style={lbl}>City</label>
            <input style={inp} value={f.city ?? ''} onChange={e => upd('city', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>State</label>
            <input style={inp} value={f.state ?? ''} onChange={e => upd('state', e.target.value)} />
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
              <option value="archived">archived</option>
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
            <input style={inp} value={f.category ?? ''} onChange={e => upd('category', e.target.value || null)} />
          </div>
          <div>
            <label style={lbl}>Tags (comma-separated)</label>
            <input style={inp} value={(f.tags ?? []).join(', ')} onChange={e => upd('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))} />
          </div>

          <div>
            <label style={lbl}>Rating</label>
            <input style={inp} type="number" step="0.1" min={0} max={5} value={f.rating ?? ''} onChange={e => upd('rating', e.target.value === '' ? null : parseFloat(e.target.value))} />
          </div>
          <div>
            <label style={lbl}>Quality score</label>
            <input style={inp} type="number" value={f.quality_score ?? ''} onChange={e => upd('quality_score', e.target.value === '' ? null : parseInt(e.target.value, 10))} />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Best time</label>
            <input style={inp} value={f.best_time ?? ''} onChange={e => upd('best_time', e.target.value || null)} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Parking info</label>
            <input style={inp} value={f.parking_info ?? ''} onChange={e => upd('parking_info', e.target.value || null)} />
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
            {/* Values must match PERMIT_CFG in app/explore/page.tsx — the
                detail panel only knows how to render verified/likely/unknown.
                An earlier version of this dropdown had "confirmed", which
                was silently saved to the DB but rendered as "unknown" on
                the public side because it didn't match a PERMIT_CFG key. */}
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

        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--cream-dark)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={saving} style={{ padding: '9px 16px', borderRadius: 4, background: 'white', border: '1px solid var(--cream-dark)', color: 'var(--ink-soft)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '9px 18px', borderRadius: 4, background: 'var(--gold)', border: 'none', color: 'var(--ink)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </>
  )
}
