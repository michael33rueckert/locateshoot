'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { validateImageUpload } from '@/lib/upload-validate'
import { compressImageIfNeeded } from '@/lib/image-compress'

// Admin-only photo manager for a public location row. Opens from the
// Explore detail panel's admin block. Shows every photo currently
// attached to the location (admin uploads, seeded Google/Wikipedia
// photos, whatever), lets the admin upload new photos, and lets them
// delete any photo — the admin RLS bypass migration
// (20260624_admin_rls_bypass.sql) gives them both storage and DB
// access to any row.
//
// New uploads go to location-photos/admin/<location_id>/ so they're
// grouped and easy to audit. Existing seed rows use synthetic
// storage_path values ('external:google', 'external:wiki') and don't
// live in storage at all — for those we only delete the DB row.

interface PhotoRow {
  id:                string
  url:               string
  storage_path:      string | null
  caption:           string | null
  photographer_name: string | null
  created_at:        string
  sort_order:        number | null
}

export default function LocationPhotosModal({
  locationId, locationName, userId, adminName, onClose, onChanged,
}: {
  locationId:   string
  locationName: string
  userId:       string
  // The admin's display name — stamped as photographer_name on any
  // photo the admin uploads so downstream code can distinguish them
  // from Google seeds (which use 'Google') and photographer uploads
  // (which use their profile.full_name).
  adminName:    string | null
  onClose:      () => void
  onChanged:    () => void
}) {
  const [photos,    setPhotos]    = useState<PhotoRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [deleteId,  setDeleteId]  = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: e } = await supabase
      .from('location_photos')
      .select('id,url,storage_path,caption,photographer_name,created_at,sort_order')
      .eq('location_id', locationId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    setLoading(false)
    if (e) { setError(e.message); return }
    setPhotos((data ?? []) as PhotoRow[])
  }, [locationId])

  useEffect(() => { load() }, [load])

  async function onFilesPicked(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)
    const arr = Array.from(files)
    setUploadProgress({ done: 0, total: arr.length })
    let successCount = 0
    for (let i = 0; i < arr.length; i++) {
      const raw = arr[i]
      try {
        // Compress oversize files client-side first — the 10 MB cap
        // is generous but iPhone camera raws routinely blow past it.
        let f: File
        try { f = await compressImageIfNeeded(raw) }
        catch (compressErr: any) {
          throw new Error(compressErr?.message ?? 'Could not process this image')
        }
        const v = validateImageUpload(f)
        if (!v.ok) throw new Error(v.message)
        const path = `admin/${locationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${v.ext}`
        const { error: ue } = await supabase.storage.from('location-photos').upload(path, f, { contentType: v.contentType })
        if (ue) throw new Error(ue.message)
        const { data: pub } = supabase.storage.from('location-photos').getPublicUrl(path)
        const { error: ie } = await supabase.from('location_photos').insert({
          location_id:       locationId,
          user_id:           userId,
          url:               pub.publicUrl,
          storage_path:      path,
          is_private:        false,
          caption:           null,
          photographer_name: adminName || null,
        })
        if (ie) throw new Error(ie.message)
        successCount++
      } catch (err: any) {
        console.error('admin photo upload failed', err)
        setError(err?.message ?? 'Upload failed')
      }
      setUploadProgress({ done: i + 1, total: arr.length })
    }
    setUploading(false)
    setUploadProgress(null)
    if (fileRef.current) fileRef.current.value = ''
    await load()
    if (successCount > 0) onChanged()
  }

  async function confirmDelete(p: PhotoRow) {
    if (deleteId !== p.id) { setDeleteId(p.id); return }
    setDeleteId(null)
    setError(null)
    try {
      if (p.storage_path && !p.storage_path.startsWith('external:')) {
        // Best-effort storage cleanup — the DB delete is the source
        // of truth. A dangling object is harmless (just wasted bytes)
        // but a lingering row would keep showing a broken photo.
        const { error: se } = await supabase.storage.from('location-photos').remove([p.storage_path])
        if (se) console.warn('storage remove failed (row still deleted)', se)
      }
      const { error: de } = await supabase.from('location_photos').delete().eq('id', p.id)
      if (de) throw de
      await load()
      onChanged()
    } catch (err: any) {
      setError(err?.message ?? 'Delete failed')
    }
  }

  const modalWidth = 720

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,.6)', backdropFilter: 'blur(4px)', zIndex: 5000 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'white', borderRadius: 12, width: modalWidth, maxWidth: '94vw', maxHeight: '92svh', overflow: 'hidden', zIndex: 5001, boxShadow: '0 24px 64px rgba(0,0,0,.3)', display: 'flex', flexDirection: 'column' }}>

        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--cream-dark)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📷 {locationName}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, marginTop: 2 }}>{photos.length} photo{photos.length === 1 ? '' : 's'} attached · uploads appear on the Explore map immediately</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--cream-dark)', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--ink-soft)', flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--cream-dark)', flexShrink: 0 }}>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
            multiple
            onChange={e => onFilesPicked(e.target.files)}
            disabled={uploading}
            style={{ display: 'none' }}
          />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{ padding: '9px 18px', borderRadius: 6, background: uploading ? 'rgba(196,146,42,.4)' : 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 13, fontWeight: 600, cursor: uploading ? 'default' : 'pointer', fontFamily: 'inherit' }}>
              {uploading
                ? uploadProgress ? `Uploading ${uploadProgress.done} / ${uploadProgress.total}…` : 'Uploading…'
                : '+ Upload photos'}
            </button>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.5 }}>
              JPG, PNG, WebP, GIF, HEIC. Pictures over 10&nbsp;MB are compressed automatically.
            </div>
          </div>
          {error && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(181,75,42,.08)', border: '1px solid rgba(181,75,42,.25)', borderRadius: 6, fontSize: 12, color: 'var(--rust)' }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ padding: '1rem 1.25rem', overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', fontSize: 13, color: 'var(--ink-soft)' }}>Loading photos…</div>
          ) : photos.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📸</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 4 }}>No admin photos yet</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.55 }}>Google photos still appear on the Explore card until you upload your own — your uploads will show first once they're added.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10 }}>
              {photos.map(p => {
                const isConfirmingDelete = deleteId === p.id
                const isExternal = !!p.storage_path && p.storage_path.startsWith('external:')
                return (
                  <div key={p.id} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--cream-dark)', background: 'var(--cream)' }}>
                    <div style={{ aspectRatio: '4 / 3', position: 'relative' }}>
                      <img
                        src={p.url}
                        alt={p.caption ?? locationName}
                        loading="lazy"
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      {isExternal && (
                        <div style={{ position: 'absolute', top: 6, left: 6, padding: '2px 6px', borderRadius: 3, background: 'rgba(0,0,0,.6)', color: 'white', fontSize: 9, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                          {p.storage_path === 'external:google' ? 'Google' : p.storage_path === 'external:wiki' ? 'Wiki' : 'External'}
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.photographer_name || '—'}</span>
                      <button
                        onClick={() => confirmDelete(p)}
                        onBlur={() => { if (deleteId === p.id) setDeleteId(null) }}
                        style={{
                          padding: '3px 8px', borderRadius: 4,
                          background: isConfirmingDelete ? 'var(--rust)' : 'transparent',
                          color: isConfirmingDelete ? 'white' : 'var(--rust)',
                          border: `1px solid ${isConfirmingDelete ? 'var(--rust)' : 'rgba(181,75,42,.4)'}`,
                          fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                        }}
                      >
                        {isConfirmingDelete ? 'Confirm?' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
