'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { usePlacePhotos } from '@/hooks/usePlacePhotos'
import AddressSearch, { type AddressResult } from '@/components/AddressSearch'
import type { ExploreLocation } from '@/components/ExploreMap'

const ExploreMap = dynamic(() => import('@/components/ExploreMap'), { ssr: false })

const BG_CYCLE = ['bg-1','bg-2','bg-3','bg-4','bg-5','bg-6']

// All tags now live inside the filter dropdown (not horizontal pills)
const ALL_TAGS = [
  'Golden Hour','Sunrise','Sunset','Forest','Urban','Waterfront','Historic',
  'Nature','Gardens','Architecture','Romantic','Dramatic','Editorial',
  'Meadow','Creek','Bridge','Mural','Rooftop','Cemetery','Barn','Ranch',
  'Vineyard','Campus','Trail','Industrial','Rustic','Colorful','Wedding','Family',
]

const SORT_OPTIONS = [
  { value: 'quality',    label: '⭐ Top rated'   },
  { value: 'rating_asc', label: '↑ Lowest rated' },
  { value: 'name',       label: '🔤 Name A–Z'     },
  { value: 'newest',     label: '🕒 Newest first' },
  { value: 'saves',      label: '❤ Most saved'   },
]

const RATING_OPTIONS = [
  { value: 0,   label: 'Any rating' },
  { value: 4.5, label: '★ 4.5+'     },
  { value: 4.0, label: '★ 4.0+'     },
  { value: 3.5, label: '★ 3.5+'     },
  { value: 3.0, label: '★ 3.0+'     },
]

const PERMIT_CERTAINTY_CONFIG = {
  verified: { label: '✓ Permit Verified',      bg: 'rgba(181,75,42,.1)',  color: 'var(--rust)', border: 'rgba(181,75,42,.25)' },
  likely:   { label: '⚠ Permit Likely Needed', bg: 'rgba(196,146,42,.1)', color: 'var(--gold)', border: 'rgba(196,146,42,.25)' },
  unknown:  { label: '? Permit Unknown',        bg: 'var(--cream-dark)',   color: 'var(--ink-soft)', border: 'var(--sand)' },
}

type SortValue = 'quality' | 'rating_asc' | 'name' | 'newest' | 'saves'
type AccessFilter = 'All' | 'Public' | 'Private' | 'My Locations'

interface CommunityPhoto {
  id: string; url: string; is_private: boolean
  caption: string | null; photographer_name: string | null
  created_at: string; user_id: string | null
}

// ── Community photos hook ─────────────────────────────────────────────────────
function useCommunityPhotos(locationId: number | string | null, currentUserId: string | null) {
  const [photos,  setPhotos]  = useState<CommunityPhoto[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!locationId) return
    setLoading(true)
    supabase.from('location_photos')
      .select('id,url,is_private,caption,photographer_name,created_at,user_id')
      .eq('location_id', locationId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const visible = (data ?? []).filter((p: CommunityPhoto) => !p.is_private || p.user_id === currentUserId)
        setPhotos(visible); setLoading(false)
      })
  }, [locationId, currentUserId])
  return { photos, loading }
}

// ── Photo upload panel ────────────────────────────────────────────────────────
function PhotoUploadPanel({ locationId, user, onUpload }: { locationId: number | string, user: any, onUpload: () => void }) {
  const [files,       setFiles]       = useState<File[]>([])
  const [isPrivate,   setIsPrivate]   = useState(false)
  const [caption,     setCaption]     = useState('')
  const [uploading,   setUploading]   = useState(false)
  const [uploadCount, setUploadCount] = useState(0)
  const [done,        setDone]        = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function upload() {
    if (!user || files.length === 0) return
    setUploading(true)
    let count = 0
    const profile = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
    const photographerName = profile.data?.full_name ?? ''
    for (const file of files) {
      try {
        const ext = file.name.split('.').pop()
        const path = `${user.id}/${locationId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: upErr } = await supabase.storage.from('location-photos').upload(path, file, { contentType: file.type })
        if (upErr) continue
        const { data: urlData } = supabase.storage.from('location-photos').getPublicUrl(path)
        await supabase.from('location_photos').insert({
          location_id: locationId, user_id: user.id,
          url: urlData.publicUrl, storage_path: path,
          is_private: isPrivate, caption: caption.trim() || null,
          photographer_name: photographerName,
        })
        count++; setUploadCount(count)
      } catch (e) { console.error(e) }
    }
    setUploading(false); setDone(true); onUpload()
  }

  if (done) return (
    <div style={{ padding: '12px 14px', background: 'rgba(74,103,65,.08)', border: '1px solid rgba(74,103,65,.2)', borderRadius: 8, fontSize: 13, color: 'var(--sage)', textAlign: 'center' }}>
      ✓ {uploadCount} photo{uploadCount !== 1 ? 's' : ''} uploaded! Thank you.
    </div>
  )

  return (
    <div style={{ border: '1px solid var(--cream-dark)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', background: 'var(--cream)', borderBottom: '1px solid var(--cream-dark)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>📷 Add your photos</div>
        <button onClick={() => fileRef.current?.click()} style={{ padding: '5px 12px', borderRadius: 4, background: 'var(--ink)', color: 'var(--cream)', border: 'none', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Browse</button>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files ?? []).filter(f => f.type.startsWith('image/'))].slice(0,10))} style={{ display: 'none' }} />
      </div>
      <div style={{ padding: '12px 14px' }}>
        {files.length === 0 ? (
          <div onClick={() => fileRef.current?.click()} style={{ border: '2px dashed var(--cream-dark)', borderRadius: 8, padding: '1rem', textAlign: 'center', cursor: 'pointer' }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>📷</div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300 }}>Click to select photos (up to 10)</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 5, marginBottom: 10 }}>
              {files.map((f, i) => (
                <div key={i} style={{ position: 'relative', aspectRatio: '1', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--cream-dark)' }}>
                  <img src={URL.createObjectURL(f)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))} style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: 'rgba(26,22,18,.7)', border: 'none', cursor: 'pointer', fontSize: 10, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>
              ))}
            </div>
            <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="Caption (optional)" style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--cream-dark)', borderRadius: 4, fontFamily: 'inherit', fontSize: 12, outline: 'none', marginBottom: 8 }} />
            <div onClick={() => setIsPrivate(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${isPrivate ? 'rgba(124,92,191,.3)' : 'var(--cream-dark)'}`, background: isPrivate ? 'rgba(124,92,191,.05)' : 'white', marginBottom: 10 }}>
              <div style={{ width: 16, height: 16, borderRadius: 3, border: `1.5px solid ${isPrivate ? '#7c5cbf' : 'var(--sand)'}`, background: isPrivate ? '#7c5cbf' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'white', flexShrink: 0 }}>{isPrivate ? '✓' : ''}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: isPrivate ? '#7c5cbf' : 'var(--ink)' }}>🔒 Private — only you and clients can see</div>
              </div>
            </div>
            <button onClick={upload} disabled={uploading} style={{ width: '100%', padding: '9px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: uploading ? 0.6 : 1 }}>
              {uploading ? `Uploading… (${uploadCount}/${files.length})` : `Upload ${files.length} photo${files.length !== 1 ? 's' : ''}`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Report a correction modal ──────────────────────────────────────────────────
function ReportModal({ locName, onClose }: { locName: string, onClose: () => void }) {
  const [message, setMessage] = useState('')
  const [sent,    setSent]    = useState(false)
  async function send() {
    if (!message.trim()) return
    // In production this would call an API route to send email / insert into DB
    setSent(true)
  }
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,.5)', zIndex: 600 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'white', borderRadius: 12, width: 420, maxWidth: '92vw', padding: '1.5rem', zIndex: 700, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        {sent ? (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--ink)', marginBottom: 6 }}>Thanks for the heads up!</div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: '1.25rem' }}>We'll review the correction for {locName}.</div>
            <button onClick={onClose} style={{ padding: '8px 20px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--ink)', marginBottom: 4 }}>Report a correction</div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: '1rem' }}>{locName}</div>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} placeholder="Describe the correction — wrong location, closed access, incorrect permit info, etc." style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--cream-dark)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, outline: 'none', resize: 'vertical', marginBottom: 10 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={send} disabled={!message.trim()} style={{ flex: 1, padding: '9px', borderRadius: 4, background: 'var(--ink)', color: 'var(--cream)', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: message.trim() ? 1 : 0.4 }}>Send Report</button>
              <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 4, background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--sand)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

