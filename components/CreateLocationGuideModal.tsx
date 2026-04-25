'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { tileUrl } from '@/lib/image'

// Unified Location Guide creation/edit modal. Used on the dashboard and on the
// /location-guides page. Supports three expiration modes:
//   1. never      — saved for reuse (is_permanent = true)
//   2. date       — expires_at = <ISO date>
//   3. on_submit  — expire_on_submit = true (burns out after first client pick)
//
// The "Message to client" field and the guide name are the two copy fields.
// Guide name is required; message is optional.

export interface PortfolioLocationLite {
  id:         string
  name:       string
  city:       string | null
  state:      string | null
  photo_url?: string | null
}

export interface GuideLinkLite {
  id:                     string
  session_name:           string
  slug:                   string
  created_at:             string
  portfolio_location_ids: string[] | null
  location_ids:           string[] | null
  is_full_portfolio:      boolean
}

type ExpirationMode = 'never' | 'date' | 'on_submit'

const BG_CYCLE = ['bg-1', 'bg-2', 'bg-3', 'bg-4', 'bg-5', 'bg-6']

function generateSlug(name: string, photographer: string) {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 25)
  return `${clean(photographer)}-${clean(name)}-${Date.now().toString(36)}`
}

function toInputDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function CreateLocationGuideModal({
  portfolio,
  preselectAll,
  preselectIds,
  userId,
  photographerName,
  editLink,
  onClose,
  onCreated,
  onAddLocation,
}: {
  portfolio:         PortfolioLocationLite[]
  preselectAll:      boolean
  preselectIds?:     string[]
  userId:            string
  photographerName:  string
  editLink?:         GuideLinkLite | null
  onClose:           () => void
  onCreated:         (link: any) => void
  /** When provided, the modal shows an "Add new location" button that calls this. Parent owns the nested AddPortfolioLocationModal and refreshes `portfolio` afterwards. */
  onAddLocation?:    () => void
}) {
  const isEdit = !!editLink
  // Full-portfolio guides ("My Portfolio" / Share all) auto-sync against
  // the photographer's whole portfolio — there's no static location list
  // to pick, no expiration to set. We still let the user edit name,
  // message, cover photo, and multi-pick options.
  const isFullPortfolio = !!editLink?.is_full_portfolio
  const [sessionName,    setSessionName]    = useState(editLink?.session_name ?? (preselectAll ? 'My portfolio' : ''))
  const [selectedIds,    setSelectedIds]    = useState<string[]>(
    isFullPortfolio
      ? portfolio.map(p => p.id)
      : (editLink?.portfolio_location_ids
          ?? (preselectAll     ? portfolio.map(p => p.id)
          :  (preselectIds     ? preselectIds
          :  [])))
  )
  const [message,        setMessage]        = useState('')
  const [expirationMode, setExpirationMode] = useState<ExpirationMode>('never')
  const [expiresDate,    setExpiresDate]    = useState('') // yyyy-mm-dd
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')
  const [locSearch,      setLocSearch]      = useState('')
  const [coverUrl,       setCoverUrl]       = useState<string | null>(null)
  // Multi-pick: when true, clients can pick maxPicks locations instead of
  // just one. Optional maxMiles caps how spread out the picks can be —
  // useful when the photographer is willing to do a multi-stop session
  // but not drive across town.
  const [multipick,      setMultipick]      = useState(false)
  const [maxPicks,       setMaxPicks]       = useState(2)
  const [maxMiles,       setMaxMiles]       = useState<string>('')  // input string so the field can be empty
  // Photo pool for the cover picker — keyed to portfolio_location_id so we can
  // show only photos from locations the photographer has included in the guide.
  const [portfolioPhotos, setPortfolioPhotos] = useState<{ pid: string; url: string }[]>([])

  // Load existing message, expiration, cover photo, multi-pick when editing.
  useEffect(() => {
    if (!editLink) return
    supabase.from('share_links')
      .select('message,expires_at,is_permanent,expire_on_submit,cover_photo_url,max_picks,max_pick_distance_miles')
      .eq('id', editLink.id)
      .single()
      .then(({ data }) => {
        if (!data) return
        if (data.message) setMessage(data.message)
        if (data.cover_photo_url) setCoverUrl(data.cover_photo_url)
        if (data.expire_on_submit) { setExpirationMode('on_submit') }
        else if (data.expires_at)   { setExpirationMode('date'); setExpiresDate(toInputDate(data.expires_at)) }
        else                         { setExpirationMode('never') }
        const mp = data.max_picks ?? 1
        if (mp > 1) {
          setMultipick(true)
          setMaxPicks(mp)
          if (data.max_pick_distance_miles != null) setMaxMiles(String(data.max_pick_distance_miles))
        }
      })
  }, [editLink])

  // For full-portfolio guides, keep selectedIds in sync with the live
  // portfolio so the cover picker shows photos from every saved location
  // (the picker filters by selectedIds).
  useEffect(() => {
    if (!isFullPortfolio) return
    setSelectedIds(portfolio.map(p => p.id))
  }, [isFullPortfolio, portfolio])

  // Pull photos for the whole portfolio once — cheap for typical portfolio
  // sizes, and lets us filter the cover picker in-memory as selections change.
  useEffect(() => {
    const pids = portfolio.map(p => p.id)
    if (pids.length === 0) { setPortfolioPhotos([]); return }
    supabase.from('location_photos')
      .select('portfolio_location_id,url,sort_order,created_at')
      .in('portfolio_location_id', pids)
      .eq('is_private', false)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setPortfolioPhotos((data ?? []).map((r: any) => ({ pid: r.portfolio_location_id, url: r.url })))
      })
  }, [portfolio])

  const coverCandidates = useMemo(
    () => portfolioPhotos.filter(p => selectedIds.includes(p.pid)),
    [portfolioPhotos, selectedIds],
  )

  function toggleLoc(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function isSelected(id: string) { return selectedIds.includes(id) }

  async function create() {
    if (!sessionName.trim()) { setError('Please give this guide a name.'); return }
    if (!isFullPortfolio && selectedIds.length === 0) { setError('Select at least one location from your portfolio.'); return }
    if (!isFullPortfolio && expirationMode === 'date' && !expiresDate) { setError('Pick an expiration date or choose another option.'); return }
    if (multipick && (!Number.isFinite(maxPicks) || maxPicks < 2)) { setError('Allow at least 2 picks when multi-pick is on.'); return }
    setSaving(true); setError('')
    try {
      // Full-portfolio guides skip expiration UI entirely (they're always
      // saved-for-reuse), so force the never-expire shape regardless of
      // whatever expirationMode happens to be in state.
      const expiresAtIso = !isFullPortfolio && expirationMode === 'date' && expiresDate
        ? new Date(`${expiresDate}T23:59:59`).toISOString()
        : null
      const expireOnSubmit = !isFullPortfolio && expirationMode === 'on_submit'
      const keepCover = coverUrl && coverCandidates.some(p => p.url === coverUrl) ? coverUrl : null
      const finalMaxPicks = multipick ? Math.max(2, Math.min(20, Math.floor(maxPicks))) : 1
      const milesNum = parseFloat(maxMiles)
      const finalMaxMiles = multipick && Number.isFinite(milesNum) && milesNum > 0 ? milesNum : null
      if (isEdit && editLink) {
        // Full-portfolio guides keep portfolio_location_ids = null so the
        // pick-data route resolves the live portfolio; static guides write
        // their hand-picked list.
        const updatePayload: Record<string, any> = {
          session_name:            sessionName.trim(),
          message:                 message.trim() || null,
          expires_at:              expiresAtIso,
          expire_on_submit:        expireOnSubmit,
          is_permanent:            true,
          cover_photo_url:         keepCover,
          max_picks:               finalMaxPicks,
          max_pick_distance_miles: finalMaxMiles,
        }
        if (!isFullPortfolio) updatePayload.portfolio_location_ids = selectedIds
        const { data, error: updateErr } = await supabase.from('share_links').update(updatePayload).eq('id', editLink.id).select('id,session_name,slug,created_at,portfolio_location_ids,location_ids,is_full_portfolio,expires_at,expire_on_submit,cover_photo_url').single()
        if (updateErr) throw updateErr
        onCreated(data); onClose()
        return
      }
      const slug = generateSlug(sessionName, photographerName || 'photographer')
      const { data, error: insertErr } = await supabase.from('share_links').insert({
        user_id:                 userId,
        slug,
        session_name:            sessionName.trim(),
        message:                 message.trim() || null,
        photographer_name:       photographerName || null,
        portfolio_location_ids:  selectedIds,
        location_ids:            [],
        secret_ids:              [],
        expires_at:              expiresAtIso,
        expire_on_submit:        expireOnSubmit,
        is_permanent:            true,
        cover_photo_url:         keepCover,
        max_picks:               finalMaxPicks,
        max_pick_distance_miles: finalMaxMiles,
      }).select('id,session_name,slug,created_at,portfolio_location_ids,location_ids,is_full_portfolio,expires_at,expire_on_submit,cover_photo_url').single()
      if (insertErr) throw insertErr
      onCreated(data); onClose()
    } catch (err: any) {
      // Postgres-side share-link quota check. The trigger raises
      // 'free_plan_link_limit' for Free users who already have 1 active
      // custom guide. Surface a clear upgrade message instead of the
      // generic catch-all.
      if (typeof err?.message === 'string' && err.message.includes('free_plan_link_limit')) {
        setError('Free plan allows 1 active custom guide. Delete the existing guide or upgrade to Pro for unlimited guides.')
      } else {
        setError(isEdit ? 'Could not save changes — please try again.' : 'Could not create the guide — please try again.')
      }
      console.error(err)
    } finally { setSaving(false) }
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--cream-dark)', borderRadius: 4, fontFamily: 'var(--font-dm-sans),sans-serif', fontSize: 14, color: 'var(--ink)', background: 'white', outline: 'none' }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 5 }

  const filteredLocs = portfolio.filter(l => {
    if (!locSearch.trim()) return true
    const q = locSearch.toLowerCase()
    const city = [l.city, l.state].filter(Boolean).join(', ').toLowerCase()
    return l.name.toLowerCase().includes(q) || city.includes(q)
  })

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,.7)', backdropFilter: 'blur(4px)', zIndex: 900 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'white', borderRadius: 16, width: 560, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto', zIndex: 1000, boxShadow: '0 24px 64px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 3 }}>📚 {isFullPortfolio ? 'Edit your portfolio share' : isEdit ? 'Edit Location Guide' : preselectAll ? 'Share entire portfolio' : 'New Location Guide'}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300 }}>{isFullPortfolio ? 'This guide auto-syncs with your whole portfolio. Update the name, message, or cover photo here.' : 'Pick locations from your portfolio, give the guide a name, and choose whether to save it for reuse or have it expire.'}</div>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--cream-dark)', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
          </div>

          {/* Name */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Guide name *</label>
            <input value={sessionName} onChange={e => setSessionName(e.target.value)} style={inputStyle} placeholder="e.g. Kansas City Guide · Smith Family Fall Photos · Golden Hour" autoFocus />
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4, fontWeight: 300 }}>Clients see this at the top of their location picker.</div>
          </div>

          {/* Message */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Message to client (optional)</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} placeholder="Hi! Here are my go-to locations. Take a look and pick your favorite!" style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          {/* Multi-pick options — let the client choose 2+ locations and
              optionally cap how far apart they can be. */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 6, cursor: 'pointer', border: `1.5px solid ${multipick ? 'var(--gold)' : 'var(--cream-dark)'}`, background: multipick ? 'rgba(196,146,42,.05)' : 'white' }}>
              <input type="checkbox" checked={multipick} onChange={e => setMultipick(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--gold)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>Let the client pick more than one location</div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.5 }}>Good for multi-stop sessions. Off by default — clients pick exactly one spot.</div>
              </div>
            </label>
            {multipick && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <div>
                  <label style={labelStyle}>Up to</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="number" min={2} max={20} value={maxPicks} onChange={e => setMaxPicks(parseInt(e.target.value, 10) || 2)} style={inputStyle} />
                    <span style={{ fontSize: 13, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>locations</span>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Max miles apart (optional)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="number" min={0} step={0.5} value={maxMiles} onChange={e => setMaxMiles(e.target.value)} placeholder="No limit" style={inputStyle} />
                    <span style={{ fontSize: 13, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>miles</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Expiration mode (hidden on full-portfolio guides — they're
              always saved-for-reuse and don't expire) */}
          {!isFullPortfolio && <div style={{ marginBottom: '1.25rem' }}>
            <label style={labelStyle}>When should this guide expire?</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {([
                { value: 'never',     label: 'Save for future use',                desc: 'Never expires. Drop this link into HoneyBook, Dubsado, or any booking tool.' },
                { value: 'date',      label: 'Expire on a specific date',          desc: 'Link stops working after the date you pick.' },
                { value: 'on_submit', label: 'Expire after the client makes a pick', desc: 'Single-use. The moment a client submits, the link burns out.' },
              ] as { value: ExpirationMode; label: string; desc: string }[]).map(opt => {
                const active = expirationMode === opt.value
                return (
                  <label key={opt.value} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 6, cursor: 'pointer', border: `1.5px solid ${active ? 'var(--gold)' : 'var(--cream-dark)'}`, background: active ? 'rgba(196,146,42,.05)' : 'white', transition: 'all .15s' }}>
                    <input type="radio" name="exp" checked={active} onChange={() => setExpirationMode(opt.value)} style={{ marginTop: 3, accentColor: 'var(--gold)' }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>{opt.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.5 }}>{opt.desc}</div>
                    </div>
                  </label>
                )
              })}
            </div>
            {expirationMode === 'date' && (
              <div style={{ marginTop: 10 }}>
                <label style={labelStyle}>Expiration date</label>
                <input type="date" value={expiresDate} onChange={e => setExpiresDate(e.target.value)} min={toInputDate(new Date().toISOString())} style={inputStyle} />
              </div>
            )}
          </div>}

          {/* Location picker — hidden on full-portfolio guides; their list
              is dynamic so there's nothing to pick. Shown as a note instead. */}
          {isFullPortfolio ? (
            <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(74,103,65,.08)', border: '1px solid rgba(74,103,65,.2)', marginBottom: '1.5rem', fontSize: 13, color: 'var(--sage)', lineHeight: 1.55 }}>
              🔗 <strong style={{ fontWeight: 600 }}>Auto-syncs with your portfolio.</strong> Every saved location is included automatically. To change which locations are shown to clients, add or remove them from your portfolio.
            </div>
          ) : <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 10 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>
                Portfolio locations * <span style={{ fontSize: 10, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-soft)' }}>({selectedIds.length} of {portfolio.length} selected)</span>
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                {selectedIds.length < portfolio.length && portfolio.length > 0 && <button onClick={() => setSelectedIds(portfolio.map(p => p.id))} style={{ fontSize: 11, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Select all</button>}
                {selectedIds.length > 0 && <button onClick={() => setSelectedIds([])} style={{ fontSize: 11, color: 'var(--rust)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Clear all</button>}
              </div>
            </div>
            {portfolio.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', fontSize: 13, color: 'var(--ink-soft)', background: 'var(--cream)', borderRadius: 8, border: '1px dashed var(--cream-dark)' }}>
                Your portfolio is empty. <Link href="/explore" style={{ color: 'var(--gold)', fontWeight: 500 }}>Browse Explore →</Link>
              </div>
            ) : (
              <>
                <input type="text" value={locSearch} onChange={e => setLocSearch(e.target.value)} placeholder="Search your portfolio…" style={{ ...inputStyle, marginBottom: 8, fontSize: 13 }} />
                <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--cream-dark)', borderRadius: 8 }}>
                  {filteredLocs.length === 0 && <div style={{ padding: '1rem', textAlign: 'center', fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic' }}>No portfolio locations match &quot;{locSearch}&quot;</div>}
                  {filteredLocs.map((loc, i) => {
                    const sel = isSelected(loc.id)
                    const cityLine = [loc.city, loc.state].filter(Boolean).join(', ')
                    const thumb = tileUrl(loc.photo_url ?? null) ?? loc.photo_url ?? null
                    return (
                      <div key={loc.id} onClick={() => toggleLoc(loc.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer', borderBottom: i < filteredLocs.length - 1 ? '1px solid var(--cream-dark)' : 'none', background: sel ? 'rgba(196,146,42,.05)' : 'white', transition: 'background .15s' }}>
                        <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${sel ? 'var(--gold)' : 'var(--sand)'}`, background: sel ? 'var(--gold)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--ink)', transition: 'all .15s' }}>{sel ? '✓' : ''}</div>
                        <div className={thumb ? undefined : BG_CYCLE[i % BG_CYCLE.length]} style={{ width: 38, height: 38, borderRadius: 6, flexShrink: 0, overflow: 'hidden', position: 'relative', background: thumb ? 'var(--cream-dark)' : undefined }}>
                          {thumb && <img src={thumb} alt="" loading="lazy" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>📍 {cityLine || '—'}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {onAddLocation && (
                    <button type="button" onClick={onAddLocation} style={{ padding: '7px 14px', borderRadius: 4, background: 'white', color: 'var(--ink)', border: '1px solid var(--cream-dark)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                      + Add new location
                    </button>
                  )}
                  <Link href="/explore" style={{ padding: '7px 14px', borderRadius: 4, background: 'white', color: 'var(--ink)', border: '1px solid var(--cream-dark)', fontSize: 12, fontWeight: 500, textDecoration: 'none' }}>
                    Explore nearby locations →
                  </Link>
                </div>
              </>
            )}
          </div>}

          {/* Cover photo picker — used as the card thumbnail + link preview */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={labelStyle}>Cover photo (optional)</label>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: -2, marginBottom: 8, fontWeight: 300 }}>
              Shows on the card thumbnail and in link previews (text messages, email). Pick one of your photos from the locations in this guide.
            </div>
            {selectedIds.length === 0 ? (
              <div style={{ padding: '0.75rem 1rem', fontSize: 12, color: 'var(--ink-soft)', background: 'var(--cream)', borderRadius: 8, border: '1px dashed var(--cream-dark)', fontStyle: 'italic' }}>
                Select at least one location above to pick a cover photo from your photos.
              </div>
            ) : coverCandidates.length === 0 ? (
              <div style={{ padding: '0.75rem 1rem', fontSize: 12, color: 'var(--ink-soft)', background: 'var(--cream)', borderRadius: 8, border: '1px dashed var(--cream-dark)', fontStyle: 'italic' }}>
                The selected locations don&apos;t have any photos uploaded yet. Add photos to a location to use it as a cover.
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(80px,1fr))', gap: 6, maxHeight: 220, overflowY: 'auto', padding: 4, border: '1px solid var(--cream-dark)', borderRadius: 8 }}>
                  {coverCandidates.map((photo, i) => {
                    const sel = coverUrl === photo.url
                    const thumb = tileUrl(photo.url) ?? photo.url
                    return (
                      <div key={`${photo.pid}-${i}`} onClick={() => setCoverUrl(sel ? null : photo.url)} style={{
                        position: 'relative',
                        aspectRatio: '1',
                        borderRadius: 6,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        border: `2.5px solid ${sel ? 'var(--gold)' : 'transparent'}`,
                        boxShadow: sel ? '0 0 0 2px rgba(196,146,42,.25)' : 'none',
                        transition: 'all .15s',
                        background: 'var(--cream-dark)',
                      }}>
                        <img src={thumb} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        {sel && (
                          <div style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: '50%', background: 'var(--gold)', color: 'var(--ink)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }}>✓</div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {coverUrl && (
                  <button type="button" onClick={() => setCoverUrl(null)} style={{ marginTop: 6, fontSize: 11, color: 'var(--rust)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                    Clear cover photo
                  </button>
                )}
              </>
            )}
          </div>

          {error && <div style={{ padding: '8px 12px', background: 'rgba(181,75,42,.08)', border: '1px solid rgba(181,75,42,.2)', borderRadius: 6, fontSize: 13, color: 'var(--rust)', marginBottom: '1rem' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            {(() => {
              const disabled = saving || !sessionName.trim() || (!isFullPortfolio && selectedIds.length === 0)
              return (
                <button onClick={create} disabled={disabled} style={{ flex: 1, padding: '12px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: disabled ? 0.5 : 1 }}>
                  {saving ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save changes' : 'Create guide →')}
                </button>
              )
            })()}
            <button onClick={onClose} style={{ padding: '12px 20px', borderRadius: 4, background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--sand)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          </div>
        </div>
      </div>
    </>
  )
}
