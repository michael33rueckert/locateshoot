'use client'

import { useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AddressSearch, { type AddressResult } from '@/components/AddressSearch'

// Shared "add to portfolio" modal. Mirrors the Edit modal's full field set —
// name, description, city/state, access, tags, best time, parking, permit,
// secret, plus photo upload (photos are attached after the row is created).

interface PendingPhoto { id: string; file: File; previewUrl: string }

export default function AddPortfolioLocationModal({
  userId, onClose, onCreated,
}: {
  userId: string; onClose: () => void; onCreated: () => void
}) {
  const [name,    setName]    = useState('')
  const [desc,    setDesc]    = useState('')
  const [city,    setCity]    = useState('')
  const [state,   setState]   = useState('')
  const [access,  setAccess]  = useState<'public'|'private'>('public')
  const [tags,    setTags]    = useState<string[]>([])
  const [tagInput,setTagInput]= useState('')
  const [bestTime,       setBestTime]       = useState('')
  const [parkingInfo,    setParkingInfo]    = useState('')
  const [permitRequired, setPermitRequired] = useState(false)
  const [permitNotes,    setPermitNotes]    = useState('')
  const [hideGooglePhotos, setHideGooglePhotos] = useState(false)
  const [pin,     setPin]     = useState<AddressResult | null>(null)
  const [photos,  setPhotos]  = useState<PendingPhoto[]>([])
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function onAddr(r: AddressResult) {
    setPin(r)
    const parts = (r.label ?? '').split(',').map(s => s.trim()).filter(Boolean)
    if (!name.trim() && parts[0]) setName(parts[0])
    if (!city.trim() && parts[1]) setCity(parts[1])
    if (!state.trim() && parts[2]) setState(parts[2].split(' ')[0])
  }

  function addTag(t: string) {
    const v = t.trim(); if (!v || tags.length >= 12 || tags.includes(v)) return
    setTags(p => [...p, v]); setTagInput('')
  }
  function removeTag(t: string) { setTags(p => p.filter(x => x !== t)) }

  function handleFiles(files: FileList | null) {
    if (!files) return
    const next: PendingPhoto[] = []
    for (const f of Array.from(files).slice(0, 10 - photos.length)) {
      next.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, file: f, previewUrl: URL.createObjectURL(f) })
    }
    setPhotos(p => [...p, ...next])
    if (fileRef.current) fileRef.current.value = ''
  }
  function removePhoto(id: string) {
    setPhotos(p => {
      const target = p.find(x => x.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return p.filter(x => x.id !== id)
    })
  }

  async function create() {
    if (!name.trim()) { setErr('Name is required.'); return }
    if (!pin)         { setErr('Search for a location to set coordinates.'); return }
    setSaving(true); setErr('')

    const { data: inserted, error } = await supabase.from('portfolio_locations').insert({
      user_id:            userId,
      source_location_id: null,
      name:               name.trim(),
      description:        desc.trim() || null,
      city:               city.trim() || null,
      state:              state.trim() || null,
      latitude:           pin.lat,
      longitude:          pin.lng,
      access_type:        access,
      tags:               tags.length > 0 ? tags : null,
      permit_required:    permitRequired,
      permit_notes:       permitNotes.trim() || null,
      best_time:          bestTime.trim() || null,
      parking_info:       parkingInfo.trim() || null,
      is_secret:          false,
      hide_google_photos: hideGooglePhotos,
    }).select('id').single()

    if (error || !inserted) { setSaving(false); setErr(error?.message ?? 'Could not add location.'); return }

    // Upload any pending photos against the new portfolio_location_id. Failures
    // here are non-fatal — the row is already saved; we just warn.
    if (photos.length > 0) {
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', userId).single()
      for (const ph of photos) {
        try {
          const ext = ph.file.name.split('.').pop()
          const path = `${userId}/portfolio/${inserted.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
          const { error: ue } = await supabase.storage.from('location-photos').upload(path, ph.file, { contentType: ph.file.type })
          if (ue) { console.error('upload failed', ue); continue }
          const { data: pub } = supabase.storage.from('location-photos').getPublicUrl(path)
          await supabase.from('location_photos').insert({
            portfolio_location_id: inserted.id,
            user_id: userId,
            url: pub.publicUrl,
            storage_path: path,
            is_private: false,
            photographer_name: profile?.full_name ?? null,
          })
        } catch (e) { console.error(e) }
      }
    }

    setSaving(false)
    // Clean up blob URLs before closing.
    photos.forEach(p => URL.revokeObjectURL(p.previewUrl))
    onCreated()
  }

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 5 }
  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--cream-dark)', borderRadius: 4, fontFamily: 'var(--font-dm-sans),sans-serif', fontSize: 14, color: 'var(--ink)', background: 'white', outline: 'none' }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,.7)', backdropFilter: 'blur(4px)', zIndex: 1100 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'white', borderRadius: 16, width: 560, maxWidth: '92vw', maxHeight: '92vh', overflowY: 'auto', zIndex: 1200, boxShadow: '0 24px 64px rgba(0,0,0,.3)' }}>
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

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Description</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="What's special about this spot?" />
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
            <label style={labelStyle}>Access</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['public','private'] as const).map(opt => (
                <button key={opt} onClick={() => setAccess(opt)} style={{ flex: 1, padding: '8px 12px', borderRadius: 4, fontSize: 13, fontWeight: 500, border: `1px solid ${access === opt ? 'var(--gold)' : 'var(--cream-dark)'}`, background: access === opt ? 'rgba(196,146,42,.08)' : 'white', color: access === opt ? 'var(--gold)' : 'var(--ink-soft)', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {opt === 'public' ? '● Public' : '🔒 Private'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Tags <span style={{ fontSize: 10, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-soft)' }}>({tags.length}/12)</span></label>
            {tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                {tags.map(t => (
                  <span key={t} onClick={() => removeTag(t)} style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, background: 'var(--gold)', color: 'var(--ink)', cursor: 'pointer', fontWeight: 500 }}>{t} ✕</span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput) } }} placeholder="Add a tag (press Enter)" style={{ ...inputStyle, flex: 1 }} />
              <button onClick={() => addTag(tagInput)} style={{ padding: '9px 14px', borderRadius: 4, background: 'var(--ink)', color: 'var(--cream)', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '1rem' }}>
            <div>
              <label style={labelStyle}>Best time</label>
              <input value={bestTime} onChange={e => setBestTime(e.target.value)} style={inputStyle} placeholder="Golden hour, sunrise…" />
            </div>
            <div>
              <label style={labelStyle}>Parking info</label>
              <input value={parkingInfo} onChange={e => setParkingInfo(e.target.value)} style={inputStyle} placeholder="Free lot, street parking…" />
            </div>
          </div>

          <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--cream)', border: '1px solid var(--cream-dark)', marginBottom: '1.25rem' }}>
            <div onClick={() => setPermitRequired(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: permitRequired ? 10 : 0 }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${permitRequired ? 'var(--rust)' : 'var(--sand)'}`, background: permitRequired ? 'var(--rust)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white' }}>{permitRequired ? '✓' : ''}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>🔒 Permit required</div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, marginTop: 2 }}>Mark if this location requires a permit to shoot.</div>
              </div>
            </div>
            {permitRequired && (
              <textarea value={permitNotes} onChange={e => setPermitNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical', marginTop: 4 }} placeholder="Details — fee, where to get it, contact, etc." />
            )}
          </div>

          <div onClick={() => setHideGooglePhotos(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, marginBottom: '1.25rem', cursor: 'pointer', background: hideGooglePhotos ? 'rgba(61,110,140,.06)' : 'var(--cream)', border: `1px solid ${hideGooglePhotos ? 'rgba(61,110,140,.3)' : 'var(--cream-dark)'}` }}>
            <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${hideGooglePhotos ? 'var(--sky)' : 'var(--sand)'}`, background: hideGooglePhotos ? 'var(--sky)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white' }}>{hideGooglePhotos ? '✓' : ''}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>Do not show photos from Google</div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, marginTop: 2 }}>Clients will only see your uploaded photos for this location.</div>
            </div>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Your photos <span style={{ fontSize: 10, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-soft)' }}>({photos.length})</span></label>
              <button onClick={() => fileRef.current?.click()} disabled={saving || photos.length >= 10} style={{ padding: '5px 12px', borderRadius: 4, background: 'var(--ink)', color: 'var(--cream)', border: 'none', fontSize: 11, fontWeight: 500, cursor: saving || photos.length >= 10 ? 'default' : 'pointer', fontFamily: 'inherit', opacity: photos.length >= 10 ? 0.5 : 1 }}>
                + Upload photos
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={e => handleFiles(e.target.files)} style={{ display: 'none' }} />
            </div>
            {photos.length === 0 ? (
              <div style={{ padding: '1.25rem', textAlign: 'center', background: 'var(--cream)', borderRadius: 8, border: '1px dashed var(--cream-dark)' }}>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.5 }}>Optional — upload your own photos now, or add them later. Photos are uploaded when you save.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(90px,1fr))', gap: 6 }}>
                {photos.map(p => (
                  <div key={p.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--cream-dark)' }}>
                    <img src={p.previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button onClick={() => removePhoto(p.id)} disabled={saving} style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', background: 'rgba(26,22,18,.75)', border: 'none', cursor: 'pointer', fontSize: 11, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {err && <div style={{ padding: '8px 12px', background: 'rgba(181,75,42,.08)', border: '1px solid rgba(181,75,42,.2)', borderRadius: 6, fontSize: 13, color: 'var(--rust)', marginBottom: '1rem' }}>{err}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={create} disabled={saving || !name.trim() || !pin} style={{ flex: 1, padding: '12px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: saving || !name.trim() || !pin ? 0.5 : 1 }}>
              {saving ? (photos.length > 0 ? 'Saving & uploading…' : 'Saving…') : 'Add to portfolio'}
            </button>
            <button onClick={onClose} disabled={saving} style={{ padding: '12px 20px', borderRadius: 4, background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--sand)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          </div>
        </div>
      </div>
    </>
  )
}
