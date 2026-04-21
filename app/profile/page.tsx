'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Template {
  id: string
  name: string
  body: string
}

interface Preferences {
  email_on_pick:           boolean
  email_on_view:           boolean
  default_expiry:          string
  my_photos_only:          boolean
  remove_ls_branding:      boolean
  include_recommendations: boolean
  brand_accent?:           string
  show_studio_name?:       boolean
  share_tagline?:          string
  logo_url?:               string
}

const DEFAULT_PREFS: Preferences = {
  email_on_pick:           true,
  email_on_view:           false,
  default_expiry:          '14',
  my_photos_only:          false,
  remove_ls_branding:      false,
  include_recommendations: true,
  brand_accent:            '#c4922a',
  show_studio_name:        true,
  share_tagline:           "Let's find your perfect spot together.",
}

const NAV_ITEMS = [
  { id: 'profile',     icon: '👤', label: 'Profile'                },
  { id: 'branding',    icon: '🎨', label: 'Branding'               },
  { id: 'templates',   icon: '✉️',  label: 'Message Templates'      },
  { id: 'preferences', icon: '⚙',  label: 'Preferences'            },
  { id: 'billing',     icon: '💳', label: 'Subscription & Billing' },
  { id: 'password',    icon: '🔒', label: 'Password & Security'    },
]

const ACCENT_COLORS = ['#c4922a','#4a6741','#3d6e8c','#b54b2a','#7c5cbf','#1a1612','#d4626a','#4a7a9b']