// ── Add Location Modal ────────────────────────────────────────────────────────
function AddLocationModal({ onClose, user }: { onClose: () => void, user: any }) {
  const [name,        setName]        = useState('')
  const [city,        setCity]        = useState('')
  const [state,       setState]       = useState('')
  const [description, setDescription] = useState('')
  const [accessType,  setAccessType]  = useState('public')
  const [tags,        setTags]        = useState<string[]>([])
  const [tagInput,    setTagInput]    = useState('')
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [error,       setError]       = useState('')
  const [pin,         setPin]         = useState<{ lat: number; lng: number; label: string } | null>(null)
  const [photoFiles,  setPhotoFiles]  = useState<File[]>([])
  const [photoPrivate,setPhotoPrivate]= useState(false)
  const [photoCaption,setPhotoCaption]= useState('')
  const [uploading,   setUploading]   = useState(false)
  const [uploaded,    setUploaded]    = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const TAG_SUGGESTIONS = ['Golden Hour','Forest','Urban','Waterfront','Historic','Nature','Gardens','Architecture','Romantic','Dramatic','Editorial','Meadow','Creek','Bridge','Mural']

  function handleAddressSelect(result: AddressResult) {
    setPin({ lat: result.lat, lng: result.lng, label: result.label ?? result.shortLabel ?? '' })
    if (!name.trim()) { const p = result.label?.split(',') ?? []; if (p.length > 0) setName(p[0].trim()) }
    if (!city.trim()) { const p = result.label?.split(',') ?? []; if (p.length > 1) setCity(p[1].trim()) }
    if (!state.trim()) { const p = result.label?.split(',') ?? []; if (p.length > 2) { const m = p[p.length-1].trim().match(/^([A-Z]{2})/i); if (m) setState(m[1].toUpperCase()) } }
  }

  function addTag(tag: string) { const t = tag.trim(); if (!t || tags.includes(t) || tags.length >= 8) return; setTags(prev => [...prev, t]); setTagInput('') }

  async function submit() {
    if (!name.trim() || !city.trim() || !state.trim()) { setError('Name, city, and state are required.'); return }
    if (!pin) { setError('Please search for and select the location on the map first.'); return }
    setSaving(true); setError('')
    try {
      const { data, error: insertErr } = await supabase.from('locations').insert({
        name: name.trim(), city: city.trim(), state: state.trim().slice(0,2).toUpperCase(),
        latitude: pin.lat, longitude: pin.lng, description: description.trim() || null,
        access_type: accessType, tags, status: 'pending', source: 'community', added_by: user?.id ?? null,
      }).select('id').single()
      if (insertErr) throw insertErr
      if (photoFiles.length > 0 && data?.id) {
        setUploading(true)
        const profile = user ? await supabase.from('profiles').select('full_name').eq('id', user.id).single() : null
        const photographerName = profile?.data?.full_name ?? ''
        let count = 0
        for (const file of photoFiles) {
          try {
            const ext = file.name.split('.').pop()
            const path = `${user?.id ?? 'guest'}/${data.id}/${Date.now()}.${ext}`
            const { error: upErr } = await supabase.storage.from('location-photos').upload(path, file, { contentType: file.type })
            if (upErr) continue
            const { data: urlData } = supabase.storage.from('location-photos').getPublicUrl(path)
            await supabase.from('location_photos').insert({ location_id: data.id, user_id: user?.id ?? null, url: urlData.publicUrl, storage_path: path, is_private: photoPrivate, caption: photoCaption.trim() || null, photographer_name: photographerName })
            count++; setUploaded(count)
          } catch {}
        }
        setUploading(false)
      }
      setSaved(true)
    } catch (err: any) { setError('Could not submit — please try again.'); console.error(err) }
    finally { setSaving(false) }
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--cream-dark)', borderRadius: 4, fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 14, color: 'var(--ink)', background: 'white', outline: 'none' }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 5 }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,.6)', backdropFilter: 'blur(4px)', zIndex: 800 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'white', borderRadius: 16, width: 560, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', zIndex: 900, boxShadow: '0 24px 64px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-playfair), serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 3 }}>📍 Add a location</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300 }}>Know a great spot? Submit it and share your photos.</div>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--cream-dark)', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>

          {saved ? (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
              <div style={{ fontFamily: 'var(--font-playfair), serif', fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Thanks for your submission!</div>
              <div style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.6, marginBottom: uploaded > 0 ? 6 : '1.5rem' }}>Your location has been submitted for review.</div>
              {uploaded > 0 && <div style={{ fontSize: 13, color: 'var(--sage)', marginBottom: '1.5rem' }}>✓ {uploaded} photo{uploaded !== 1 ? 's' : ''} uploaded</div>}
              <button onClick={onClose} style={{ padding: '10px 24px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Done</button>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={labelStyle}>Search for the location * <span style={{ color: 'var(--rust)', fontSize: 10, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(required)</span></label>
                <AddressSearch onSelect={handleAddressSelect} placeholder="Search by name or address…" />
                {pin ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', borderRadius: 6, marginTop: 8, background: 'rgba(74,103,65,.08)', border: '1px solid rgba(74,103,65,.2)', fontSize: 13, color: 'var(--sage)' }}>
                    <span>📍</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500 }}>Pin placed</div>
                      <div style={{ fontSize: 10, color: 'var(--sage)', marginTop: 1 }}>{pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}</div>
                    </div>
                    <button onClick={() => setPin(null)} style={{ fontSize: 11, color: 'var(--rust)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Clear</button>
                  </div>
                ) : <div style={{ marginTop: 6, fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300 }}>Search above to place the map pin.</div>}
              </div>

              <div style={{ marginBottom: '1rem' }}><label style={labelStyle}>Location name *</label><input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="e.g. Loose Park Rose Garden" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 10, marginBottom: '1rem' }}>
                <div><label style={labelStyle}>City *</label><input value={city} onChange={e => setCity(e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>State *</label><input value={state} onChange={e => setState(e.target.value.slice(0,2).toUpperCase())} style={inputStyle} placeholder="MO" maxLength={2} /></div>
              </div>
              <div style={{ marginBottom: '1rem' }}><label style={labelStyle}>Description</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} /></div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Access type</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['public','private'].map(type => (
                    <button key={type} onClick={() => setAccessType(type)} style={{ flex: 1, padding: '9px', borderRadius: 4, border: `1.5px solid ${accessType === type ? 'var(--gold)' : 'var(--cream-dark)'}`, background: accessType === type ? 'rgba(196,146,42,.08)' : 'white', color: accessType === type ? 'var(--gold)' : 'var(--ink-soft)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {type === 'public' ? '● Public' : '🔒 Private'}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={labelStyle}>Tags (up to 8)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                  {TAG_SUGGESTIONS.map(t => <button key={t} onClick={() => addTag(t)} style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid var(--sand)', background: tags.includes(t) ? 'var(--ink)' : 'var(--cream)', color: tags.includes(t) ? 'var(--cream)' : 'var(--ink-soft)' }}>{t}</button>)}
                </div>
                {tags.length > 0 && <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>{tags.map(t => <span key={t} onClick={() => setTags(prev => prev.filter(x => x !== t))} style={{ padding: '3px 8px', borderRadius: 20, fontSize: 11, background: 'var(--gold)', color: 'var(--ink)', cursor: 'pointer', fontWeight: 500 }}>{t} ✕</span>)}</div>}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTag(tagInput) }} placeholder="Custom tag…" style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={() => addTag(tagInput)} style={{ padding: '9px 14px', borderRadius: 4, background: 'var(--ink)', color: 'var(--cream)', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
                </div>
              </div>

              {/* Photo upload */}
              <div style={{ borderTop: '1px solid var(--cream-dark)', paddingTop: '1.25rem', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div><label style={{ ...labelStyle, marginBottom: 2 }}>Your photos <span style={{ fontSize: 10, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-soft)' }}>(optional)</span></label></div>
                  <button onClick={() => fileRef.current?.click()} style={{ padding: '7px 14px', borderRadius: 4, background: 'var(--ink)', color: 'var(--cream)', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>+ Add photos</button>
                  <input ref={fileRef} type="file" accept="image/*" multiple onChange={e => setPhotoFiles(prev => [...prev, ...Array.from(e.target.files ?? []).filter(f => f.type.startsWith('image/'))].slice(0,10))} style={{ display: 'none' }} />
                </div>
                {photoFiles.length > 0 ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, marginBottom: 10 }}>
                      {photoFiles.map((file, idx) => (
                        <div key={idx} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--cream-dark)' }}>
                          <img src={URL.createObjectURL(file)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <button onClick={() => setPhotoFiles(prev => prev.filter((_,i) => i !== idx))} style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: '50%', background: 'rgba(26,22,18,.7)', border: 'none', cursor: 'pointer', fontSize: 12, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                        </div>
                      ))}
                    </div>
                    <input value={photoCaption} onChange={e => setPhotoCaption(e.target.value)} style={{ ...inputStyle, fontSize: 13, marginBottom: 8 }} placeholder="Caption for your photos (optional)" />
                    <div onClick={() => setPhotoPrivate(p => !p)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${photoPrivate ? 'rgba(124,92,191,.3)' : 'var(--cream-dark)'}`, background: photoPrivate ? 'rgba(124,92,191,.05)' : 'var(--cream)' }}>
                      <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1, border: `1.5px solid ${photoPrivate ? '#7c5cbf' : 'var(--sand)'}`, background: photoPrivate ? '#7c5cbf' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white' }}>{photoPrivate ? '✓' : ''}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>🔒 Mark photos as private</div>
                        <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300 }}>Only visible to you and your clients — not the general public.</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div onClick={() => fileRef.current?.click()} style={{ border: '2px dashed var(--cream-dark)', borderRadius: 10, padding: '1.5rem', textAlign: 'center', cursor: 'pointer', background: 'var(--cream)' }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>📷</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 4 }}>Drop photos or click to browse</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300 }}>JPG, PNG · Max 10MB each · Up to 10 photos</div>
                  </div>
                )}
              </div>

              {error && <div style={{ padding: '8px 12px', background: 'rgba(181,75,42,.08)', border: '1px solid rgba(181,75,42,.2)', borderRadius: 6, fontSize: 13, color: 'var(--rust)', marginBottom: '1rem' }}>{error}</div>}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={submit} disabled={saving || uploading || !name.trim() || !city.trim() || !state.trim() || !pin} style={{ flex: 1, padding: '12px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: saving || uploading || !name.trim() || !city.trim() || !state.trim() || !pin ? 0.5 : 1 }}>
                  {uploading ? `Uploading photos… (${uploaded}/${photoFiles.length})` : saving ? 'Submitting…' : !pin ? 'Search for location first' : photoFiles.length > 0 ? `Submit + ${photoFiles.length} photo${photoFiles.length !== 1 ? 's' : ''} →` : 'Submit location →'}
                </button>
                <button onClick={onClose} style={{ padding: '12px 20px', borderRadius: 4, background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--sand)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function DetailPanel({ loc, isFav, onClose, onToggleFavorite, user }: {
  loc: ExploreLocation & { desc?: string; ratingNum?: number; qualityScore?: number; permit_required?: boolean; permit_notes?: string | null; permit_fee?: number | null; permit_website?: string | null; permit_certainty?: string; permit_scanned_at?: string | null }
  isFav: boolean; onClose: () => void; onToggleFavorite: (id: number) => void; user: any
}) {
  const router = useRouter()
  const { photos: googlePhotos, loading: googleLoading } = usePlacePhotos(loc.name, loc.city, loc.lat, loc.lng)
  const { photos: communityPhotos, loading: communityLoading } = useCommunityPhotos(loc.id, user?.id ?? null)
  const [activeGooglePhoto, setActiveGooglePhoto] = useState(0)
  const [photoTab,          setPhotoTab]          = useState<'google' | 'community' | 'upload'>('google')
  const [showReport,        setShowReport]        = useState(false)
  const [refreshKey,        setRefreshKey]        = useState(0)

  useEffect(() => { setActiveGooglePhoto(0); setPhotoTab('google') }, [loc.id])
  useEffect(() => {
    if (!googleLoading && !googlePhotos.length && communityPhotos.length) setPhotoTab('community')
  }, [googleLoading, googlePhotos.length, communityPhotos.length])

  const hasGoogle    = googlePhotos.length > 0
  const hasCommunity = communityPhotos.length > 0
  const permitCfg    = PERMIT_CERTAINTY_CONFIG[(loc.permit_certainty as keyof typeof PERMIT_CERTAINTY_CONFIG) ?? 'unknown'] ?? PERMIT_CERTAINTY_CONFIG.unknown

  function shareWithClient() {
    sessionStorage.setItem('sharePreselectedLocation', JSON.stringify({ id: loc.id, name: loc.name, city: loc.city, lat: loc.lat, lng: loc.lng, access: loc.access, rating: loc.rating, bg: loc.bg, type: 'favorite' }))
    router.push('/share?step=3')
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,.5)', backdropFilter: 'blur(3px)', zIndex: 400 }} />
      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 600, background: 'white', borderRadius: '16px 16px 0 0', zIndex: 500, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 -8px 48px rgba(26,22,18,.25)', animation: 'slideUp .28s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--sand)' }} />
        </div>
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: '50%', background: 'rgba(26,22,18,.6)', border: 'none', cursor: 'pointer', fontSize: 16, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>✕</button>

        {/* Hero photo */}
        <div style={{ position: 'relative', height: 220, background: '#1a1612', overflow: 'hidden' }}>
          {photoTab === 'google' && (googleLoading
            ? <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className={loc.bg} style={{ position: 'absolute', inset: 0, opacity: 0.4 }} /><div style={{ width: 24, height: 24, border: '2px solid rgba(255,255,255,.2)', borderTop: '2px solid rgba(255,255,255,.7)', borderRadius: '50%', animation: 'spin .7s linear infinite', zIndex: 1 }} /></div>
            : hasGoogle ? <img src={googlePhotos[activeGooglePhoto].url} alt={loc.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div className={loc.bg} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', padding: 12 }}><div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>No Google photos</div></div>)
          }
          {photoTab === 'community' && (communityLoading
            ? <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className={loc.bg} style={{ position: 'absolute', inset: 0, opacity: 0.4 }} /><div style={{ width: 24, height: 24, border: '2px solid rgba(255,255,255,.2)', borderTop: '2px solid rgba(255,255,255,.7)', borderRadius: '50%', animation: 'spin .7s linear infinite', zIndex: 1 }} /></div>
            : hasCommunity ? <img src={communityPhotos[0].url} alt={loc.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div className={loc.bg} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}><span style={{ fontSize: 32 }}>📷</span><span style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>No community photos yet</span></div>)
          }
          {photoTab === 'upload' && <div className={loc.bg} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}><span style={{ fontSize: 36 }}>📷</span><span style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', fontWeight: 500 }}>Share your photos from here</span></div>}
          {photoTab !== 'upload' && (
            <div style={{ position: 'absolute', top: 10, left: 10, padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: loc.access === 'public' ? 'rgba(74,103,65,.85)' : 'rgba(181,75,42,.85)', color: loc.access === 'public' ? '#c8e8c4' : '#ffd0c0', backdropFilter: 'blur(4px)' }}>
              {loc.access === 'public' ? '● Public' : '🔒 Private'}
            </div>
          )}
          {photoTab === 'google' && hasGoogle && googlePhotos.length > 1 && (
            <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(26,22,18,.7)', borderRadius: 20, padding: '3px 10px', fontSize: 11, color: 'rgba(255,255,255,.8)' }}>{activeGooglePhoto + 1} / {googlePhotos.length}</div>
          )}
        </div>

        {/* Photo tabs */}
        <div style={{ borderBottom: '1px solid var(--cream-dark)', display: 'flex', overflowX: 'auto' }}>
          {[
            { key: 'google',    label: `Google${hasGoogle ? ` (${googlePhotos.length})` : ''}` },
            { key: 'community', label: `Photographer${hasCommunity ? ` (${communityPhotos.length})` : ''}` },
            { key: 'upload',    label: user ? '+ Add yours' : '📷 Sign in to add' },
          ].map(tab => (
            <button key={tab.key} onClick={() => { if (tab.key === 'upload' && !user) return; setPhotoTab(tab.key as any) }} style={{ padding: '8px 14px', fontSize: 12, fontWeight: 500, border: 'none', borderBottom: `2px solid ${photoTab === tab.key ? 'var(--gold)' : 'transparent'}`, background: 'white', color: photoTab === tab.key ? 'var(--ink)' : 'var(--ink-soft)', cursor: tab.key === 'upload' && !user ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: tab.key === 'upload' && !user ? 0.5 : 1, flexShrink: 0 }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Google strip */}
        {photoTab === 'google' && hasGoogle && googlePhotos.length > 1 && (
          <div style={{ display: 'flex', gap: 4, padding: '8px 1.25rem', overflowX: 'auto', borderBottom: '1px solid var(--cream-dark)' }}>
            {googlePhotos.map((photo, i) => (
              <div key={i} onClick={() => setActiveGooglePhoto(i)} style={{ width: 56, height: 56, borderRadius: 6, flexShrink: 0, overflow: 'hidden', cursor: 'pointer', border: `2px solid ${activeGooglePhoto === i ? 'var(--gold)' : 'transparent'}` }}>
                <img src={photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
          </div>
        )}
        {photoTab === 'google' && (
          <div style={{ padding: '6px 1.25rem', borderBottom: '1px solid var(--cream-dark)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <img src="https://developers.google.com/static/maps/documentation/images/google_on_white.png" alt="Google" style={{ height: 11, opacity: 0.4 }} />
            <span style={{ fontSize: 10, color: 'var(--ink-soft)' }}>Photos via Google Places · Not affiliated with LocateShoot</span>
          </div>
        )}

        {/* Community photos */}
        {photoTab === 'community' && hasCommunity && (
          <div style={{ padding: '8px 1.25rem', borderBottom: '1px solid var(--cream-dark)' }}>
            <div style={{ display: 'flex', gap: 4, overflowX: 'auto', marginBottom: 8 }}>
              {communityPhotos.map(photo => (
                <div key={photo.id} style={{ position: 'relative', width: 80, height: 80, borderRadius: 6, flexShrink: 0, overflow: 'hidden', border: '1px solid var(--cream-dark)' }}>
                  <img src={photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {photo.is_private && <div style={{ position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%', background: 'rgba(124,92,191,.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8 }}>🔒</div>}
                  {photo.photographer_name && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(26,22,18,.7)', padding: '2px 4px', fontSize: 8, color: 'rgba(255,255,255,.8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>📷 {photo.photographer_name}</div>}
                </div>
              ))}
            </div>
            {Array.from(new Set(communityPhotos.map(p => p.photographer_name).filter(Boolean))).map(name => {
              const count = communityPhotos.filter(p => p.photographer_name === name).length
              return (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-soft)', marginBottom: 3 }}>
                  <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(196,146,42,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'var(--gold)', flexShrink: 0 }}>{name!.charAt(0)}</span>
                  <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{name}</span>
                  <span>· {count} photo{count !== 1 ? 's' : ''}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* Upload panel */}
        {photoTab === 'upload' && user && (
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--cream-dark)' }}>
            <PhotoUploadPanel locationId={loc.id} user={user} onUpload={() => { setRefreshKey(k => k + 1); setPhotoTab('community') }} />
          </div>
        )}

        {/* Location info */}
        <div style={{ padding: '1rem 1.25rem 1.5rem' }}>
          <div style={{ fontFamily: 'var(--font-playfair), serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 3 }}>{loc.name}</div>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: '1rem' }}>📍 {loc.city}</div>

          {(loc.tags ?? []).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: '1rem' }}>
              {(loc.tags ?? []).map((t: string) => <span key={t} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, background: 'var(--cream-dark)', color: 'var(--ink-soft)', border: '1px solid var(--sand)' }}>{t}</span>)}
            </div>
          )}
          {loc.desc && <p style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.7, marginBottom: '1.25rem' }}>{loc.desc}</p>}

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: '1rem' }}>
            {[
              { icon: '🔒', label: 'Access',  value: loc.access === 'public' ? 'Free public access' : 'Private — booking required' },
              { icon: '⭐', label: 'Rating',  value: loc.rating !== '—' ? `${loc.rating} out of 5` : 'Not yet rated' },
              { icon: '❤',  label: 'Saves',   value: (loc.saves ?? 0) > 0 ? `${loc.saves} photographers` : 'Be the first!' },
              { icon: '📷', label: 'Photos',  value: `${hasGoogle ? googlePhotos.length + ' Google' : '0 Google'} · ${hasCommunity ? communityPhotos.length + ' community' : '0 community'}` },
            ].map(item => (
              <div key={item.label} style={{ background: 'var(--cream)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--cream-dark)' }}>
                <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-soft)', marginBottom: 4 }}>{item.icon} {item.label}</div>
                <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.4 }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* ── Permit info ── */}
          <div style={{ background: 'var(--cream)', border: '1px solid var(--cream-dark)', borderRadius: 8, padding: '12px 14px', marginBottom: '1rem' }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 10 }}>🔒 Permit Requirements</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: loc.permit_notes || loc.permit_website ? 8 : 0 }}>
              <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: permitCfg.bg, color: permitCfg.color, border: `1px solid ${permitCfg.border}` }}>
                {permitCfg.label}
              </span>
              {loc.permit_fee != null && loc.permit_fee > 0 && (
                <span style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 500 }}>Fee: ${loc.permit_fee}</span>
              )}
              {loc.permit_fee === 0 && <span style={{ fontSize: 12, color: 'var(--sage)' }}>Free permit</span>}
            </div>
            {loc.permit_notes && <div style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.55, marginBottom: 8 }}>{loc.permit_notes}</div>}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              {loc.permit_website && (
                <a href={loc.permit_website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--sky)', textDecoration: 'none', fontWeight: 500 }}>
                  View official permit info →
                </a>
              )}
              {loc.permit_scanned_at && (
                <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>
                  Last checked: {new Date(loc.permit_scanned_at).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, marginBottom: '1rem' }}>
            <button onClick={() => onToggleFavorite(loc.id as number)} style={{ flex: 1, padding: '12px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 500, background: isFav ? 'rgba(196,146,42,.1)' : 'var(--cream)', color: isFav ? 'var(--gold)' : 'var(--ink-soft)', border: `1px solid ${isFav ? 'rgba(196,146,42,.3)' : 'var(--cream-dark)'}`, transition: 'all .18s' }}>
              {isFav ? '♥ Saved' : '♡ Save to favorites'}
            </button>
            {user
              ? <button onClick={shareWithClient} style={{ flex: 1, padding: '12px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontFamily: 'inherit', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>🔗 Share with client</button>
              : <Link href="/" style={{ flex: 1, padding: '12px', borderRadius: 4, background: 'var(--ink)', color: 'var(--cream)', fontFamily: 'inherit', fontSize: 14, fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Join free to save →</Link>
            }
          </div>

          {/* ── Liability disclaimer ── */}
          <div style={{ padding: '10px 12px', background: 'rgba(196,146,42,.04)', border: '1px solid rgba(196,146,42,.15)', borderRadius: 6, marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--ink-soft)', lineHeight: 1.6, fontWeight: 300 }}>
              ⚠ <strong style={{ fontWeight: 500 }}>Disclaimer:</strong> LocateShoot provides location information for reference only. Always verify access rights, permit requirements, property ownership, and safety conditions before your session. Commercial photography may require permits even at public locations. LocateShoot is not responsible for any access restrictions, fines, property damage, or incidents at listed locations.
            </div>
          </div>

          {/* Report a correction */}
          <div style={{ textAlign: 'center' }}>
            <button onClick={() => setShowReport(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--ink-soft)', fontFamily: 'inherit', textDecoration: 'underline', padding: 0 }}>
              Report a correction
            </button>
          </div>
        </div>
      </div>
      {showReport && <ReportModal locName={loc.name} onClose={() => setShowReport(false)} />}
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ExplorePage() {
  const [locations,    setLocations]    = useState<ExploreLocation[]>([])
  const [dbLoading,    setDbLoading]    = useState(true)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locGranted,   setLocGranted]   = useState(false)
  const [locLoading,   setLocLoading]   = useState(false)
  const [activeId,     setActiveId]     = useState<number | null>(null)
  const [detailLoc,    setDetailLoc]    = useState<ExploreLocation | null>(null)
  const [favorites,    setFavorites]    = useState<Set<number>>(new Set())
  const [user,         setUser]         = useState<any>(null)
  const [toast,        setToast]        = useState<string | null>(null)
  const [searchQuery,  setSearchQuery]  = useState('')
  const [showAddModal, setShowAddModal] = useState(false)

  // ── Filters (all inside dropdown now) ────────────────────────────────────
  const [showFilters,   setShowFilters]   = useState(false)
  const [accessFilter,  setAccessFilter]  = useState<AccessFilter>('All')
  const [selectedTags,  setSelectedTags]  = useState<string[]>([])
  const [minRating,     setMinRating]     = useState(0)
  const [sortBy,        setSortBy]        = useState<SortValue>('quality')

  // Community photo thumbnails for sidebar cards
  const [photoMap, setPhotoMap] = useState<Record<string, string>>({})

  useEffect(() => { supabase.auth.getUser().then(({ data: { user } }) => setUser(user)) }, [])

  useEffect(() => {
    async function load() {
      setDbLoading(true)
      try {
        const { data, error } = await supabase
          .from('locations')
          .select('id,name,city,state,latitude,longitude,access_type,tags,quality_score,rating,save_count,description,created_at,added_by,permit_required,permit_notes,permit_fee,permit_website,permit_certainty,permit_scanned_at')
          .eq('status', 'published')
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .limit(500)
        if (error) throw error
        setLocations((data ?? []).map((loc, idx) => ({
          id:               loc.id,
          name:             loc.name,
          city:             loc.city && loc.state ? `${loc.city}, ${loc.state}` : (loc.city ?? loc.state ?? ''),
          lat:              loc.latitude,
          lng:              loc.longitude,
          access:           loc.access_type ?? 'public',
          rating:           loc.rating ? parseFloat(loc.rating).toFixed(1) : '—',
          ratingNum:        loc.rating ? parseFloat(loc.rating) : 0,
          bg:               BG_CYCLE[idx % BG_CYCLE.length],
          tags:             loc.tags ?? [],
          saves:            loc.save_count ?? 0,
          desc:             loc.description ?? '',
          qualityScore:     loc.quality_score ?? 0,
          createdAt:        loc.created_at,
          addedBy:          loc.added_by,
          permit_required:  loc.permit_required,
          permit_notes:     loc.permit_notes,
          permit_fee:       loc.permit_fee,
          permit_website:   loc.permit_website,
          permit_certainty: loc.permit_certainty ?? 'unknown',
          permit_scanned_at:loc.permit_scanned_at,
        })))
      } catch (err) { console.error(err) }
      finally { setDbLoading(false) }
    }
    load()
  }, [])

  // Batch-load community thumbnails for sidebar
  useEffect(() => {
    if (locations.length === 0) return
    const ids = locations.slice(0, 200).map(l => l.id).filter(Boolean)
    supabase.from('location_photos').select('location_id,url').in('location_id', ids).eq('is_private', false).limit(300)
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, string> = {}
        data.forEach((p: any) => { if (!map[p.location_id]) map[p.location_id] = p.url })
        setPhotoMap(map)
      })
  }, [locations])

  useEffect(() => {
    async function loadFavs() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('favorites').select('location_id').eq('user_id', user.id)
      if (data) setFavorites(new Set(data.map((f: any) => f.location_id)))
    }
    loadFavs()
  }, [user])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(id)
  }, [toast])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { setDetailLoc(null); setShowAddModal(false); setShowFilters(false) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function requestLocation() {
    if (!navigator.geolocation) { setToast('Geolocation not supported'); return }
    setLocLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => { setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocGranted(true); setLocLoading(false); setToast('📍 Showing locations near you!') },
      () => { setLocLoading(false); setToast('⚠ Could not get your location') },
      { timeout: 10000 }
    )
  }

  const handleMarkerClick = useCallback((id: number) => {
    const loc = locations.find(l => l.id === id)
    if (loc) { setDetailLoc(loc); setActiveId(id) }
  }, [locations])

  async function toggleFavorite(locId: number, e?: React.MouseEvent) {
    e?.stopPropagation()
    if (!user) { setToast('Sign in to save favorites'); return }
    if (favorites.has(locId)) {
      setFavorites(prev => { const n = new Set(prev); n.delete(locId); return n })
      setToast('Removed from favorites')
      await supabase.from('favorites').delete().eq('user_id', user.id).eq('location_id', locId)
    } else {
      setFavorites(prev => new Set([...prev, locId]))
      setToast('❤ Saved to favorites!')
      await supabase.from('favorites').insert({ user_id: user.id, location_id: locId })
    }
  }

  function toggleTag(tag: string) {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  const filtered = useMemo(() => {
    let result = locations.filter(loc => {
      const matchesAccess =
        accessFilter === 'All'          ? true :
        accessFilter === 'Public'       ? loc.access === 'public' :
        accessFilter === 'Private'      ? loc.access === 'private' :
        accessFilter === 'My Locations' ? (loc as any).addedBy === user?.id :
        true
      const matchesTags = selectedTags.length === 0 || selectedTags.some(t => (loc.tags ?? []).some((lt: string) => lt.toLowerCase().includes(t.toLowerCase())))
      const q = searchQuery.toLowerCase().trim()
      const matchesSearch = q === '' || loc.name.toLowerCase().includes(q) || loc.city.toLowerCase().includes(q) || (loc.tags ?? []).some((t: string) => t.toLowerCase().includes(q))
      const matchesRating = minRating === 0 || ((loc as any).ratingNum ?? 0) >= minRating
      return matchesAccess && matchesTags && matchesSearch && matchesRating
    })
    return [...result].sort((a, b) => {
      switch (sortBy) {
        case 'quality':    return ((b as any).qualityScore ?? 0) - ((a as any).qualityScore ?? 0)
        case 'rating_asc': return ((a as any).ratingNum ?? 0) - ((b as any).ratingNum ?? 0)
        case 'name':       return a.name.localeCompare(b.name)
        case 'newest':     return new Date((b as any).createdAt ?? 0).getTime() - new Date((a as any).createdAt ?? 0).getTime()
        case 'saves':      return (b.saves ?? 0) - (a.saves ?? 0)
        default:           return 0
      }
    })
  }, [locations, accessFilter, selectedTags, searchQuery, minRating, sortBy, user])

  const activeFilterCount = (accessFilter !== 'All' ? 1 : 0) + selectedTags.length + (minRating > 0 ? 1 : 0) + (sortBy !== 'quality' ? 1 : 0)

  function clearAllFilters() { setAccessFilter('All'); setSelectedTags([]); setMinRating(0); setSortBy('quality') }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* NAV */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', height: 56, background: 'rgba(26,22,18,.96)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(255,255,255,.07)', flexShrink: 0, zIndex: 200 }}>
        <Link href="/" style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 900, color: 'var(--cream)', display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', display: 'inline-block' }} />LocateShoot
        </Link>
        <div style={{ flex: 1, maxWidth: 400, margin: '0 1.5rem', position: 'relative' }}>
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search locations, tags, cities…" style={{ width: '100%', padding: '7px 14px 7px 34px', background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 6, color: 'var(--cream)', fontFamily: 'inherit', fontSize: 13, outline: 'none' }} />
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'rgba(245,240,232,.4)' }}>🔍</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {locGranted && <div style={{ fontSize: 12, color: 'rgba(245,240,232,.45)', display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sky)', display: 'inline-block' }} />Near you</div>}
          <button onClick={() => setShowAddModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 4, background: 'rgba(196,146,42,.15)', color: 'var(--gold)', border: '1px solid rgba(196,146,42,.3)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>+ Add location</button>
          {user
            ? <Link href="/dashboard" style={{ fontSize: 13, color: 'rgba(245,240,232,.55)', textDecoration: 'none' }}>Dashboard</Link>
            : <Link href="/" style={{ padding: '5px 14px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>Join Free</Link>
          }
        </div>
      </nav>

      {/* Location banner */}
      {!locGranted && (
        <div style={{ background: 'rgba(61,110,140,.08)', borderBottom: '1px solid rgba(61,110,140,.18)', padding: '8px 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--sky)', display: 'flex', alignItems: 'center', gap: 8 }}><span>📍</span>Allow location access to see photoshoot spots near you</div>
          <button onClick={requestLocation} disabled={locLoading} style={{ padding: '5px 16px', borderRadius: 4, background: 'var(--sky)', color: 'white', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: locLoading ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            {locLoading ? <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,.3)', borderTop: '2px solid white', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />Getting…</> : 'Use my location'}
          </button>
        </div>
      )}

      {/* ── Filter bar — button on LEFT, all options in dropdown ── */}
      <div style={{ background: 'white', borderBottom: '1px solid var(--cream-dark)', flexShrink: 0, zIndex: 100 }}>
        <div style={{ padding: '8px 1.5rem', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Filter button — LEFT */}
          <button
            onClick={() => setShowFilters(p => !p)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: `1px solid ${showFilters || activeFilterCount > 0 ? 'var(--gold)' : 'var(--cream-dark)'}`, background: showFilters || activeFilterCount > 0 ? 'rgba(196,146,42,.08)' : 'white', color: showFilters || activeFilterCount > 0 ? 'var(--gold)' : 'var(--ink-soft)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0, transition: 'all .15s' }}
          >
            ⚙ Filters &amp; Sort
            {activeFilterCount > 0 && <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--gold)', color: 'var(--ink)', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{activeFilterCount}</span>}
          </button>

          {/* Active filter pills */}
          {accessFilter !== 'All' && <span onClick={() => setAccessFilter('All')} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, background: 'var(--ink)', color: 'var(--cream)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>{accessFilter} ✕</span>}
          {selectedTags.map(t => <span key={t} onClick={() => toggleTag(t)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, background: 'var(--ink)', color: 'var(--cream)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>{t} ✕</span>)}
          {minRating > 0 && <span onClick={() => setMinRating(0)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, background: 'var(--ink)', color: 'var(--cream)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>★{minRating}+ ✕</span>}
          {sortBy !== 'quality' && <span onClick={() => setSortBy('quality')} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, background: 'var(--ink)', color: 'var(--cream)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>{SORT_OPTIONS.find(s => s.value === sortBy)?.label} ✕</span>}
          {activeFilterCount > 0 && <button onClick={clearAllFilters} style={{ fontSize: 11, color: 'var(--rust)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, fontWeight: 500, whiteSpace: 'nowrap' }}>Clear all</button>}
        </div>

        {/* Expanded filter dropdown */}
        {showFilters && (
          <div style={{ padding: '1rem 1.5rem 1.25rem', borderTop: '1px solid var(--cream-dark)', background: 'var(--cream)', display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: '1.5rem', alignItems: 'start' }}>
            {/* Access type */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 8 }}>Access</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(['All','Public','Private','My Locations'] as AccessFilter[]).map(opt => (
                  <button key={opt} onClick={() => setAccessFilter(opt)} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: `1px solid ${accessFilter === opt ? 'var(--gold)' : 'var(--cream-dark)'}`, background: accessFilter === opt ? 'rgba(196,146,42,.12)' : 'white', color: accessFilter === opt ? 'var(--gold)' : 'var(--ink-soft)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all .15s', textAlign: 'left' }}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 8 }}>Location type</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {ALL_TAGS.map(tag => (
                  <button key={tag} onClick={() => toggleTag(tag)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, border: `1px solid ${selectedTags.includes(tag) ? 'var(--gold)' : 'var(--cream-dark)'}`, background: selectedTags.includes(tag) ? 'rgba(196,146,42,.12)' : 'white', color: selectedTags.includes(tag) ? 'var(--gold)' : 'var(--ink-soft)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all .15s' }}>
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Rating */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 8 }}>Min rating</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {RATING_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => setMinRating(opt.value)} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: `1px solid ${minRating === opt.value ? 'var(--gold)' : 'var(--cream-dark)'}`, background: minRating === opt.value ? 'rgba(196,146,42,.12)' : 'white', color: minRating === opt.value ? 'var(--gold)' : 'var(--ink-soft)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all .15s', textAlign: 'left' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 8 }}>Sort by</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {SORT_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => setSortBy(opt.value as SortValue)} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: `1px solid ${sortBy === opt.value ? 'var(--gold)' : 'var(--cream-dark)'}`, background: sortBy === opt.value ? 'rgba(196,146,42,.12)' : 'white', color: sortBy === opt.value ? 'var(--gold)' : 'var(--ink-soft)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all .15s', textAlign: 'left' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '360px 1fr', overflow: 'hidden' }}>

        {/* Sidebar */}
        <div style={{ borderRight: '1px solid var(--cream-dark)', overflowY: 'auto', background: '#f9f6f1' }}>
          <div style={{ padding: '1rem 1.25rem .5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
              {dbLoading ? <span style={{ color: 'var(--ink-soft)', fontWeight: 300 }}>Loading…</span>
                : <>{filtered.length} location{filtered.length !== 1 ? 's' : ''}{locations.length > 0 && <span style={{ fontWeight: 300, color: 'var(--ink-soft)', fontSize: 11 }}> · {locations.length} total</span>}</>}
            </div>
            {!dbLoading && <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{SORT_OPTIONS.find(s => s.value === sortBy)?.label}</div>}
          </div>

          {dbLoading ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <div style={{ width: 28, height: 28, border: '2px solid var(--cream-dark)', borderTop: '2px solid var(--gold)', borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300 }}>Loading locations…</div>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 6 }}>{locations.length === 0 ? 'No locations yet' : 'No matches found'}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300 }}>{locations.length === 0 ? 'Run the AI scanner from your dashboard.' : 'Try adjusting your filters.'}</div>
              {activeFilterCount > 0 && <button onClick={clearAllFilters} style={{ marginTop: 12, padding: '6px 16px', borderRadius: 20, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Clear filters</button>}
            </div>
          ) : filtered.map(loc => {
            const isActive = activeId === loc.id
            const isFav    = favorites.has(loc.id as number)
            const thumb    = photoMap[loc.id]
            return (
              <div key={loc.id} onClick={() => { setDetailLoc(loc); setActiveId(loc.id as number) }} style={{ display: 'flex', gap: 10, padding: '10px 1.25rem', borderBottom: '1px solid var(--cream-dark)', cursor: 'pointer', transition: 'background .15s', background: isActive ? 'rgba(196,146,42,.06)' : 'white', borderLeft: `3px solid ${isActive ? 'var(--gold)' : 'transparent'}` }}>
                {/* Thumbnail — real photo if available */}
                <div className={loc.bg} style={{ width: 56, height: 56, borderRadius: 8, flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
                  {thumb && <img src={thumb} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                  {loc.rating !== '—' && <div style={{ position: 'absolute', bottom: 3, right: 3, background: 'rgba(26,22,18,.75)', borderRadius: 4, padding: '1px 5px', fontSize: 10, fontWeight: 600, color: 'var(--gold)', backdropFilter: 'blur(2px)', zIndex: 1 }}>★{loc.rating}</div>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 4 }}>📍 {loc.city}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <span style={{ padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: loc.access === 'public' ? 'rgba(74,103,65,.1)' : 'rgba(181,75,42,.1)', color: loc.access === 'public' ? 'var(--sage)' : 'var(--rust)', border: `1px solid ${loc.access === 'public' ? 'rgba(74,103,65,.2)' : 'rgba(181,75,42,.2)'}` }}>
                      {loc.access === 'public' ? '● Public' : '🔒 Private'}
                    </span>
                    {(loc as any).permit_scanned_at && (
                      <span style={{ fontSize: 9, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                        Permit checked {new Date((loc as any).permit_scanned_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={e => toggleFavorite(loc.id as number, e)} style={{ width: 28, height: 28, borderRadius: '50%', border: `1px solid ${isFav ? 'rgba(196,146,42,.4)' : 'var(--cream-dark)'}`, background: isFav ? 'rgba(196,146,42,.1)' : 'white', cursor: 'pointer', fontSize: 14, color: isFav ? 'var(--gold)' : 'var(--ink-soft)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }}>
                  {isFav ? '♥' : '♡'}
                </button>
              </div>
            )
          })}
        </div>

        {/* Map */}
        <div style={{ position: 'relative' }}>
          <ExploreMap locations={filtered} activeId={activeId} userLocation={userLocation} onMarkerClick={handleMarkerClick} />
          <div style={{ position: 'absolute', bottom: 24, left: 16, zIndex: 500, background: 'white', borderRadius: 8, padding: '.75rem 1rem', border: '1px solid var(--cream-dark)', boxShadow: '0 4px 16px rgba(26,22,18,.1)' }}>
            {[{ color: '#4a6741', label: 'Public location' }, { color: '#b54b2a', label: 'Private venue' }, { color: '#c4922a', label: 'Selected' }, { color: '#3d6e8c', label: 'You are here' }].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--ink-mid)', marginBottom: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, border: '2px solid white', flexShrink: 0 }} />{item.label}
              </div>
            ))}
          </div>
          {!dbLoading && locations.length > 0 && (
            <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 500, background: 'rgba(26,22,18,.85)', backdropFilter: 'blur(4px)', borderRadius: 20, padding: '5px 12px', fontSize: 12, color: 'var(--cream)', border: '1px solid rgba(255,255,255,.1)' }}>
              📍 {filtered.length} of {locations.length} locations shown
            </div>
          )}
        </div>
      </div>

      {detailLoc && (
        <DetailPanel loc={detailLoc as any} isFav={favorites.has(detailLoc.id as number)} onClose={() => setDetailLoc(null)} onToggleFavorite={toggleFavorite} user={user} />
      )}
      {showAddModal && <AddLocationModal onClose={() => setShowAddModal(false)} user={user} />}

      {toast && (
        <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', background: 'var(--ink)', color: 'var(--cream)', padding: '10px 18px', borderRadius: 10, fontSize: 13, border: '1px solid rgba(255,255,255,.1)', zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,.3)', animation: 'toast-in .25s ease' }}>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp {
          from { transform: translateX(-50%) translateY(40px); opacity: 0; }
          to   { transform: translateX(-50%) translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  )
}