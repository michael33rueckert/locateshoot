'use client'

import { useEffect, useState } from 'react'
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
  const [sessionName,    setSessionName]    = useState(editLink?.session_name ?? (preselectAll ? 'My portfolio' : ''))
  const [selectedIds,    setSelectedIds]    = useState<string[]>(
    editLink?.portfolio_location_ids
      ?? (preselectAll     ? portfolio.map(p => p.id)
      :  (preselectIds     ? preselectIds
      :  []))
  )
  const [message,        setMessage]        = useState('')
  const [expirationMode, setExpirationMode] = useState<ExpirationMode>('never')
  const [expiresDate,    setExpiresDate]    = useState('') // yyyy-mm-dd
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')
  const [locSearch,      setLocSearch]      = useState('')

  // Load existing message + expiration when editing
  useEffect(() => {
    if (!editLink) return
    supabase.from('share_links')
      .select('message,expires_at,is_permanent,expire_on_submit')
      .eq('id', editLink.id)
      .single()
      .then(({ data }) => {
        if (!data) return
        if (data.message) setMessage(data.message)
        if (data.expire_on_submit) { setExpirationMode('on_submit') }
        else if (data.expires_at)   { setExpirationMode('date'); setExpiresDate(toInputDate(data.expires_at)) }
        else                         { setExpirationMode('never') }
      })
  }, [editLink])

  function toggleLoc(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function isSelected(id: string) { return selectedIds.includes(id) }

  async function create() {
    if (!sessionName.trim()) { setError('Please give this guide a name.'); return }
    if (selectedIds.length === 0) { setError('Select at least one location from your portfolio.'); return }
    if (expirationMode === 'date' && !expiresDate) { setError('Pick an expiration date or choose another option.'); return }
    setSaving(true); setError('')
    try {
      const expiresAtIso = expirationMode === 'date' && expiresDate
        ? new Date(`${expiresDate}T23:59:59`).toISOString()
        : null
      const expireOnSubmit = expirationMode === 'on_submit'
      // is_permanent means "show up in the Location Guides list" — in the
      // unified model every guide belongs there, so we always mark true.
      if (isEdit && editLink) {
        const { data, error: updateErr } = await supabase.from('share_links').update({
          session_name:           sessionName.trim(),
          message:                message.trim() || null,
          portfolio_location_ids: selectedIds,
          expires_at:             expiresAtIso,
          expire_on_submit:       expireOnSubmit,
          is_permanent:           true,
        }).eq('id', editLink.id).select('id,session_name,slug,created_at,portfolio_location_ids,location_ids,is_full_portfolio').single()
        if (updateErr) throw updateErr
        onCreated(data); onClose()
        return
      }
      const slug = generateSlug(sessionName, photographerName || 'photographer')
      const { data, error: insertErr } = await supabase.from('share_links').insert({
        user_id:                userId,
        slug,
        session_name:           sessionName.trim(),
        message:                message.trim() || null,
        photographer_name:      photographerName || null,
        portfolio_location_ids: selectedIds,
        location_ids:           [],
        secret_ids:             [],
        expires_at:             expiresAtIso,
        expire_on_submit:       expireOnSubmit,
        is_permanent:           true,
      }).select('id,session_name,slug,created_at,portfolio_location_ids,location_ids,is_full_portfolio').single()
      if (insertErr) throw insertErr
      onCreated(data); onClose()
    } catch (err: any) {
      setError(isEdit ? 'Could not save changes — please try again.' : 'Could not create the guide — please try again.')
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
              <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 3 }}>📚 {isEdit ? 'Edit Location Guide' : preselectAll ? 'Share entire portfolio' : 'New Location Guide'}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300 }}>Pick locations from your portfolio, give the guide a name, and choose whether to save it for reuse or have it expire.</div>
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

          {/* Expiration mode */}
          <div style={{ marginBottom: '1.25rem' }}>
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
          </div>

          {/* Location picker */}
          <div style={{ marginBottom: '1.5rem' }}>
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
          </div>

          {error && <div style={{ padding: '8px 12px', background: 'rgba(181,75,42,.08)', border: '1px solid rgba(181,75,42,.2)', borderRadius: 6, fontSize: 13, color: 'var(--rust)', marginBottom: '1rem' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={create} disabled={saving || !sessionName.trim() || selectedIds.length === 0} style={{ flex: 1, padding: '12px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: saving || !sessionName.trim() || selectedIds.length === 0 ? 0.5 : 1 }}>
              {saving ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save changes' : 'Create guide →')}
            </button>
            <button onClick={onClose} style={{ padding: '12px 20px', borderRadius: 4, background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--sand)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          </div>
        </div>
      </div>
    </>
  )
}