export default function ProfilePage() {
  const [active,        setActive]        = useState('profile')
  const [userId,        setUserId]        = useState<string | null>(null)
  const [plan,          setPlan]          = useState<string>('free')
  const [toast,         setToast]         = useState<string | null>(null)
  const [saving,        setSaving]        = useState(false)

  // Profile fields
  const [fullName,   setFullName]   = useState('')
  const [studioName, setStudioName] = useState('')
  const [email,      setEmail]      = useState('')
  const [instagram,  setInstagram]  = useState('')
  const [website,    setWebsite]    = useState('')

  // Branding
  const [logoPreview,    setLogoPreview]    = useState<string | null>(null)
  const [brandAccent,    setBrandAccent]    = useState('#c4922a')
  const [showStudioName, setShowStudioName] = useState(true)
  const [shareTagline,   setShareTagline]   = useState("Let's find your perfect spot together.")
  const logoInputRef = useRef<HTMLInputElement>(null)

  // Templates
  const [templates,     setTemplates]     = useState<Template[]>([])
  const [editingId,     setEditingId]     = useState<string | null>(null)
  const [editName,      setEditName]      = useState('')
  const [editBody,      setEditBody]      = useState('')
  const [showNewForm,   setShowNewForm]   = useState(false)
  const [newName,       setNewName]       = useState('')
  const [newBody,       setNewBody]       = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [templSaving,   setTemplSaving]   = useState(false)

  // Preferences
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS)

  // Password
  const [newPw,     setNewPw]     = useState('')
  const [confirmPw, setConfirmPw] = useState('')

  const isPro = plan === 'pro' || plan === 'Pro'

  useEffect(() => {
    const hash = window.location.hash.replace('#', '')
    if (hash && NAV_ITEMS.find(n => n.id === hash)) setActive(hash)
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(id)
  }, [toast])

  const loadProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/'; return }
    setUserId(user.id)
    setEmail(user.email ?? '')

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, preferences, plan')
      .eq('id', user.id)
      .single()

    if (profile) {
      setFullName(profile.full_name ?? '')
      setPlan(profile.plan ?? 'free')
      const p = profile.preferences as Preferences | null
      if (p) {
        setPrefs({ ...DEFAULT_PREFS, ...p })
        if (p.brand_accent)    setBrandAccent(p.brand_accent)
        if (p.show_studio_name !== undefined) setShowStudioName(p.show_studio_name)
        if (p.share_tagline)   setShareTagline(p.share_tagline)
        if (p.logo_url)        setLogoPreview(p.logo_url)
      }
    }

    const { data: tmplData } = await supabase
      .from('message_templates')
      .select('id,name,body')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
    if (tmplData) setTemplates(tmplData)
  }, [])

  useEffect(() => { loadProfile() }, [loadProfile])

  async function saveProfile() {
    if (!userId) return
    setSaving(true)
    const { error } = await supabase.from('profiles').upsert({
      id: userId, full_name: fullName.trim(), email: email.trim(),
    })
    setSaving(false)
    setToast(error ? '⚠ Could not save — please try again' : '✓ Profile saved!')
  }

  async function savePreferences() {
    if (!userId) return
    setSaving(true)
    const { error } = await supabase.from('profiles').update({ preferences: prefs }).eq('id', userId)
    setSaving(false)
    setToast(error ? '⚠ Could not save — please try again' : '✓ Preferences saved!')
  }

  async function saveBranding() {
    if (!userId) return
    setSaving(true)
    const updated = { ...prefs, brand_accent: brandAccent, show_studio_name: showStudioName, share_tagline: shareTagline }
    const { error } = await supabase.from('profiles').update({ preferences: updated }).eq('id', userId)
    setPrefs(updated)
    setSaving(false)
    setToast(error ? '⚠ Could not save — please try again' : '✓ Branding saved!')
  }

  function updatePref<K extends keyof Preferences>(key: K, val: Preferences[K]) {
    setPrefs(prev => ({ ...prev, [key]: val }))
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    const reader = new FileReader()
    reader.onload = ev => setLogoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
    const ext  = file.name.split('.').pop()
    const path = `${userId}/logo.${ext}`
    const { error } = await supabase.storage.from('location-photos').upload(path, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('location-photos').getPublicUrl(path)
      const updated  = { ...prefs, logo_url: data.publicUrl }
      await supabase.from('profiles').update({ preferences: updated }).eq('id', userId)
      setPrefs(updated)
    }
  }

  function startEdit(t: Template) {
    setEditingId(t.id); setEditName(t.name); setEditBody(t.body); setShowNewForm(false)
  }
  function cancelEdit() { setEditingId(null); setEditName(''); setEditBody('') }

  async function saveEdit() {
    if (!editName.trim() || !editBody.trim() || !userId) return
    setTemplSaving(true)
    const { error } = await supabase.from('message_templates')
      .update({ name: editName.trim(), body: editBody.trim() })
      .eq('id', editingId!)
    if (!error) {
      setTemplates(prev => prev.map(t => t.id === editingId ? { ...t, name: editName.trim(), body: editBody.trim() } : t))
      setEditingId(null); setToast('✓ Template saved!')
    } else { setToast('⚠ Could not save') }
    setTemplSaving(false)
  }

  async function addTemplate() {
    if (!newName.trim() || !newBody.trim() || !userId) return
    setTemplSaving(true)
    const { data, error } = await supabase.from('message_templates')
      .insert({ user_id: userId, name: newName.trim(), body: newBody.trim() })
      .select().single()
    if (!error && data) {
      setTemplates(prev => [...prev, data])
      setNewName(''); setNewBody(''); setShowNewForm(false); setToast('✓ Template created!')
    } else { setToast('⚠ Could not save') }
    setTemplSaving(false)
  }

  async function deleteTemplate(id: string) {
    if (deleteConfirm !== id) { setDeleteConfirm(id); return }
    const { error } = await supabase.from('message_templates').delete().eq('id', id)
    if (!error) {
      setTemplates(prev => prev.filter(t => t.id !== id))
      setDeleteConfirm(null); setToast('Template deleted')
    }
  }

  async function updatePassword() {
    if (newPw !== confirmPw) { setToast('⚠ Passwords do not match'); return }
    if (newPw.length < 8)    { setToast('⚠ Password must be at least 8 characters'); return }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setSaving(false)
    if (error) setToast(`⚠ ${error.message}`)
    else { setToast('✓ Password updated!'); setNewPw(''); setConfirmPw('') }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    border: '1px solid var(--cream-dark)', borderRadius: 4,
    fontFamily: 'var(--font-dm-sans),sans-serif',
    fontSize: 14, color: 'var(--ink)', background: 'white', outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 500,
    textTransform: 'uppercase', letterSpacing: '.07em',
    color: 'var(--ink-soft)', marginBottom: 5,
  }
  const sectionTitle = (title: string, sub?: string) => (
    <div style={{ marginBottom: '2rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--cream-dark)' }}>
      <h2 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 24, fontWeight: 700, color: 'var(--ink)', marginBottom: sub ? 4 : 0 }}>{title}</h2>
      {sub && <p style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300 }}>{sub}</p>}
    </div>
  )

  const prefRow = (label: string, sub: string, key: keyof Preferences, proOnly = false) => {
    const locked = proOnly && !isPro
    return (
      <label
        key={key}
        onClick={() => !locked && updatePref(key, !prefs[key])}
        style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: locked ? 'default' : 'pointer', marginBottom: 14, opacity: locked ? 0.5 : 1 }}
      >
        <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1, border: `1.5px solid ${prefs[key] && !locked ? 'var(--gold)' : 'var(--sand)'}`, background: prefs[key] && !locked ? 'var(--gold)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--ink)', transition: 'all .15s' }}>
          {prefs[key] && !locked ? '✓' : ''}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>
            {label}
            {proOnly && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 20, fontSize: 10, background: 'rgba(196,146,42,.12)', color: 'var(--gold)', border: '1px solid rgba(196,146,42,.2)', fontWeight: 500 }}>Pro</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.5 }}>{sub}</div>
          {locked && <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 2 }}>Upgrade to Pro to unlock</div>}
        </div>
      </label>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', minHeight: '100vh', background: '#f0ece4' }}>

      {/* SIDEBAR */}
      <div style={{ background: 'white', borderRight: '1px solid var(--cream-dark)', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--cream-dark)' }}>
          <Link href="/" style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 17, fontWeight: 900, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)', display: 'inline-block' }} />LocateShoot
          </Link>
        </div>
        <div style={{ padding: '1rem 1.5rem 0.5rem' }}>
          <Link href="/dashboard" style={{ fontSize: 12, color: 'var(--ink-soft)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>← Back to dashboard</Link>
        </div>
        <div style={{ padding: '0.5rem 0.75rem', flex: 1 }}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-dm-sans),sans-serif', fontSize: 13, fontWeight: active === item.id ? 500 : 400, color: active === item.id ? 'var(--gold)' : 'var(--ink-soft)', background: active === item.id ? 'rgba(196,146,42,.08)' : 'transparent', marginBottom: 2, transition: 'all .15s' }}
            >
              <span style={{ fontSize: 15, width: 18, textAlign: 'center' }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--cream-dark)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {logoPreview
              ? <img src={logoPreview} alt="Logo" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              : <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(196,146,42,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: 'var(--gold)', flexShrink: 0 }}>
                  {fullName.charAt(0) || '?'}
                </div>
            }
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{fullName || 'Your Name'}</div>
              <span style={{ padding: '1px 6px', borderRadius: 20, fontSize: 10, background: isPro ? 'rgba(196,146,42,.12)' : 'var(--cream-dark)', color: isPro ? 'var(--gold)' : 'var(--ink-soft)', border: isPro ? '1px solid rgba(196,146,42,.2)' : 'none', fontWeight: 500 }}>
                {isPro ? '⭐ Pro' : 'Free'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ padding: '2.5rem 3rem', maxWidth: 760 }}>

        {/* ── PROFILE ── */}
        {active === 'profile' && (
          <div>
            {sectionTitle('Profile', 'Your information shown to clients and the community.')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div><label style={labelStyle}>Full name</label><input value={fullName} onChange={e => setFullName(e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Studio / business name</label><input value={studioName} onChange={e => setStudioName(e.target.value)} style={inputStyle} placeholder="e.g. Jane Doe Photography" /></div>
              <div><label style={labelStyle}>Email address</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Instagram handle</label><input value={instagram} onChange={e => setInstagram(e.target.value)} style={inputStyle} placeholder="@yourhandle" /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Website</label><input value={website} onChange={e => setWebsite(e.target.value)} style={inputStyle} placeholder="www.yoursite.com" /></div>
            </div>
            <button onClick={saveProfile} disabled={saving} style={{ background: 'var(--gold)', color: 'var(--ink)', padding: '10px 24px', borderRadius: 4, border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        )}

        {/* ── BRANDING ── */}
        {active === 'branding' && (
          <div>
            {sectionTitle('Branding', "Your logo and colors appear on client share pages.")}

            {/* White-label toggle — Pro only */}
            <div style={{ background: isPro ? 'white' : 'var(--cream)', border: `1px solid ${isPro ? 'var(--cream-dark)' : 'var(--sand)'}`, borderRadius: 10, padding: '1.25rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    🎨 White-label share pages
                    {!isPro && <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, background: 'rgba(196,146,42,.12)', color: 'var(--gold)', border: '1px solid rgba(196,146,42,.2)', fontWeight: 500 }}>Pro only</span>}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.55 }}>
                    Your logo replaces the LocateShoot branding on client-facing share pages.
                  </div>
                </div>
                <div
                  onClick={() => isPro && updatePref('remove_ls_branding', !prefs.remove_ls_branding)}
                  style={{ width: 44, height: 24, borderRadius: 12, background: prefs.remove_ls_branding && isPro ? 'var(--gold)' : 'var(--cream-dark)', cursor: isPro ? 'pointer' : 'not-allowed', position: 'relative', transition: 'background .2s', flexShrink: 0, opacity: isPro ? 1 : 0.5 }}
                >
                  <div style={{ position: 'absolute', top: 3, left: prefs.remove_ls_branding && isPro ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: 'white', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
                </div>
              </div>
              {!isPro && (
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--gold)' }}>
                  <button onClick={() => setActive('billing')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold)', fontFamily: 'inherit', fontSize: 12, fontWeight: 500, padding: 0 }}>Upgrade to Pro</button> to white-label your share pages.
                </div>
              )}
            </div>

            {/* Logo upload */}
            <div style={{ background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10, padding: '1.25rem', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: '1rem' }}>Studio logo</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1rem' }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', border: '2px dashed var(--sand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', background: 'var(--cream)' }}>
                  {logoPreview
                    ? <img src={logoPreview} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div style={{ textAlign: 'center' }}><div style={{ fontSize: 22, marginBottom: 2 }}>📷</div><div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>No logo</div></div>
                  }
                </div>
                <div>
                  <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                  <button onClick={() => logoInputRef.current?.click()} style={{ display: 'block', padding: '9px 18px', borderRadius: 4, border: '1.5px solid var(--sand)', background: 'white', fontSize: 13, fontWeight: 500, color: 'var(--ink-soft)', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8 }}>Upload logo</button>
                  {logoPreview && <button onClick={() => setLogoPreview(null)} style={{ display: 'block', padding: '6px 12px', borderRadius: 4, border: 'none', background: 'transparent', fontSize: 12, color: 'var(--rust)', cursor: 'pointer', fontFamily: 'inherit' }}>Remove logo</button>}
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, marginTop: 4, lineHeight: 1.5 }}>PNG or JPG · Square, at least 200×200px</div>
                </div>
              </div>
            </div>

            {/* Accent color */}
            <div style={{ background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10, padding: '1.25rem', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 4 }}>Accent color</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: '1rem' }}>Used for buttons and highlights on your client share pages.</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
                {ACCENT_COLORS.map(color => (
                  <div key={color} onClick={() => setBrandAccent(color)} style={{ width: 36, height: 36, borderRadius: '50%', background: color, cursor: 'pointer', border: `3px solid ${brandAccent === color ? 'var(--ink)' : 'transparent'}`, boxSizing: 'border-box', transition: 'all .15s' }} />
                ))}
                <div style={{ position: 'relative', width: 36, height: 36 }}>
                  <input type="color" value={brandAccent} onChange={e => setBrandAccent(e.target.value)} style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none' }} />
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#ff6b6b,#ffd93d,#6bcb77,#4d96ff)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>+</div>
                </div>
              </div>
            </div>

            {/* Share page display options */}
            <div style={{ background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10, padding: '1.25rem', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: '1rem' }}>Share page display</div>
              <label onClick={() => setShowStudioName(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: '1rem' }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${showStudioName ? 'var(--gold)' : 'var(--sand)'}`, background: showStudioName ? 'var(--gold)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--ink)', transition: 'all .15s' }}>
                  {showStudioName ? '✓' : ''}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>Show studio name on client share pages</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300 }}>Displays your studio name in the share page header</div>
                </div>
              </label>
              <div>
                <label style={labelStyle}>Tagline shown on share pages</label>
                <input value={shareTagline} onChange={e => setShareTagline(e.target.value)} style={inputStyle} placeholder="e.g. Let's find your perfect spot together." />
              </div>
            </div>

            {/* Preview */}
            <div style={{ background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10, overflow: 'hidden', marginBottom: '1.5rem' }}>
              <div style={{ padding: '.9rem 1.25rem', borderBottom: '1px solid var(--cream-dark)', fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Preview — client share page header</div>
              <div style={{ background: 'var(--ink)', padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '.75rem' }}>
                  {logoPreview
                    ? <img src={logoPreview} alt="Logo" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                    : <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'rgba(245,240,232,.5)' }}>LS</div>
                  }
                  {showStudioName && <div style={{ fontSize: 14, fontWeight: 500, color: 'rgba(245,240,232,.8)' }}>{studioName || fullName || 'Your Studio'}</div>}
                </div>
                <div style={{ fontSize: 'clamp(22px,3vw,36px)', fontFamily: 'var(--font-playfair),serif', fontWeight: 900, color: 'var(--cream)', marginBottom: 4 }}>
                  Choose your <em style={{ fontStyle: 'italic', color: brandAccent }}>perfect</em> spot
                </div>
                <div style={{ fontSize: 13, color: 'rgba(245,240,232,.5)', fontWeight: 300 }}>{shareTagline}</div>
              </div>
            </div>

            <button onClick={saveBranding} disabled={saving} style={{ background: 'var(--gold)', color: 'var(--ink)', padding: '10px 24px', borderRadius: 4, border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save branding'}
            </button>
          </div>
        )}

        {/* ── TEMPLATES ── */}
        {active === 'templates' && (
          <div>
            {sectionTitle('Message Templates', 'Reusable messages for your client share links.')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              {templates.length === 0 && !showNewForm && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13, fontStyle: 'italic', background: 'white', borderRadius: 10, border: '1px solid var(--cream-dark)' }}>
                  No templates yet — add your first one below.
                </div>
              )}
              {templates.map(t => (
                <div key={t.id} style={{ background: 'white', border: `1px solid ${editingId === t.id ? 'var(--gold)' : 'var(--cream-dark)'}`, borderRadius: 10, overflow: 'hidden', transition: 'border-color .15s' }}>
                  {editingId === t.id ? (
                    <div style={{ padding: '1.25rem' }}>
                      <div style={{ marginBottom: '.75rem' }}><label style={labelStyle}>Template name</label><input value={editName} onChange={e => setEditName(e.target.value)} style={inputStyle} autoFocus /></div>
                      <div style={{ marginBottom: '1rem' }}><label style={labelStyle}>Message body</label><textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={5} style={{ ...inputStyle, resize: 'vertical' }} /></div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={saveEdit} disabled={!editName.trim() || !editBody.trim() || templSaving} style={{ background: 'var(--gold)', color: 'var(--ink)', padding: '8px 20px', borderRadius: 4, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: !editName.trim() || !editBody.trim() || templSaving ? 0.5 : 1 }}>Save template</button>
                        <button onClick={cancelEdit} style={{ background: 'transparent', color: 'var(--ink-soft)', padding: '8px 16px', borderRadius: 4, border: '1px solid var(--sand)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '1.1rem 1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{t.name}</div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => startEdit(t)} style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid var(--cream-dark)', background: 'white', fontSize: 12, color: 'var(--ink-soft)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>Edit</button>
                          <button onClick={() => deleteTemplate(t.id)} style={{ padding: '4px 12px', borderRadius: 4, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', background: deleteConfirm === t.id ? 'var(--rust)' : 'rgba(181,75,42,.08)', color: deleteConfirm === t.id ? 'white' : 'var(--rust)', transition: 'all .15s' }}>
                            {deleteConfirm === t.id ? 'Confirm delete' : 'Delete'}
                          </button>
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.65 }}>{t.body}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {showNewForm ? (
              <div style={{ background: 'white', border: '1.5px solid var(--gold)', borderRadius: 10, padding: '1.25rem' }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: '1rem' }}>New template</div>
                <div style={{ marginBottom: '.75rem' }}><label style={labelStyle}>Template name</label><input value={newName} onChange={e => setNewName(e.target.value)} style={inputStyle} autoFocus /></div>
                <div style={{ marginBottom: '1rem' }}><label style={labelStyle}>Message body</label><textarea value={newBody} onChange={e => setNewBody(e.target.value)} rows={5} style={{ ...inputStyle, resize: 'vertical' }} /></div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={addTemplate} disabled={!newName.trim() || !newBody.trim() || templSaving} style={{ background: 'var(--gold)', color: 'var(--ink)', padding: '8px 20px', borderRadius: 4, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: !newName.trim() || !newBody.trim() || templSaving ? 0.5 : 1 }}>Add template</button>
                  <button onClick={() => { setShowNewForm(false); setNewName(''); setNewBody('') }} style={{ background: 'transparent', color: 'var(--ink-soft)', padding: '8px 16px', borderRadius: 4, border: '1px solid var(--sand)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setShowNewForm(true); setEditingId(null) }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 4, border: '1.5px dashed var(--sand)', background: 'transparent', fontSize: 13, fontWeight: 500, color: 'var(--ink-soft)', cursor: 'pointer', fontFamily: 'inherit', width: '100%', justifyContent: 'center' }}>
                + Add new template
              </button>
            )}
          </div>
        )}

        {/* ── PREFERENCES ── */}
        {active === 'preferences' && (
          <div>
            {sectionTitle('Preferences', 'Customize how LocateShoot works for you.')}
            <div style={{ background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10, padding: '1.25rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: '1.25rem' }}>Email notifications</div>
              {prefRow('Email me when a client picks a location', 'Get an instant email the moment your client chooses their favorite spot.', 'email_on_pick')}
              {prefRow('Email me when a client views my share link', 'Know when your client opens the link you sent them.', 'email_on_view')}
            </div>
            <div style={{ background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10, padding: '1.25rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: '1.25rem' }}>Share link defaults</div>
              {prefRow('Default to "only show my photos" when creating a share', 'New share links will default to showing only your uploaded photos.', 'my_photos_only')}
              {prefRow('Always include nearby recommended locations', 'Automatically add well-rated public locations near the pin.', 'include_recommendations')}
            </div>
            <div style={{ background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: '1rem' }}>Default share link expiry</div>
              <select value={prefs.default_expiry} onChange={e => updatePref('default_expiry', e.target.value)} style={{ ...inputStyle, width: 200, cursor: 'pointer', appearance: 'none' }}>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
                <option value="0">Never expires</option>
              </select>
            </div>
            <button onClick={savePreferences} disabled={saving} style={{ background: 'var(--gold)', color: 'var(--ink)', padding: '10px 24px', borderRadius: 4, border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save preferences'}
            </button>
          </div>
        )}

        {/* ── BILLING ── */}
        {active === 'billing' && (
          <div>
            {sectionTitle('Subscription & Billing', 'Manage your plan.')}
            <div style={{ background: 'var(--ink)', borderRadius: 10, padding: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--cream)', marginBottom: 3 }}>{isPro ? 'Pro Plan' : 'Free Plan'}</div>
                <div style={{ fontSize: 12, color: 'rgba(245,240,232,.45)' }}>{isPro ? 'Active subscription' : 'Upgrade to unlock all Pro features'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 28, fontWeight: 700, color: 'var(--gold)' }}>{isPro ? '$12' : '$0'}</div>
                <div style={{ fontSize: 12, color: 'rgba(245,240,232,.4)' }}>/month</div>
              </div>
            </div>
            {!isPro && (
              <div style={{ padding: '1rem 1.25rem', background: 'rgba(196,146,42,.08)', border: '1px solid rgba(196,146,42,.2)', borderRadius: 10, marginBottom: '1rem' }}>
                <div style={{ fontSize: 14, color: 'var(--ink)', marginBottom: '1rem' }}>Upgrade to Pro for unlimited share links, secret locations, permit info, white-label pages, and more.</div>
                <button onClick={() => setToast('Stripe billing coming soon!')} style={{ background: 'var(--gold)', color: 'var(--ink)', padding: '9px 20px', borderRadius: 4, border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Upgrade to Pro →</button>
              </div>
            )}
            {isPro && (
              <button onClick={() => setToast('Cancellation flow coming soon')} style={{ background: 'rgba(181,75,42,.08)', color: 'var(--rust)', border: '1px solid rgba(181,75,42,.25)', padding: '8px 18px', borderRadius: 4, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel subscription
              </button>
            )}
          </div>
        )}

        {/* ── PASSWORD ── */}
        {active === 'password' && (
          <div>
            {sectionTitle('Password & Security')}
            <div style={{ background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10, padding: '1.25rem', maxWidth: 420 }}>
              <div style={{ marginBottom: '.75rem' }}>
                <label style={labelStyle}>New password</label>
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} style={inputStyle} placeholder="••••••••" />
              </div>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={labelStyle}>Confirm new password</label>
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} style={inputStyle} placeholder="••••••••" />
              </div>
              <button onClick={updatePassword} disabled={saving || !newPw || !confirmPw} style={{ background: 'var(--gold)', color: 'var(--ink)', padding: '10px 24px', borderRadius: 4, border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: saving || !newPw || !confirmPw ? 0.5 : 1 }}>
                {saving ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', background: 'var(--ink)', color: 'var(--cream)', padding: '10px 18px', borderRadius: 10, fontSize: 13, border: '1px solid rgba(255,255,255,.1)', zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,.3)', animation: 'toast-in .25s ease' }}>
          {toast}
        </div>
      )}
    </div>
  )
}