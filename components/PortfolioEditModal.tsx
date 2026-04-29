'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ImageLightbox from '@/components/ImageLightbox'
import AddressSearch, { type AddressResult } from '@/components/AddressSearch'
import { thumbUrl } from '@/lib/image'
import { useReorderDrag } from '@/hooks/useReorderDrag'
import { validateImageUpload } from '@/lib/upload-validate'
import { compressImageIfNeeded } from '@/lib/image-compress'

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
  pinterest_url: string | null; blog_url: string | null
  is_secret: boolean; source_location_id: string | null
}

interface PhotoRow { id: string; url: string; storage_path: string; caption: string | null; sort_order?: number | null; season?: 'spring' | 'summer' | 'fall' | 'winter' | null }

type Season = 'spring' | 'summer' | 'fall' | 'winter'
const SEASONS: { value: Season; label: string; emoji: string }[] = [
  { value: 'spring', label: 'Spring', emoji: '🌸' },
  { value: 'summer', label: 'Summer', emoji: '☀️' },
  { value: 'fall',   label: 'Fall',   emoji: '🍂' },
  { value: 'winter', label: 'Winter', emoji: '❄️' },
]

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
  const [permitFee,      setPermitFee]      = useState('')
  const [permitWebsite,  setPermitWebsite]  = useState('')
  const [bestTime,       setBestTime]       = useState('')
  const [parkingInfo,    setParkingInfo]    = useState('')
  const [pinterestUrl,   setPinterestUrl]   = useState('')
  const [blogUrl,        setBlogUrl]        = useState('')
  // Multiple labeled session links (e.g. "Family session" → gallery
  // URL). Stored on portfolio_locations.session_links as JSONB. Each
  // entry has a stable local id so React keys survive reordering.
  const [sessionLinks,   setSessionLinks]   = useState<Array<{ id: string; label: string; url: string }>>([])
  function addSessionLink() {
    setSessionLinks(prev => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label: '', url: '' }])
  }
  function updateSessionLink(id: string, key: 'label' | 'url', value: string) {
    setSessionLinks(prev => prev.map(l => l.id === id ? { ...l, [key]: value } : l))
  }
  function removeSessionLink(id: string) {
    setSessionLinks(prev => prev.filter(l => l.id !== id))
  }
  function sessionLinksPayload(): { label: string; url: string }[] {
    return sessionLinks
      .map(l => ({ label: l.label.trim(), url: l.url.trim() }))
      .filter(l => l.label && l.url)
  }
  const [hideGooglePhotos, setHideGooglePhotos] = useState(false)
  // Seasonal organization opt-in. When on, the photo uploader splits
  // into 4 sections (Spring/Summer/Fall/Winter) and the Pick page
  // renders a tab strip above the gallery so clients can browse by
  // season. Off keeps the existing flat uploader + gallery.
  const [showSeasons, setShowSeasons] = useState(false)
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
  // Tracks which season (if any) the next file-picker dialog should
  // tag uploads with. Set by triggerUpload() right before the hidden
  // <input type="file"> is clicked, then read in the onChange handler.
  // `undefined` means "showSeasons is off — don't tag at all".
  const [pendingSeason, setPendingSeason] = useState<Season | null | undefined>(undefined)
  function triggerUpload(season: Season | null | undefined) {
    setPendingSeason(season)
    fileRef.current?.click()
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [rowRes, photosRes] = await Promise.all([
        supabase.from('portfolio_locations').select('id,name,description,city,state,latitude,longitude,access_type,tags,permit_required,permit_notes,permit_fee,permit_website,best_time,parking_info,pinterest_url,blog_url,session_links,show_seasons,is_secret,source_location_id,hide_google_photos').eq('id', portfolioId).single(),
        supabase.from('location_photos').select('id,url,storage_path,caption,sort_order,season').eq('portfolio_location_id', portfolioId).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
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
        setPermitFee((rowRes.data as any).permit_fee ?? '')
        setPermitWebsite((rowRes.data as any).permit_website ?? '')

        // Auto-fill the permit URL from the curated source location
        // when the photographer hasn't set their own. Saves them
        // pasting in a URL that's already known on the public side.
        // Only fires when:
        //   - the portfolio row was created from a curated source
        //     (source_location_id is set), AND
        //   - the photographer's own permit_website is blank
        // The fetched value is loaded into the input as a draft —
        // the photographer can edit, clear, or save as-is.
        const sourceId = (rowRes.data as any).source_location_id as string | null
        const ownPermitWebsite = (rowRes.data as any).permit_website as string | null
        if (sourceId && !ownPermitWebsite) {
          const { data: src } = await supabase
            .from('locations')
            .select('permit_website')
            .eq('id', sourceId)
            .maybeSingle()
          if (!cancelled && src?.permit_website) setPermitWebsite(src.permit_website)
        }
        setBestTime(rowRes.data.best_time ?? '')
        setParkingInfo(rowRes.data.parking_info ?? '')
        setPinterestUrl(rowRes.data.pinterest_url ?? '')
        setBlogUrl(rowRes.data.blog_url ?? '')
        // Hydrate session_links — DB stores [{label,url}], we add a
        // local id for stable React keys. Empty / missing column =
        // empty list (migration may not be applied yet).
        const rawLinks = (rowRes.data as any).session_links
        if (Array.isArray(rawLinks)) {
          setSessionLinks(rawLinks.map((l: any, i: number) => ({
            id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            label: typeof l?.label === 'string' ? l.label : '',
            url:   typeof l?.url   === 'string' ? l.url   : '',
          })))
        }
        setHideGooglePhotos(!!rowRes.data.hide_google_photos)
        setShowSeasons(!!(rowRes.data as any).show_seasons)
        setLat(rowRes.data.latitude ?? null)
        setLng(rowRes.data.longitude ?? null)
      }
      if (photosRes.data) setPhotos(photosRes.data as PhotoRow[])
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
    // Always attempt the full update (including pinterest_url + blog_url
    // from migration 20260425_portfolio_links). When that migration
    // hasn't been run yet, Supabase returns "Could not find the
    // 'pinterest_url' column" / similar — retry without those two fields
    // so the rest of the edit still saves. Once the migration lands the
    // first attempt succeeds and the fallback never runs.
    const baseUpdate = {
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
      is_secret:          false,
      hide_google_photos: hideGooglePhotos,
      latitude:           lat,
      longitude:          lng,
    }
    // Optimistic full update — includes columns from both later
    // migrations (20260425_portfolio_links: pinterest_url + blog_url,
    // 20260427_portfolio_permit_fields: permit_fee + permit_website).
    // Falls back stepwise when columns are missing so the rest of the
    // edit still saves on a Supabase instance that hasn't run them.
    const sessionLinksJson = sessionLinksPayload()
    let { error } = await supabase.from('portfolio_locations').update({
      ...baseUpdate,
      pinterest_url:  pinterestUrl.trim() || null,
      blog_url:       blogUrl.trim() || null,
      permit_fee:     permitFee.trim() || null,
      permit_website: permitWebsite.trim() || null,
      session_links:  sessionLinksJson,
      show_seasons:   showSeasons,
    }).eq('id', portfolioId)
    if (error && /show_seasons/.test(error.message ?? '')) {
      // show_seasons column missing (migration 20260428_seasonal_photos
      // hasn't run) — drop it and retry with the rest intact.
      const retry = await supabase.from('portfolio_locations').update({
        ...baseUpdate,
        pinterest_url:  pinterestUrl.trim() || null,
        blog_url:       blogUrl.trim() || null,
        permit_fee:     permitFee.trim() || null,
        permit_website: permitWebsite.trim() || null,
        session_links:  sessionLinksJson,
      }).eq('id', portfolioId)
      error = retry.error
    }
    if (error && /session_links/.test(error.message ?? '')) {
      // session_links column missing (migration 20260428_session_links
      // hasn't run) — drop it and retry with the rest intact.
      const retry = await supabase.from('portfolio_locations').update({
        ...baseUpdate,
        pinterest_url:  pinterestUrl.trim() || null,
        blog_url:       blogUrl.trim() || null,
        permit_fee:     permitFee.trim() || null,
        permit_website: permitWebsite.trim() || null,
      }).eq('id', portfolioId)
      error = retry.error
    }
    if (error && /permit_fee|permit_website/.test(error.message ?? '')) {
      // Permit fields missing — retry with just the link cols.
      const retry = await supabase.from('portfolio_locations').update({
        ...baseUpdate,
        pinterest_url: pinterestUrl.trim() || null,
        blog_url:      blogUrl.trim() || null,
      }).eq('id', portfolioId)
      error = retry.error
    }
    if (error && /pinterest_url|blog_url/.test(error.message ?? '')) {
      // Link cols also missing — retry with the original base set.
      const retry = await supabase.from('portfolio_locations').update(baseUpdate).eq('id', portfolioId)
      error = retry.error
    }
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

  async function handleUpload(files: File[], season: Season | null | undefined) {
    if (!files.length) return
    setUploading(true); setErr('')
    const { data: p } = await supabase.from('profiles').select('full_name').eq('id', userId).single()
    const uploaded: PhotoRow[] = []
    // Start new photos at the end of the current order.
    let nextOrder = photos.length
    let firstError: string | null = null
    for (const raw of files) {
      try {
        // Auto-resize files over the 10MB cap before validation —
        // a 30MB raw camera export gets shrunk to a web-friendly size
        // so the photographer doesn't have to hand-resize. Files
        // already under the cap pass through unchanged.
        let f = raw
        try { f = await compressImageIfNeeded(raw) }
        catch (e: any) { if (!firstError) firstError = e?.message ?? `Couldn't process ${raw.name}`; continue }
        // Centralized image validation: blocks SVG (script-bearing
        // XSS risk when served via getPublicUrl), enforces 10MB cap,
        // and normalizes the extension/MIME so iOS screenshots with
        // no .name extension still get a sensible suffix.
        const v = validateImageUpload(f)
        if (!v.ok) { if (!firstError) firstError = v.message; continue }
        const path = `${userId}/portfolio/${portfolioId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${v.ext}`
        const { error: ue } = await supabase.storage.from('location-photos').upload(path, f, { contentType: v.contentType })
        if (ue) {
          console.error('storage upload failed', ue, { path, name: f.name, size: f.size, type: f.type })
          if (!firstError) firstError = `Upload failed: ${ue.message ?? 'storage rejected the file'}`
          continue
        }
        const { data: pub } = supabase.storage.from('location-photos').getPublicUrl(path)
        // season is undefined when seasonal organization is off — we
        // omit the column entirely so the DB default applies. season
        // === null is an explicit "year-round" tag that we DO want to
        // write (in case the photographer uploads year-round photos
        // alongside seasonal ones).
        const insertPayload: Record<string, unknown> = {
          portfolio_location_id: portfolioId,
          user_id: userId,
          url: pub.publicUrl,
          storage_path: path,
          is_private: false,
          photographer_name: p?.full_name ?? null,
          sort_order: nextOrder++,
        }
        if (season !== undefined) insertPayload.season = season
        let insertResp = await supabase.from('location_photos').insert(insertPayload).select('id,url,storage_path,caption,sort_order,season').single()
        if (insertResp.error && season !== undefined && /season/.test(insertResp.error.message ?? '')) {
          // Migration 20260428_seasonal_photos hasn't run yet — drop
          // the season tag and retry so the photo still gets saved.
          delete insertPayload.season
          insertResp = await supabase.from('location_photos').insert(insertPayload).select('id,url,storage_path,caption,sort_order,season').single()
        }
        if (insertResp.error) {
          console.error('location_photos insert failed', insertResp.error, { path })
          if (!firstError) firstError = `Saved to storage but database insert failed: ${insertResp.error.message}`
          // Try to clean up the orphaned storage object so we don't
          // leave dangling files when the DB row insert keeps failing.
          await supabase.storage.from('location-photos').remove([path]).catch(() => {})
          continue
        }
        if (insertResp.data) uploaded.push(insertResp.data as PhotoRow)
      } catch (e: any) {
        console.error('upload threw', e, { name: raw.name })
        if (!firstError) firstError = e?.message ?? 'Upload threw an unexpected error.'
      }
    }
    setPhotos(prev => [...prev, ...uploaded])
    setUploading(false)
    setPendingSeason(undefined)
    if (fileRef.current) fileRef.current.value = ''
    if (uploaded.length === 0 && firstError) {
      setErr(firstError)
    } else if (firstError && uploaded.length > 0) {
      setErr(`${uploaded.length} of ${files.length} uploaded — ${firstError}`)
    }
  }

  // Move an already-uploaded photo to a different season. Used by the
  // small dropdown on each photo card when seasonal organization is on,
  // so photographers can shuffle photos between Spring/Summer/Fall/
  // Winter without re-uploading. Only the four named seasons are
  // valid targets — null tags are an inherited state, not a choice.
  async function updatePhotoSeason(photoId: string, season: Season) {
    const previous = photos
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, season } : p))
    const { error } = await supabase.from('location_photos').update({ season }).eq('id', photoId)
    if (error) {
      setPhotos(previous)
      setErr(`Could not change season: ${error.message}`)
    }
  }

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 5 }
  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--cream-dark)', borderRadius: 4, fontFamily: 'var(--font-dm-sans),sans-serif', fontSize: 14, color: 'var(--ink)', background: 'white', outline: 'none' }
  const cityLine = row ? [row.city, row.state].filter(Boolean).join(', ') : ''

  // Single photo tile. Reused across the flat grid (showSeasons off)
  // and each per-season section (showSeasons on). The optional badge
  // is the "#N" position chip — only shown in the flat grid where
  // global sort_order maps to a meaningful position.
  function renderPhotoCard(p: PhotoRow, indexBadge?: string) {
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
          touchAction: 'pan-y',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
      >
        <img
          src={thumbUrl(p.url) ?? p.url}
          alt=""
          decoding="async"
          onClick={() => setLightboxSrc(p.url)}
          onError={e => { if (e.currentTarget.src !== p.url) e.currentTarget.src = p.url }}
          style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in' }}
        />
        {indexBadge && (
          <div style={{ position: 'absolute', top: 4, left: 4, padding: '1px 6px', borderRadius: 10, background: 'rgba(26,22,18,.75)', color: 'white', fontSize: 10, fontWeight: 600 }}>{indexBadge}</div>
        )}
        <button onClick={e => { e.stopPropagation(); deletePhoto(p) }} style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', background: 'rgba(26,22,18,.75)', border: 'none', cursor: 'pointer', fontSize: 11, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        {showSeasons && (
          <select
            value={p.season ?? ''}
            onClick={e => e.stopPropagation()}
            onChange={e => {
              const v = e.target.value
              if (v === 'spring' || v === 'summer' || v === 'fall' || v === 'winter') updatePhotoSeason(p.id, v)
            }}
            style={{ position: 'absolute', bottom: 4, left: 4, right: 4, fontSize: 10, padding: '2px 4px', borderRadius: 4, background: 'rgba(26,22,18,.85)', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit', appearance: 'none', WebkitAppearance: 'none', textAlign: 'center' }}
          >
            {/* Placeholder shown when the photo has no season tag yet
                — disabled so the photographer must pick one of the
                four real seasons rather than reset back to untagged. */}
            <option value="" disabled hidden>Pick season</option>
            <option value="spring">🌸 Spring</option>
            <option value="summer">☀️ Summer</option>
            <option value="fall">🍂 Fall</option>
            <option value="winter">❄️ Winter</option>
          </select>
        )}
      </div>
    )
  }

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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '1rem' }}>
                <div>
                  <label style={labelStyle}>📌 Pinterest board</label>
                  <input value={pinterestUrl} onChange={e => setPinterestUrl(e.target.value)} style={inputStyle} placeholder="https://pinterest.com/…" />
                </div>
                <div>
                  <label style={labelStyle}>✍ Blog post</label>
                  <input value={blogUrl} onChange={e => setBlogUrl(e.target.value)} style={inputStyle} placeholder="https://yoursite.com/blog/…" />
                </div>
              </div>

              {/* Session links — labeled URLs to feature on the Pick
                  page (e.g. "Family session" → gallery URL). Repeating
                  rows; empty rows are dropped on save. */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>🔗 Session links (optional)</label>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: -2, marginBottom: 8, fontWeight: 300 }}>
                  Add a labeled link for each session type you want to feature here. They show up as buttons on the client&apos;s Pick page.
                </div>
                {sessionLinks.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                    {sessionLinks.map(link => (
                      <div key={link.id} style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                        <input
                          value={link.label}
                          onChange={e => updateSessionLink(link.id, 'label', e.target.value)}
                          placeholder="Family session"
                          style={{ ...inputStyle, flex: '0 0 36%' }}
                          maxLength={40}
                        />
                        <input
                          value={link.url}
                          onChange={e => updateSessionLink(link.id, 'url', e.target.value)}
                          placeholder="https://yoursite.com/families/…"
                          style={{ ...inputStyle, flex: 1 }}
                        />
                        <button
                          type="button"
                          onClick={() => removeSessionLink(link.id)}
                          aria-label="Remove this session link"
                          style={{ padding: '0 12px', borderRadius: 4, border: '1px solid rgba(181,75,42,.25)', background: 'rgba(181,75,42,.06)', color: 'var(--rust)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={addSessionLink}
                  style={{ padding: '6px 12px', borderRadius: 4, border: '1px dashed var(--sand)', background: 'transparent', color: 'var(--ink-soft)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
                >+ Add session link</button>
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
                  <>
                    <textarea value={permitNotes} onChange={e => setPermitNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical', marginTop: 4 }} placeholder="Details — what kind of permit, how to apply, etc." />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginTop: 8 }}>
                      <input
                        value={permitFee}
                        onChange={e => setPermitFee(e.target.value)}
                        style={inputStyle}
                        placeholder="Fee (e.g. $25)"
                      />
                      <input
                        value={permitWebsite}
                        onChange={e => setPermitWebsite(e.target.value)}
                        style={inputStyle}
                        placeholder="Permit URL (https://...) — where clients can buy it"
                        type="url"
                      />
                    </div>
                  </>
                )}
              </div>

              <div onClick={() => setHideGooglePhotos(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, marginBottom: '1.25rem', cursor: 'pointer', background: hideGooglePhotos ? 'rgba(61,110,140,.06)' : 'var(--cream)', border: `1px solid ${hideGooglePhotos ? 'rgba(61,110,140,.3)' : 'var(--cream-dark)'}` }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${hideGooglePhotos ? 'var(--sky)' : 'var(--sand)'}`, background: hideGooglePhotos ? 'var(--sky)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white' }}>{hideGooglePhotos ? '✓' : ''}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>Do not show photos from Google</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, marginTop: 2 }}>Clients will only see your uploaded photos for this location.</div>
                </div>
              </div>

              {/* Seasonal organization opt-in. Off by default — when
                  on, the photo uploader below splits into per-season
                  sections and the Pick page shows season tabs above
                  the gallery for clients. */}
              <div onClick={() => setShowSeasons(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, marginBottom: '0.75rem', cursor: 'pointer', background: showSeasons ? 'rgba(196,146,42,.06)' : 'var(--cream)', border: `1px solid ${showSeasons ? 'rgba(196,146,42,.3)' : 'var(--cream-dark)'}` }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${showSeasons ? 'var(--gold)' : 'var(--sand)'}`, background: showSeasons ? 'var(--gold)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white' }}>{showSeasons ? '✓' : ''}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>🍂 Photos from different seasons</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, marginTop: 2 }}>Tag uploads by season — clients see Spring/Summer/Fall/Winter tabs above the photo gallery.</div>
                </div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <input ref={fileRef} type="file" accept="image/*" multiple onChange={e => { handleUpload(Array.from(e.target.files ?? []), pendingSeason) }} style={{ display: 'none' }} />
                {!showSeasons ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <label style={{ ...labelStyle, marginBottom: 0 }}>Your photos <span style={{ fontSize: 10, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-soft)' }}>({photos.length})</span></label>
                      <button onClick={() => triggerUpload(undefined)} disabled={uploading} style={{ padding: '5px 12px', borderRadius: 4, background: 'var(--ink)', color: 'var(--cream)', border: 'none', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {uploading ? 'Uploading…' : '+ Upload photos'}
                      </button>
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
                          {photos.map((p, i) => renderPhotoCard(p, String(i + 1)))}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <label style={{ ...labelStyle, marginBottom: 8 }}>Your photos <span style={{ fontSize: 10, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-soft)' }}>({photos.length})</span></label>
                    <div style={{ fontSize: 10, color: 'var(--ink-soft)', fontStyle: 'italic', marginBottom: 10 }}>
                      Upload to a specific season, or use the dropdown on any photo to retag it.
                    </div>
                    {/* Rescue section for photos that exist on this
                        location with no season tag — usually photos
                        uploaded BEFORE the photographer flipped on
                        seasonal organization. They're hidden from
                        clients (who only see the four season tabs),
                        so we surface them here with a clear "pick a
                        season" prompt instead of letting them silently
                        disappear from the UI. */}
                    {(() => {
                      const untagged = photos.filter(p => !p.season)
                      if (untagged.length === 0) return null
                      return (
                        <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, background: 'rgba(196,146,42,.08)', border: '1px solid rgba(196,146,42,.35)' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
                            ⚠ Without a season tag <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--ink-soft)', marginLeft: 6 }}>({untagged.length})</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 8, fontWeight: 300 }}>
                            Pick a season for each below — clients won&apos;t see these until they&apos;re tagged.
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 8 }}>
                            {untagged.map(p => renderPhotoCard(p))}
                          </div>
                        </div>
                      )
                    })()}
                    {SEASONS.map(section => {
                      const items = photos.filter(p => p.season === section.value)
                      return (
                        <div key={section.label} style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, background: 'var(--cream)', border: '1px solid var(--cream-dark)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                              {section.emoji} {section.label}
                              <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--ink-soft)', marginLeft: 6 }}>({items.length})</span>
                            </div>
                            <button onClick={() => triggerUpload(section.value)} disabled={uploading} style={{ padding: '4px 10px', borderRadius: 4, background: 'var(--ink)', color: 'var(--cream)', border: 'none', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                              {uploading && pendingSeason === section.value ? 'Uploading…' : `+ Add ${section.label.toLowerCase()}`}
                            </button>
                          </div>
                          {items.length === 0 ? (
                            <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, fontStyle: 'italic' }}>No {section.label.toLowerCase()} photos yet.</div>
                          ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 8 }}>
                              {items.map(p => renderPhotoCard(p))}
                            </div>
                          )}
                        </div>
                      )
                    })}
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
