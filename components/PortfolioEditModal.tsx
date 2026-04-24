'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ImageLightbox from '@/components/ImageLightbox'
import AddressSearch, { type AddressResult } from '@/components/AddressSearch'
import { thumbUrl } from '@/lib/image'
import { useReorderDrag } from '@/hooks/useReorderDrag'

// Shared edit modal for a portfolio location. Mounted from the Dashboard and
// the dedicated /portfolio page — both read/write the same portfolio_locations
// row so they stay in sync automatically.

interface PortfolioRow {
  id: string; name: string; description: string | null
  city: string | null; state: string | null
  latitude: number | null; longitude: number | null
  access_type: string | null
  tags: string[] | null
  permit_required: boolean | null; permit_notes: string | null
  best_time: string | null; parking_info: string | null
  is_secret: boolean; source_location_id: string | null
}

interface PhotoRow { id: string; url: string; storage_path: string; caption: string | null; sort_order?: number | null }

export default function PortfolioEditModal({
  portfolioId, userId, onClose, onSaved, onDeleted,
}: {
  portfolioId: string; userId: string
  onClose: () => void; onSaved: () => void; onDeleted: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [row,     setRow]     = useState<PortfolioRow | null>(null)
  const [name,    setName]    = useState('')
  const [desc,    setDesc]    = useState('')
  const [city,    setCity]    = useState('')
  const [state,   setState]   = useState('')
  const [access,  setAccess]  = useState<'public'|'private'>('public')
  const [tags,    setTags]    = useState<string[]>([])
  const [tagInput,setTagInput]= useState('')
  const [permitRequired, setPermitRequired] = useState(false)
  const [permitNotes,    setPermitNotes]    = useState('')
  const [bestTime,       setBestTime]       = useState('')
  const [parkingInfo,    setParkingInfo]    = useState('')
  const [isSecret,setIsSecret]= useState(false)
  const [hideGooglePhotos, setHideGooglePhotos] = useState(false)
  const [lat,     setLat]     = useState<number | null>(null)
  const [lng,     setLng]     = useState<number | null>(null)
  const [pinLabel,setPinLabel]= useState<string>('')
  const [photos,  setPhotos]  = useState<PhotoRow[]>([])
  const [saving,  setSaving]  = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [err,     setErr]     = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [rowRes, photosRes] = await Promise.all([
        supabase.from('portfolio_locations').select('id,name,description,city,state,latitude,longitude,access_type,tags,permit_required,permit_notes,best_time,parking_info,is_secret,source_location_id,hide_google_photos').eq('id', portfolioId).single(),
        supabase.from('location_photos').select('id,url,storage_path,caption,sort_order').eq('portfolio_location_id', portfolioId).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
      ])
      if (cancelled) return
      if (rowRes.data) {
        setRow(rowRes.data)
        setName(rowRes.data.name ?? '')
        setDesc(rowRes.data.description ?? '')
        setCity(rowRes.data.city ?? '')
        setState(rowRes.data.state ?? '')
        setAccess((rowRes.data.access_type === 'private' ? 'private' : 'public'))
        setTags(Array.isArray(rowRes.data.tags) ? rowRes.data.tags : [])
        setPermitRequired(!!rowRes.data.permit_required)
        setPermitNotes(rowRes.data.permit_notes ?? '')
        setBestTime(rowRes.data.best_time ?? '')
        setParkingInfo(rowRes.data.parking_info ?? '')
        setIsSecret(!!rowRes.data.is_secret)
        setHideGooglePhotos(!!rowRes.data.hide_google_photos)
        setLat(rowRes.data.latitude ?? null)
        setLng(rowRes.data.longitude ?? null)
      }
      if (photosRes.data) setPhotos(photosRes.data)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [portfolioId])

  function addTag(t: string) {
    const v = t.trim(); if (!v || tags.length >= 12 || tags.includes(v)) return
    setTags(p => [...p, v]); setTagInput('')
  }
  function removeTag(t: string) { setTags(p => p.filter(x => x !== t)) }

  async function save() {
    if (!name.trim()) { setErr('Name is required.'); return }
    setSaving(true); setErr('')
    const { error } = await supabase.from('portfolio_locations').update({
      name:               name.trim(),
      description:        desc.trim() || null,
      city:               city.trim() || null,
      state:              state.trim() || null,
      access_type:        access,
      tags:               tags.length > 0 ? tags : null,
      permit_required:    permitRequired,
      permit_notes:       permitNotes.trim() || null,
      best_time:          bestTime.trim() || null,
      parking_info:       parkingInfo.trim() || null,
      is_secret:          isSecret,
      hide_google_photos: hideGooglePhotos,
      latitude:           lat,
      longitude:          lng,
    }).eq('id', portfolioId)
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  async function persistOrder(next: PhotoRow[], prev: PhotoRow[]) {
    setPhotos(next)
    setErr('')
    const results = await Promise.all(next.map((p, idx) =>
      supabase.from('location_photos').update({ sort_order: idx }).eq('id', p.id)
    ))
    const firstErr = results.find(r => r.error)?.error
    if (firstErr) {
      setPhotos(prev)
      setErr(`Could not save photo order: ${firstErr.message}`)
      console.error('persistOrder failed', firstErr)
    }
  }

  async function reorderPhoto(fromId: string, toId: string) {
    if (fromId === toId) return
    const fromIdx = photos.findIndex(p => p.id === fromId)
    const toIdx   = photos.findIndex(p => p.id === toId)
    if (fromIdx < 0 || toIdx < 0) return
    const next = [...photos]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    await persistOrder(next, photos)
  }

  const photoReorder = useReorderDrag(reorderPhoto)

  function onPinSelect(r: AddressResult) {
    setLat(r.lat); setLng(r.lng); setPinLabel(r.shortLabel ?? r.label ?? '')
  }

  async function deletePortfolio() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setSaving(true)
    for (const p of photos) {
      await supabase.storage.from('location-photos').remove([p.storage_path])
    }
    const { error } = await supabase.from('portfolio_locations').delete().eq('id', portfolioId)
    setSaving(false)
    if (error) { setErr(error.message); return }
    onDeleted()
  }

  async function deletePhoto(photo: PhotoRow) {
    await supabase.storage.from('location-photos').remove([photo.storage_path])
    await supabase.from('location_photos').delete().eq('id', photo.id)
    setPhotos(prev => prev.filter(p => p.id !== photo.id))
  }

  async function handleUpload(files: File[]) {
    if (!files.length) return
    setUploading(true)
    const { data: p } = await supabase.from('profiles').select('full_name').eq('id', userId).single()
    const uploaded: PhotoRow[] = []
    // Start new photos at the end of the current order.
    let nextOrder = photos.length
    for (const f of files) {
      try {
        const ext = f.name.split('.').pop()
        const path = `${userId}/portfolio/${portfolioId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`
        const { error: ue } = await supabase.storage.from('location-photos').upload(path, f, { contentType: f.type })
        if (ue) { console.error(ue); continue }
        const { data: pub } = supabase.storage.from('location-photos').getPublicUrl(path)
        const { data: inserted, error: ie } = await supabase.from('location_photos').insert({
          portfolio_location_id: portfolioId,
          user_id: userId,
          url: pub.publicUrl,
          storage_path: path,
          is_private: false,
          photographer_name: p?.full_name ?? null,
          sort_order: nextOrder++,
        }).select('id,url,storage_path,caption,sort_order').single()
        if (ie) { console.error(ie); continue }
        if (inserted) uploaded.push(inserted)
      } catch (e) { console.error(e) }
    }
    setPhotos(prev => [...prev, ...uploaded])
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 5 }
  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--cream-dark)', borderRadius: 4, fontFamily: 'var(--font-dm-sans),sans-serif', fontSize: 14, color: 'var(--ink)', background: 'white', outline: 'none' }
  const cityLine = row ? [row.city, row.state].filter(Boolean).join(', ') : ''

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,.7)', backdropFilter: 'blur(4px)', zIndex: 900 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'white', borderRadius: 16, width: 560, maxWidth: '92vw', maxHeight: '92vh', overflowY: 'auto', zIndex: 1000, boxShadow: '0 24px 64px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem', gap: 12 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 3 }}>Edit portfolio location</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300 }}>{cityLine || 'Your curated copy — edits don\'t affect the public map.'}</div>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--cream-dark)', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
          </div>

          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', fontSize: 13, color: 'var(--ink-soft)' }}>Loading…</div>
          ) : (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Location on the map</label>
                <AddressSearch onSelect={onPinSelect} placeholder="Update the address to change coordinates…" />
                {(lat != null && lng != null) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', borderRadius: 6, marginTop: 8, background: 'rgba(74,103,65,.08)', border: '1px solid rgba(74,103,65,.2)', fontSize: 12, color: 'var(--sage)' }}>
                    <span>📍</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500 }}>Pinned</div>
                      <div style={{ fontSize: 11, fontWeight: 300, color: 'var(--ink-soft)', marginTop: 1 }}>
                        {pinLabel || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Name *</label>
                <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
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

              <div onClick={() => setIsSecret(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, marginBottom: 10, cursor: 'pointer', background: isSecret ? 'rgba(124,92,191,.05)' : 'var(--cream)', border: `1px solid ${isSecret ? 'rgba(124,92,191,.3)' : 'var(--cream-dark)'}` }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${isSecret ? '#7c5cbf' : 'var(--sand)'}`, background: isSecret ? '#7c5cbf' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white' }}>{isSecret ? '✓' : ''}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>Mark as secret</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, marginTop: 2 }}>Private portfolio spot — still shows on your share links.</div>
                </div>
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
                  <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ padding: '5px 12px', borderRadius: 4, background: 'var(--ink)', color: 'var(--cream)', border: 'none', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {uploading ? 'Uploading…' : '+ Upload photos'}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" multiple onChange={e => { handleUpload(Array.from(e.target.files ?? [])) }} style={{ display: 'none' }} />
                </div>
                {photos.length === 0 ? (
                  <div style={{ padding: '1.25rem', textAlign: 'center', background: 'var(--cream)', borderRadius: 8, border: '1px dashed var(--cream-dark)' }}>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 4, fontWeight: 500 }}>⚠ No photos yet</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.5 }}>Clients will see Google Photos until you add your own.</div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 10, color: 'var(--ink-soft)', fontStyle: 'italic', marginBottom: 6 }}>
                      Press and hold any photo, then drag to reorder. Photo #1 is the thumbnail everywhere.
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 8 }}>
                      {photos.map((p, i) => {
                        const isDragging = photoReorder.draggingId === p.id
                        const isOver     = photoReorder.overId === p.id && photoReorder.draggingId && photoReorder.draggingId !== p.id
                        const bind       = photoReorder.bindItem(p.id)
                        return (
                          <div
                            key={p.id}
                            {...bind}
                            style={{
                              position: 'relative',
                              aspectRatio: '1',
                              borderRadius: 6,
                              overflow: 'hidden',
                              border: `1px solid ${isOver ? 'var(--gold)' : 'var(--cream-dark)'}`,
                              cursor: 'grab',
                              opacity: isDragging ? 0.4 : 1,
                              touchAction: 'manipulation',
                              userSelect: 'none',
                              // Dragged tile is transparent to hit-testing
                              // so elementFromPoint reaches the tile below.
                              pointerEvents: isDragging ? 'none' : 'auto',
                            }}
                          >
                            <img src={thumbUrl(p.url) ?? p.url} alt="" loading="lazy" decoding="async" onClick={() => setLightboxSrc(p.url)} style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in' }} />
                            <div style={{ position: 'absolute', top: 4, left: 4, padding: '1px 6px', borderRadius: 10, background: 'rgba(26,22,18,.75)', color: 'white', fontSize: 10, fontWeight: 600 }}>{i + 1}</div>
                            <button onClick={e => { e.stopPropagation(); deletePhoto(p) }} style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', background: 'rgba(26,22,18,.75)', border: 'none', cursor: 'pointer', fontSize: 11, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>

              {err && <div style={{ padding: '8px 12px', background: 'rgba(181,75,42,.08)', border: '1px solid rgba(181,75,42,.2)', borderRadius: 6, fontSize: 13, color: 'var(--rust)', marginBottom: '1rem' }}>{err}</div>}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <button onClick={deletePortfolio} disabled={saving} style={{ padding: '10px 18px', borderRadius: 4, background: confirmDelete ? 'var(--rust)' : 'rgba(181,75,42,.08)', color: confirmDelete ? 'white' : 'var(--rust)', border: `1px solid rgba(181,75,42,${confirmDelete ? '.4' : '.2'})`, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {confirmDelete ? 'Click again to confirm' : 'Delete from portfolio'}
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={onClose} style={{ padding: '10px 18px', borderRadius: 4, background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--sand)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                  <button onClick={save} disabled={saving || !name.trim()} style={{ padding: '10px 22px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: saving || !name.trim() ? 0.5 : 1 }}>
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </>
  )
}
