'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import AddressSearch, { type AddressResult } from '@/components/AddressSearch'
import PickTemplateEditor from '@/components/PickTemplateEditor'
import type { PickTemplate } from '@/lib/pick-template'

interface Template {
  id: string; name: string; body: string
}

interface HomeLocation {
  lat: number
  lng: number
  label: string
  shortLabel?: string | null
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
  studio_name?:            string
  instagram?:              string
  website?:                string
  // Photographer's home city — used by the Explore map to open near
  // them instead of a generic US-wide view. Saved during onboarding
  // (when they enter their address) or edited here on the Profile page.
  home?:                   HomeLocation | null
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
  { id: 'domain',      icon: '🌐', label: 'Custom Domain'          },
  { id: 'templates',   icon: '✉️',  label: 'Message Templates'      },
  { id: 'preferences', icon: '⚙',  label: 'Preferences'            },
  { id: 'billing',     icon: '💳', label: 'Subscription & Billing' },
  { id: 'password',    icon: '🔒', label: 'Password & Security'    },
]

const ACCENT_COLORS = ['#c4922a','#4a6741','#3d6e8c','#b54b2a','#7c5cbf','#1a1612','#d4626a','#4a7a9b']

// Feature flag — Custom Sending Email is hidden until we upgrade the
// Resend plan to fit more than one verified domain. Each photographer
// registers an additional domain on our Resend account, and the Free
// tier caps at one (already taken by locateshoot.com itself). When ready
// to enable, set NEXT_PUBLIC_CUSTOM_SENDER_ENABLED=true in env. The
// underlying API routes + migration stay in place so flipping the flag
// is the only change needed.
const CUSTOM_SENDER_ENABLED = process.env.NEXT_PUBLIC_CUSTOM_SENDER_ENABLED === 'true'

export default function ProfilePage() {
  const [active,        setActive]        = useState('profile')
  const [userId,        setUserId]        = useState<string | null>(null)
  const [plan,          setPlan]          = useState<string>('free')
  const [toast,         setToast]         = useState<string | null>(null)
  const [saving,        setSaving]        = useState(false)

  const [fullName,   setFullName]   = useState('')
  const [studioName, setStudioName] = useState('')
  const [email,      setEmail]      = useState('')
  const [instagram,  setInstagram]  = useState('')
  const [website,    setWebsite]    = useState('')

  const [logoPreview,    setLogoPreview]    = useState<string | null>(null)
  const [brandAccent,    setBrandAccent]    = useState('#c4922a')
  const [showStudioName, setShowStudioName] = useState(true)
  const [shareTagline,   setShareTagline]   = useState("Let's find your perfect spot together.")
  const logoInputRef = useRef<HTMLInputElement>(null)

  const [templates,     setTemplates]     = useState<Template[]>([])
  const [editingId,     setEditingId]     = useState<string | null>(null)
  const [editName,      setEditName]      = useState('')
  const [editBody,      setEditBody]      = useState('')
  const [showNewForm,   setShowNewForm]   = useState(false)
  const [newName,       setNewName]       = useState('')
  const [newBody,       setNewBody]       = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [templSaving,   setTemplSaving]   = useState(false)

  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS)
  // Pro-only Pick page template (font/colors/header/background). Loaded
  // alongside the rest of the profile fields. The editor saves directly
  // to profiles.pick_template via supabase, so we just keep state in
  // sync here for the initial render.
  const [pickTemplate, setPickTemplate] = useState<PickTemplate | null>(null)
  // Toggle between the read-only "📍 Loose Park, KC" pill and the
  // AddressSearch typeahead. We keep the typeahead hidden by default so
  // the profile form looks clean for users who set their home city
  // during onboarding.
  const [changingHome, setChangingHome] = useState(false)
  const [newPw,     setNewPw]     = useState('')
  const [confirmPw, setConfirmPw] = useState('')

  const [mfaFactors,   setMfaFactors]   = useState<any[]>([])
  const [mfaEnrolling, setMfaEnrolling] = useState<{ factorId: string; qr: string; secret: string } | null>(null)
  const [mfaCode,      setMfaCode]      = useState('')
  const [mfaBusy,      setMfaBusy]      = useState(false)

  // Stripe billing
  const [planRenewsAt,      setPlanRenewsAt]      = useState<string | null>(null)
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState<boolean>(false)
  const [subStatus,         setSubStatus]         = useState<string | null>(null)
  const [billingBusy,       setBillingBusy]       = useState(false)
  const [billingError,      setBillingError]      = useState<string | null>(null)

  // Custom domain
  const [domainInput,   setDomainInput]   = useState('')
  const [domain,        setDomain]        = useState<string | null>(null)
  const [domainState,   setDomainState]   = useState<'none'|'pending_dns'|'misconfigured'|'verified'>('none')
  const [domainDetail,  setDomainDetail]  = useState<string | null>(null)
  const [cnameTarget,   setCnameTarget]   = useState('cname.vercel-dns.com')
  const [domainBusy,    setDomainBusy]    = useState(false)
  const [domainError,   setDomainError]   = useState('')
  const [showDomainHelp,setShowDomainHelp]= useState(false)

  // Custom sending email (Pro feature). Same shape as the custom domain
  // flow above — input → save → DNS records to add → verify status.
  // State is whatever Resend returns (pending, verified, failed, etc.).
  interface SenderRecord { record:string; type:string; name:string; value:string; status?:string; ttl?:string|number; priority?:number }
  const [senderInput,   setSenderInput]   = useState('')
  const [senderEmail,   setSenderEmail]   = useState<string | null>(null)
  const [senderState,   setSenderState]   = useState<string>('none')
  const [senderRecords, setSenderRecords] = useState<SenderRecord[]>([])
  const [senderBusy,    setSenderBusy]    = useState(false)
  const [senderError,   setSenderError]   = useState('')
  const [showSenderHelp,setShowSenderHelp]= useState(false)

  // Tier predicates. isPro is the strict "Pro tier only" check used by
  // custom-domain, white-label, and custom-sending-email gates. isPaid
  // is "any paid tier" — a Starter user shouldn't see Free upgrade
  // banners just because they're not on Pro.
  const isPaid     = plan === 'starter' || plan === 'pro' || plan === 'Pro'
  const isPro      = plan === 'pro' || plan === 'Pro'
  const isStarter  = plan === 'starter'
  const tierLabel  = isPro ? 'Pro' : isStarter ? 'Starter' : 'Free'
  const tierPrice  = isPro ? '$25' : isStarter ? '$12' : '$0'

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
    setUserId(user.id); setEmail(user.email ?? '')
    // Try with pick_template (migration 20260426); fall back without it
    // so the page still loads on databases where that column hasn't
    // been added yet.
    const cols = 'full_name,preferences,plan,plan_renews_at,cancel_at_period_end,stripe_subscription_status'
    let profileRes = await supabase.from('profiles').select(`${cols},pick_template`).eq('id', user.id).single()
    if (profileRes.error && /pick_template/.test(profileRes.error.message ?? '')) {
      profileRes = await supabase.from('profiles').select(cols).eq('id', user.id).single() as any
    }
    const profile = profileRes.data
    if (profile) {
      setFullName(profile.full_name ?? ''); setPlan(profile.plan ?? 'free')
      setPlanRenewsAt((profile as any).plan_renews_at ?? null)
      setCancelAtPeriodEnd(!!(profile as any).cancel_at_period_end)
      setSubStatus((profile as any).stripe_subscription_status ?? null)
      setPickTemplate((profile as any).pick_template ?? null)
      const p = profile.preferences as Preferences | null
      if (p) {
        setPrefs({ ...DEFAULT_PREFS, ...p })
        if (p.brand_accent)    setBrandAccent(p.brand_accent)
        if (p.show_studio_name !== undefined) setShowStudioName(p.show_studio_name)
        if (p.share_tagline)   setShareTagline(p.share_tagline)
        if (p.logo_url)        setLogoPreview(p.logo_url)
        if (p.studio_name)     setStudioName(p.studio_name)
        if (p.instagram)       setInstagram(p.instagram)
        if (p.website)         setWebsite(p.website)
      }
    }
    const { data: tmplData } = await supabase.from('message_templates').select('id,name,body').eq('user_id', user.id).order('created_at', { ascending: true })
    if (tmplData) setTemplates(tmplData)
  }, [])

  useEffect(() => { loadProfile() }, [loadProfile])

  // Refresh on tab focus. The Stripe Customer Portal doesn't auto-
  // redirect back after cancel/update — a user may close the portal
  // tab and re-focus the LocateShoot tab without triggering a full
  // page reload, which would leave the billing UI showing stale state
  // from before they made changes. Re-fetching the profile when the
  // tab becomes visible keeps the renew/cancel banner accurate.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') loadProfile()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onVisibility)
    }
  }, [loadProfile])

  const loadMfa = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors()
    setMfaFactors(data?.totp ?? [])
  }, [])

  useEffect(() => { loadMfa() }, [loadMfa])

  const loadDomainStatus = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch('/api/custom-domain/status', { headers: { Authorization: `Bearer ${session.access_token}` } })
    if (!res.ok) return
    const data = await res.json()
    setDomain(data.domain ?? null)
    setDomainState(data.state ?? 'none')
    setDomainDetail(data.detail ?? null)
    if (data.cname_target) setCnameTarget(data.cname_target)
    if (data.domain && !domainInput) setDomainInput(data.domain)
  }, [domainInput])

  useEffect(() => { loadDomainStatus() }, [loadDomainStatus])

  const loadSenderStatus = useCallback(async () => {
    if (!CUSTOM_SENDER_ENABLED) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch('/api/sender-domain/status', { headers: { Authorization: `Bearer ${session.access_token}` } })
    if (!res.ok) return
    const data = await res.json()
    setSenderEmail(data.email ?? null)
    setSenderState(data.state ?? 'none')
    setSenderRecords(Array.isArray(data.records) ? data.records : [])
    if (data.email && !senderInput) setSenderInput(data.email)
  }, [senderInput])

  useEffect(() => { loadSenderStatus() }, [loadSenderStatus])

  async function saveSender() {
    setSenderError(''); setSenderBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setSenderError('Not signed in.'); return }
      const res = await fetch('/api/sender-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ email: senderInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSenderError(data.message ?? data.error ?? 'Could not save sending email.')
        return
      }
      setSenderEmail(data.email)
      setSenderState(data.state)
      setSenderRecords(Array.isArray(data.records) ? data.records : [])
      setToast(data.verified ? '✓ Sending email verified!' : '✓ Saved — add the DNS records below to finish setup.')
    } finally { setSenderBusy(false) }
  }

  // Stripe — start checkout for a (tier, cadence) pair. Returns a
  // hosted Stripe URL we redirect the browser to; subscription state
  // syncs back via the webhook on completion. Pro tier comes with a
  // 14-day trial baked in server-side.
  async function startCheckout(tier: 'starter' | 'pro', cadence: 'monthly' | 'yearly') {
    setBillingError(null); setBillingBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setBillingError('Sign in expired — refresh and try again.'); return }
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ tier, cadence }),
      })
      const data = await res.json()
      if (data.alreadyPaid) {
        // They already have a subscription — switching tiers happens
        // through the Stripe Customer Portal, not a fresh checkout.
        await openBillingPortal()
        return
      }
      if (!res.ok || !data.url) {
        setBillingError(data.message ?? data.error ?? 'Could not start checkout.')
        return
      }
      window.location.href = data.url
    } finally { setBillingBusy(false) }
  }

  async function openBillingPortal() {
    setBillingError(null); setBillingBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setBillingError('Sign in expired — refresh and try again.'); return }
      const res = await fetch('/api/billing-portal', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setBillingError(data.message ?? data.error ?? 'Could not open billing portal.')
        return
      }
      window.location.href = data.url
    } finally { setBillingBusy(false) }
  }

  // After Stripe redirects back from Checkout, surface a toast based on
  // the ?checkout= query param. The webhook will have already (or shortly
  // will have) updated profiles.plan, so the next load reflects Pro.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const status = params.get('checkout')
    if (status === 'success') {
      setToast('🎉 Welcome to Pro! Your features are active.')
      params.delete('checkout')
      const qs = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash)
      loadProfile()
    } else if (status === 'cancel') {
      setToast('Checkout canceled — no charge was made.')
      params.delete('checkout')
      const qs = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash)
    }
    // Only run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function removeSender() {
    if (!confirm('Remove your custom sending email? Client emails will go from notifications@locateshoot.com again.')) return
    setSenderBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await fetch('/api/sender-domain', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      setSenderEmail(null); setSenderState('none'); setSenderRecords([]); setSenderInput('')
      setToast('Custom sending email removed')
    } finally { setSenderBusy(false) }
  }

  async function saveDomain() {
    setDomainError(''); setDomainBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setDomainError('Not signed in.'); return }
      const res = await fetch('/api/custom-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ domain: domainInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setDomainError(data.message ?? data.error ?? 'Could not save domain.')
        return
      }
      setDomain(data.domain)
      setDomainState(data.state)
      setDomainDetail(data.detail ?? null)
      setToast(data.verified ? '✓ Domain verified!' : '✓ Domain added — waiting for DNS')
    } finally { setDomainBusy(false) }
  }

  async function removeDomain() {
    if (!confirm('Remove your custom domain? Client links will revert to locateshoot.com.')) return
    setDomainBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await fetch('/api/custom-domain', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      setDomain(null); setDomainState('none'); setDomainDetail(null); setDomainInput('')
      setToast('Custom domain removed')
    } finally { setDomainBusy(false) }
  }

  const verifiedFactor = mfaFactors.find(f => f.status === 'verified')

  async function startMfaEnroll() {
    setMfaBusy(true)
    try {
      for (const f of mfaFactors.filter(f => f.status !== 'verified')) {
        await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'LocateShoot' })
      if (error || !data) { setToast(`⚠ ${error?.message ?? 'Could not start 2FA'}`); return }
      setMfaEnrolling({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
    } finally { setMfaBusy(false) }
  }

  async function verifyMfa() {
    if (!mfaEnrolling || mfaCode.length !== 6) return
    setMfaBusy(true)
    try {
      const ch = await supabase.auth.mfa.challenge({ factorId: mfaEnrolling.factorId })
      if (ch.error || !ch.data) { setToast(`⚠ ${ch.error?.message ?? 'Challenge failed'}`); return }
      const vr = await supabase.auth.mfa.verify({ factorId: mfaEnrolling.factorId, challengeId: ch.data.id, code: mfaCode.trim() })
      if (vr.error) { setToast(`⚠ ${vr.error.message}`); return }
      setMfaEnrolling(null); setMfaCode('')
      await loadMfa()
      setToast('✓ Two-factor authentication enabled!')
    } finally { setMfaBusy(false) }
  }

  async function cancelMfaEnroll() {
    if (!mfaEnrolling) return
    await supabase.auth.mfa.unenroll({ factorId: mfaEnrolling.factorId })
    setMfaEnrolling(null); setMfaCode('')
    await loadMfa()
  }

  async function disableMfa() {
    if (!verifiedFactor) return
    if (!confirm('Disable two-factor authentication? You will no longer need a 6-digit code to sign in.')) return
    setMfaBusy(true)
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: verifiedFactor.id })
      if (error) setToast(`⚠ ${error.message}`)
      else setToast('Two-factor authentication disabled')
      await loadMfa()
    } finally { setMfaBusy(false) }
  }

  async function saveProfile() {
    if (!userId) return; setSaving(true)
    const updated: Preferences = {
      ...prefs,
      studio_name: studioName.trim() || undefined,
      instagram:   instagram.trim() || undefined,
      website:     website.trim() || undefined,
    }
    const { error } = await supabase.from('profiles').update({
      full_name:   fullName.trim(),
      email:       email.trim(),
      preferences: updated,
    }).eq('id', userId)
    if (!error) setPrefs(updated)
    setSaving(false); setToast(error ? '⚠ Could not save' : '✓ Profile saved!')
  }

  // Home city — saves immediately on select instead of waiting for the
  // Save profile button. Less surprising than typing an address, leaving,
  // then wondering why the Explore map didn't move.
  async function handleHomeSelect(r: AddressResult) {
    const home: HomeLocation = { lat: r.lat, lng: r.lng, label: r.label, shortLabel: r.shortLabel ?? null }
    const updated = { ...prefs, home }
    setPrefs(updated)
    setChangingHome(false)
    if (!userId) return
    setSaving(true)
    const { error } = await supabase.from('profiles').update({ preferences: updated }).eq('id', userId)
    setSaving(false)
    setToast(error ? '⚠ Could not save home city' : '✓ Home city saved!')
  }

  async function clearHome() {
    const updated = { ...prefs, home: null }
    setPrefs(updated)
    setChangingHome(false)
    if (!userId) return
    setSaving(true)
    const { error } = await supabase.from('profiles').update({ preferences: updated }).eq('id', userId)
    setSaving(false)
    setToast(error ? '⚠ Could not clear home city' : 'Home city cleared')
  }

  async function savePreferences() {
    if (!userId) return; setSaving(true)
    const { error } = await supabase.from('profiles').update({ preferences: prefs }).eq('id', userId)
    setSaving(false); setToast(error ? '⚠ Could not save' : '✓ Preferences saved!')
  }

  async function saveBranding() {
    if (!userId) return; setSaving(true)
    const updated = { ...prefs, brand_accent: brandAccent, show_studio_name: showStudioName, share_tagline: shareTagline }
    const { error } = await supabase.from('profiles').update({ preferences: updated }).eq('id', userId)
    setPrefs(updated); setSaving(false); setToast(error ? '⚠ Could not save' : '✓ Branding saved!')
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
    const ext = file.name.split('.').pop(), path = `${userId}/logo.${ext}`
    const { error } = await supabase.storage.from('location-photos').upload(path, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('location-photos').getPublicUrl(path)
      const updated = { ...prefs, logo_url: data.publicUrl }
      await supabase.from('profiles').update({ preferences: updated }).eq('id', userId)
      setPrefs(updated)
    }
  }

  function startEdit(t: Template) { setEditingId(t.id); setEditName(t.name); setEditBody(t.body); setShowNewForm(false) }
  function cancelEdit() { setEditingId(null); setEditName(''); setEditBody('') }

  async function saveEdit() {
    if (!editName.trim() || !editBody.trim() || !userId) return; setTemplSaving(true)
    const { error } = await supabase.from('message_templates').update({ name: editName.trim(), body: editBody.trim() }).eq('id', editingId!)
    if (!error) { setTemplates(prev => prev.map(t => t.id === editingId ? { ...t, name: editName.trim(), body: editBody.trim() } : t)); setEditingId(null); setToast('✓ Template saved!') }
    else { setToast('⚠ Could not save') }
    setTemplSaving(false)
  }

  async function addTemplate() {
    if (!newName.trim() || !newBody.trim() || !userId) return; setTemplSaving(true)
    const { data, error } = await supabase.from('message_templates').insert({ user_id: userId, name: newName.trim(), body: newBody.trim() }).select().single()
    if (!error && data) { setTemplates(prev => [...prev, data]); setNewName(''); setNewBody(''); setShowNewForm(false); setToast('✓ Template created!') }
    else { setToast('⚠ Could not save') }
    setTemplSaving(false)
  }

  async function deleteTemplate(id: string) {
    if (deleteConfirm !== id) { setDeleteConfirm(id); return }
    const { error } = await supabase.from('message_templates').delete().eq('id', id)
    if (!error) { setTemplates(prev => prev.filter(t => t.id !== id)); setDeleteConfirm(null); setToast('Template deleted') }
  }

  async function updatePassword() {
    if (newPw !== confirmPw) { setToast('⚠ Passwords do not match'); return }
    if (newPw.length < 8) { setToast('⚠ Password must be at least 8 characters'); return }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setSaving(false)
    if (error) setToast(`⚠ ${error.message}`)
    else { setToast('✓ Password updated!'); setNewPw(''); setConfirmPw('') }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', border: '1px solid var(--cream-dark)', borderRadius: 4,
    fontFamily: 'var(--font-dm-sans),sans-serif', fontSize: 14, color: 'var(--ink)', background: 'white', outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 500, textTransform: 'uppercase',
    letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 5,
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
      <label key={key} onClick={() => !locked && updatePref(key, !prefs[key])} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: locked ? 'default' : 'pointer', marginBottom: 14, opacity: locked ? 0.5 : 1 }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div className="profile-topnav-mobile"><AppNav /></div>
    <div className="profile-outer">

      {/* SIDEBAR — className enables mobile horizontal tab bar */}
      <div className="profile-sidebar">
        {/* Logo + back — hidden on mobile via .profile-sidebar-logo/.profile-sidebar-back */}
        <div className="profile-sidebar-logo" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--cream-dark)' }}>
          <Link href="/" style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 17, fontWeight: 900, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)', display: 'inline-block' }} />LocateShoot
          </Link>
        </div>
        <div className="profile-sidebar-back" style={{ padding: '1rem 1.5rem 0.5rem' }}>
          <Link href="/dashboard" style={{ fontSize: 12, color: 'var(--ink-soft)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>← Back to dashboard</Link>
        </div>

        {/* Nav items */}
        <div style={{ padding: '0.5rem 0.75rem', flex: 1 }}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-dm-sans),sans-serif', fontSize: 13, fontWeight: active === item.id ? 500 : 400, color: active === item.id ? 'var(--gold)' : 'var(--ink-soft)', background: active === item.id ? 'rgba(196,146,42,.08)' : 'transparent', marginBottom: 2, transition: 'all .15s', whiteSpace: 'nowrap' }}
            >
              <span style={{ fontSize: 15, width: 18, textAlign: 'center' }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>

        {/* Avatar — hidden on mobile */}
        <div className="profile-sidebar-avatar" style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--cream-dark)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {logoPreview
              ? <img src={logoPreview} alt="Logo" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              : <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(196,146,42,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: 'var(--gold)', flexShrink: 0 }}>{fullName.charAt(0) || '?'}</div>
            }
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{fullName || 'Your Name'}</div>
              <span style={{ padding: '1px 6px', borderRadius: 20, fontSize: 10, background: isPaid ? 'rgba(196,146,42,.12)' : 'var(--cream-dark)', color: isPaid ? 'var(--gold)' : 'var(--ink-soft)', border: isPaid ? '1px solid rgba(196,146,42,.2)' : 'none', fontWeight: 500 }}>
                {isPro ? '⭐ Pro' : isStarter ? '✦ Starter' : 'Free'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT — className enables mobile full-width */}
      <div className="profile-main">

        {/* Mobile nav — section dropdown (hamburger above handles dashboard/explore/etc.) */}
        <div className="profile-mobile-nav">
          <label style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>Section</label>
          <select value={active} onChange={e => setActive(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--cream-dark)', borderRadius: 6, fontFamily: 'var(--font-dm-sans),sans-serif', fontSize: 14, color: 'var(--ink)', background: 'white', appearance: 'none', backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' stroke='%236b5f52' stroke-width='1.5' fill='none'/></svg>\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32 }}>
            {NAV_ITEMS.map(item => (
              <option key={item.id} value={item.id}>{item.icon}  {item.label}</option>
            ))}
          </select>
        </div>

        {/* ── PROFILE ── */}
        {active === 'profile' && (
          <div>
            {sectionTitle('Profile', 'Your information shown to clients and the community.')}
            {/* Back link on mobile */}
            <Link href="/dashboard" style={{ display: 'none', fontSize: 13, color: 'var(--ink-soft)', textDecoration: 'none', marginBottom: '1.5rem' }} className="profile-mobile-back">← Dashboard</Link>
            <div className="profile-form-grid">
              <div><label style={labelStyle}>Full name</label><input value={fullName} onChange={e => setFullName(e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Studio / business name</label><input value={studioName} onChange={e => setStudioName(e.target.value)} style={inputStyle} placeholder="e.g. Jane Doe Photography" /></div>
              <div><label style={labelStyle}>Email address</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Instagram handle</label><input value={instagram} onChange={e => setInstagram(e.target.value)} style={inputStyle} placeholder="@yourhandle" /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Website</label><input value={website} onChange={e => setWebsite(e.target.value)} style={inputStyle} placeholder="www.yoursite.com" /></div>
            </div>

            {/* Home city — controls where the Explore map opens. Stored
                in preferences.home so it survives whenever profile is
                saved. We render the AddressSearch typeahead only when
                the user wants to change/add it; otherwise just show the
                pinned label + a Change button so they don't have to look
                at an empty input every visit. */}
            <div style={{ background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10, padding: '1.25rem', marginTop: '1.5rem', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 4 }}>📍 Home city</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: '1rem', lineHeight: 1.5 }}>
                The Explore map opens here when you sign in. Leave it blank to default to a USA-wide view.
              </div>
              {prefs.home && !changingHome ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 6, background: 'rgba(74,103,65,.08)', border: '1px solid rgba(74,103,65,.2)' }}>
                  <span>📍</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--sage)' }}>{prefs.home.shortLabel ?? prefs.home.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, marginTop: 1 }}>{prefs.home.lat.toFixed(4)}, {prefs.home.lng.toFixed(4)}</div>
                  </div>
                  <button onClick={() => setChangingHome(true)} style={{ padding: '5px 12px', borderRadius: 4, background: 'white', border: '1px solid var(--cream-dark)', fontSize: 12, color: 'var(--ink-soft)', cursor: 'pointer', fontFamily: 'inherit' }}>Change</button>
                  <button onClick={clearHome} disabled={saving} style={{ padding: '5px 12px', borderRadius: 4, background: 'rgba(181,75,42,.08)', color: 'var(--rust)', border: '1px solid rgba(181,75,42,.2)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Clear</button>
                </div>
              ) : (
                <>
                  <AddressSearch onSelect={handleHomeSelect} placeholder="e.g. Kansas City, MO" />
                  {prefs.home && (
                    <button onClick={() => setChangingHome(false)} style={{ marginTop: 8, background: 'transparent', color: 'var(--ink-soft)', border: 'none', padding: 0, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>Cancel</button>
                  )}
                </>
              )}
            </div>

            <button onClick={saveProfile} disabled={saving} style={{ background: 'var(--gold)', color: 'var(--ink)', padding: '10px 24px', borderRadius: 4, border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        )}

        {/* ── BRANDING ── */}
        {active === 'branding' && (
          <div>
            {sectionTitle('Branding', 'Your logo and colors appear on client share pages.')}
            <div style={{ background: isPro ? 'white' : 'var(--cream)', border: `1px solid ${isPro ? 'var(--cream-dark)' : 'var(--sand)'}`, borderRadius: 10, padding: '1.25rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    🎨 White-label share pages
                    {!isPro && <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, background: 'rgba(196,146,42,.12)', color: 'var(--gold)', border: '1px solid rgba(196,146,42,.2)', fontWeight: 500 }}>Pro only</span>}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.55 }}>Your logo replaces the LocateShoot branding on client share pages.</div>
                </div>
                <div onClick={() => isPro && updatePref('remove_ls_branding', !prefs.remove_ls_branding)} style={{ width: 44, height: 24, borderRadius: 12, background: prefs.remove_ls_branding && isPro ? 'var(--gold)' : 'var(--cream-dark)', cursor: isPro ? 'pointer' : 'not-allowed', position: 'relative', transition: 'background .2s', flexShrink: 0, opacity: isPro ? 1 : 0.5 }}>
                  <div style={{ position: 'absolute', top: 3, left: prefs.remove_ls_branding && isPro ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: 'white', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
                </div>
              </div>
            </div>

            <div style={{ background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10, padding: '1.25rem', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: '1rem' }}>Studio logo</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', border: '2px dashed var(--sand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', background: 'var(--cream)' }}>
                  {logoPreview ? <img src={logoPreview} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ textAlign: 'center' }}><div style={{ fontSize: 22, marginBottom: 2 }}>📷</div><div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>No logo</div></div>}
                </div>
                <div>
                  <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                  <button onClick={() => logoInputRef.current?.click()} style={{ display: 'block', padding: '9px 18px', borderRadius: 4, border: '1.5px solid var(--sand)', background: 'white', fontSize: 13, fontWeight: 500, color: 'var(--ink-soft)', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8 }}>Upload logo</button>
                  {logoPreview && <button onClick={() => setLogoPreview(null)} style={{ display: 'block', padding: '6px 12px', borderRadius: 4, border: 'none', background: 'transparent', fontSize: 12, color: 'var(--rust)', cursor: 'pointer', fontFamily: 'inherit' }}>Remove logo</button>}
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, marginTop: 4, lineHeight: 1.5 }}>PNG or JPG · Square, at least 200×200px</div>
                </div>
              </div>
            </div>

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

            <div style={{ background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
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

            <button onClick={saveBranding} disabled={saving} style={{ background: 'var(--gold)', color: 'var(--ink)', padding: '10px 24px', borderRadius: 4, border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save branding'}
            </button>

            {/* Pick page template — Pro tier. Editor handles its own
                save (writes to profiles.pick_template directly), so
                it sits below the branding save button rather than
                being bundled into it. */}
            <div style={{ marginTop: '2rem' }}>
              <PickTemplateEditor
                userId={userId ?? ''}
                initial={pickTemplate}
                isPro={isPro}
                onChange={setPickTemplate}
              />
            </div>
          </div>
        )}

        {/* ── CUSTOM DOMAIN ── */}
        {active === 'domain' && (
          <div>
            {sectionTitle('Custom Domain', 'Serve your Location Guides from your own domain (e.g. locations.yoursite.com).')}
            {!isPro && (
              <div style={{ padding: '12px 14px', background: 'rgba(196,146,42,.08)', border: '1px solid rgba(196,146,42,.25)', borderRadius: 8, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>⭐ Pro plan feature</div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', flex: 1, minWidth: 200 }}>Upgrade to use your own domain for Location Guides.</div>
                <Link href="/profile#billing" onClick={() => setActive('billing')} style={{ padding: '7px 14px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', fontSize: 12, fontWeight: 500, textDecoration: 'none' }}>Upgrade</Link>
              </div>
            )}

            <div style={{ background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10, padding: '1.25rem', maxWidth: 560 }}>

              {domain && (
                <div style={{ marginBottom: '1rem', padding: '10px 12px', borderRadius: 8, background: domainState === 'verified' ? 'rgba(74,103,65,.08)' : domainState === 'misconfigured' ? 'rgba(181,75,42,.08)' : 'rgba(196,146,42,.08)', border: `1px solid ${domainState === 'verified' ? 'rgba(74,103,65,.25)' : domainState === 'misconfigured' ? 'rgba(181,75,42,.25)' : 'rgba(196,146,42,.25)'}` }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: domainState === 'verified' ? 'var(--sage)' : domainState === 'misconfigured' ? 'var(--rust)' : 'var(--gold)', marginBottom: 2 }}>
                    {domainState === 'verified' ? '✓ Verified' : domainState === 'misconfigured' ? '⚠ DNS misconfigured' : '⏳ Waiting for DNS'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontFamily: 'monospace' }}>{domain}</div>
                  {domainDetail && <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4, lineHeight: 1.5 }}>{domainDetail}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={loadDomainStatus} disabled={domainBusy} style={{ padding: '5px 12px', borderRadius: 4, background: 'white', border: '1px solid var(--cream-dark)', fontSize: 11, fontWeight: 500, cursor: 'pointer', color: 'var(--ink-soft)', fontFamily: 'inherit' }}>Refresh status</button>
                    <button onClick={removeDomain} disabled={domainBusy} style={{ padding: '5px 12px', borderRadius: 4, background: 'rgba(181,75,42,.08)', color: 'var(--rust)', border: '1px solid rgba(181,75,42,.2)', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Remove domain</button>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '.75rem' }}>
                <label style={labelStyle}>Your domain</label>
                <input value={domainInput} onChange={e => setDomainInput(e.target.value)} style={inputStyle} placeholder="locations.yoursite.com" disabled={!isPro || !!domain} />
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4, fontWeight: 300 }}>Use a subdomain like <code style={{ background: 'var(--cream)', padding: '1px 5px', borderRadius: 3 }}>locations.yoursite.com</code> — not the root domain.</div>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {!domain && <button onClick={saveDomain} disabled={!isPro || domainBusy || !domainInput.trim()} style={{ background: 'var(--gold)', color: 'var(--ink)', padding: '10px 20px', borderRadius: 4, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: !isPro || domainBusy || !domainInput.trim() ? 0.5 : 1 }}>
                  {domainBusy ? 'Saving…' : 'Save domain'}
                </button>}
                <button onClick={() => setShowDomainHelp(true)} style={{ background: 'transparent', color: 'var(--sky)', border: 'none', padding: 0, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>How do I set this up?</button>
              </div>

              {domainError && <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(181,75,42,.08)', border: '1px solid rgba(181,75,42,.2)', borderRadius: 6, fontSize: 13, color: 'var(--rust)' }}>{domainError}</div>}
            </div>

            {/* ── CUSTOM SENDING EMAIL ── */}
            {CUSTOM_SENDER_ENABLED && (
            <div style={{ marginTop: '2rem', paddingTop: '1.75rem', borderTop: '1px solid var(--cream-dark)' }}>
              <h2 style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
                Custom Sending Email
              </h2>
              <p style={{ fontSize: 14, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: '1.25rem', lineHeight: 1.55 }}>
                Send client confirmation emails from your own address (e.g. <code style={{ background: 'var(--cream)', padding: '1px 5px', borderRadius: 3 }}>you@yoursite.com</code>) instead of <code style={{ background: 'var(--cream)', padding: '1px 5px', borderRadius: 3 }}>notifications@locateshoot.com</code>. Requires SPF + DKIM records at your DNS provider.
              </p>

              {!isPro && (
                <div style={{ padding: '12px 14px', background: 'rgba(196,146,42,.08)', border: '1px solid rgba(196,146,42,.25)', borderRadius: 8, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>⭐ Pro plan feature</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', flex: 1, minWidth: 200 }}>Upgrade to send client emails from your own address.</div>
                  <Link href="/profile#billing" onClick={() => setActive('billing')} style={{ padding: '7px 14px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', fontSize: 12, fontWeight: 500, textDecoration: 'none' }}>Upgrade</Link>
                </div>
              )}

              <div style={{ background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10, padding: '1.25rem', maxWidth: 560 }}>
                {senderEmail && (
                  <div style={{ marginBottom: '1rem', padding: '10px 12px', borderRadius: 8,
                    background: senderState === 'verified' ? 'rgba(74,103,65,.08)' : senderState === 'failed' ? 'rgba(181,75,42,.08)' : 'rgba(196,146,42,.08)',
                    border: `1px solid ${senderState === 'verified' ? 'rgba(74,103,65,.25)' : senderState === 'failed' ? 'rgba(181,75,42,.25)' : 'rgba(196,146,42,.25)'}` }}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2,
                      color: senderState === 'verified' ? 'var(--sage)' : senderState === 'failed' ? 'var(--rust)' : 'var(--gold)' }}>
                      {senderState === 'verified' ? '✓ Verified — emails will send from this address'
                        : senderState === 'failed' ? '⚠ Verification failed — check your DNS records below'
                        : senderState === 'unknown' ? '⚠ Could not check status — try Refresh'
                        : '⏳ Waiting for DNS — add the records below at your registrar'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontFamily: 'monospace' }}>{senderEmail}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button onClick={loadSenderStatus} disabled={senderBusy} style={{ padding: '5px 12px', borderRadius: 4, background: 'white', border: '1px solid var(--cream-dark)', fontSize: 11, fontWeight: 500, cursor: 'pointer', color: 'var(--ink-soft)', fontFamily: 'inherit' }}>Refresh status</button>
                      <button onClick={removeSender} disabled={senderBusy} style={{ padding: '5px 12px', borderRadius: 4, background: 'rgba(181,75,42,.08)', color: 'var(--rust)', border: '1px solid rgba(181,75,42,.2)', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: '.75rem' }}>
                  <label style={labelStyle}>Sending email address</label>
                  <input value={senderInput} onChange={e => setSenderInput(e.target.value)} style={inputStyle} placeholder="you@yoursite.com" disabled={!isPro || !!senderEmail} />
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4, fontWeight: 300 }}>You'll need access to DNS for the domain part — Gmail/Yahoo/Outlook addresses won't work.</div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {!senderEmail && <button onClick={saveSender} disabled={!isPro || senderBusy || !senderInput.trim()} style={{ background: 'var(--gold)', color: 'var(--ink)', padding: '10px 20px', borderRadius: 4, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: !isPro || senderBusy || !senderInput.trim() ? 0.5 : 1 }}>
                    {senderBusy ? 'Saving…' : 'Save email'}
                  </button>}
                  <button onClick={() => setShowSenderHelp(true)} style={{ background: 'transparent', color: 'var(--sky)', border: 'none', padding: 0, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>How do I set this up?</button>
                </div>

                {senderError && <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(181,75,42,.08)', border: '1px solid rgba(181,75,42,.2)', borderRadius: 6, fontSize: 13, color: 'var(--rust)' }}>{senderError}</div>}

                {/* DNS records — only shown when Resend has handed them back. */}
                {senderRecords.length > 0 && (
                  <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--cream-dark)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>Add these records at your DNS provider</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: 12, lineHeight: 1.5 }}>
                      Log in to GoDaddy / Namecheap / Cloudflare / wherever you manage DNS for <strong>{senderEmail?.split('@')[1]}</strong>. Add each record below. Most propagate in a few minutes.
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {senderRecords.map((r, i) => (
                        <div key={i} style={{ background: 'var(--cream)', border: '1px solid var(--cream-dark)', borderRadius: 6, padding: '10px 12px', fontSize: 12, fontFamily: 'monospace', color: 'var(--ink)', overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, fontFamily: 'inherit' }}>
                            <span style={{ fontFamily: 'var(--font-dm-sans),sans-serif', fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                              {r.record}
                            </span>
                            <span style={{ fontFamily: 'var(--font-dm-sans),sans-serif', fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 20,
                              background: r.status === 'verified' ? 'rgba(74,103,65,.12)' : r.status === 'failed' ? 'rgba(181,75,42,.12)' : 'rgba(196,146,42,.12)',
                              color:      r.status === 'verified' ? 'var(--sage)'        : r.status === 'failed' ? 'var(--rust)'        : 'var(--gold)' }}>
                              {r.status === 'verified' ? '✓ verified' : r.status === 'failed' ? 'failed' : (r.status ?? 'pending')}
                            </span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 4, fontSize: 11, lineHeight: 1.45 }}>
                            <span style={{ color: 'var(--ink-soft)' }}>Type:</span><span><strong>{r.type}</strong></span>
                            <span style={{ color: 'var(--ink-soft)' }}>Host:</span><span style={{ wordBreak: 'break-all' }}><strong>{r.name}</strong></span>
                            <span style={{ color: 'var(--ink-soft)' }}>Value:</span><span style={{ wordBreak: 'break-all' }}><strong>{r.value}</strong></span>
                            {r.priority != null && (<><span style={{ color: 'var(--ink-soft)' }}>Priority:</span><span><strong>{r.priority}</strong></span></>)}
                            {r.ttl != null && (<><span style={{ color: 'var(--ink-soft)' }}>TTL:</span><span><strong>{r.ttl}</strong></span></>)}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 10, fontStyle: 'italic', fontWeight: 300, lineHeight: 1.5 }}>
                      Already added them? Click <strong>Refresh status</strong> above. If a record stays "pending" after 30 minutes, double-check the host/value match exactly — some providers add the domain automatically.
                    </div>
                  </div>
                )}
              </div>
            </div>
            )}
          </div>
        )}

        {/* ── TEMPLATES ── */}
        {active === 'templates' && (
          <div>
            {sectionTitle('Message Templates', 'Reusable messages for your Location Guides.')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              {templates.length === 0 && !showNewForm && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13, fontStyle: 'italic', background: 'white', borderRadius: 10, border: '1px solid var(--cream-dark)' }}>No templates yet — add your first one below.</div>
              )}
              {templates.map(t => (
                <div key={t.id} style={{ background: 'white', border: `1px solid ${editingId === t.id ? 'var(--gold)' : 'var(--cream-dark)'}`, borderRadius: 10, overflow: 'hidden' }}>
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
                          <button onClick={() => startEdit(t)} style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid var(--cream-dark)', background: 'white', fontSize: 12, color: 'var(--ink-soft)', cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                          <button onClick={() => deleteTemplate(t.id)} style={{ padding: '4px 12px', borderRadius: 4, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', background: deleteConfirm === t.id ? 'var(--rust)' : 'rgba(181,75,42,.08)', color: deleteConfirm === t.id ? 'white' : 'var(--rust)' }}>
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
              {prefRow('Email me when a client views my Location Guide', 'Know when your client opens the link you sent them.', 'email_on_view')}
            </div>
            <div style={{ background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10, padding: '1.25rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: '1.25rem' }}>Location Guide defaults</div>
              {prefRow('Default to "only show my photos" when creating a guide', 'New Location Guides will default to showing only your uploaded photos.', 'my_photos_only')}
              {prefRow('Always include nearby recommended locations', 'Automatically add well-rated public locations near the pin.', 'include_recommendations')}
            </div>
            <div style={{ background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: '1rem' }}>Default Location Guide expiry</div>
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
            <div style={{ background: 'var(--ink)', borderRadius: 10, padding: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--cream)', marginBottom: 3 }}>{tierLabel} Plan</div>
                <div style={{ fontSize: 12, color: 'rgba(245,240,232,.45)' }}>
                  {isPaid
                    ? subStatus === 'trialing'
                      ? `Free trial — first charge on ${planRenewsAt ? new Date(planRenewsAt).toLocaleDateString() : 'trial end'}`
                      : cancelAtPeriodEnd
                        ? `Cancels on ${planRenewsAt ? new Date(planRenewsAt).toLocaleDateString() : 'period end'} — won't renew`
                        : planRenewsAt
                          ? `Renews ${new Date(planRenewsAt).toLocaleDateString()}`
                          : 'Active subscription'
                    : 'Upgrade to Starter or Pro for the full toolset'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 28, fontWeight: 700, color: 'var(--gold)' }}>{tierPrice}</div>
                <div style={{ fontSize: 12, color: 'rgba(245,240,232,.4)' }}>/month</div>
              </div>
            </div>

            {/* Free user — show two upgrade cards side by side. Starter
                (entry paid tier) on the left, Pro (with 14-day trial)
                on the right. Once they're on a paid tier this whole
                block is replaced by the Manage subscription card below. */}
            {!isPaid && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: '1rem' }}>
                <div style={{ padding: '1.25rem', background: 'white', border: '1.5px solid var(--gold)', borderRadius: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>Starter</div>
                    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: 'rgba(196,146,42,.12)', color: 'var(--gold)', border: '1px solid rgba(196,146,42,.2)' }}>Most popular</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: '1rem', lineHeight: 1.55 }}>
                    Unlimited share guides + portfolio locations, client confirmation email with directions, share analytics, permit-info fields, Pinterest + blog links.
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => startCheckout('starter', 'monthly')} disabled={billingBusy} style={{ flex: 1, background: 'var(--gold)', color: 'var(--ink)', padding: '11px 18px', borderRadius: 4, border: 'none', fontSize: 13, fontWeight: 600, cursor: billingBusy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: billingBusy ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                      {billingBusy ? 'Loading…' : '$12 / month'}
                    </button>
                    <button onClick={() => startCheckout('starter', 'yearly')} disabled={billingBusy} style={{ flex: 1, background: 'var(--ink)', color: 'var(--cream)', padding: '11px 18px', borderRadius: 4, border: 'none', fontSize: 13, fontWeight: 500, cursor: billingBusy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: billingBusy ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                      {billingBusy ? '…' : '$120 / year'}
                    </button>
                  </div>
                </div>

                <div style={{ padding: '1.25rem', background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10 }}>
                  <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Pro <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--gold)', marginLeft: 4 }}>14-day free trial</span></div>
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: '1rem', lineHeight: 1.55 }}>
                    Everything in Starter + custom domain, white-label share pages, customizable Pick page templates (layout, font, colors, header). Card required at signup; no charge until day 15.
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => startCheckout('pro', 'monthly')} disabled={billingBusy} style={{ flex: 1, background: 'var(--ink)', color: 'var(--cream)', padding: '11px 18px', borderRadius: 4, border: 'none', fontSize: 13, fontWeight: 600, cursor: billingBusy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: billingBusy ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                      {billingBusy ? 'Loading…' : 'Try Pro · $25/mo'}
                    </button>
                    <button onClick={() => startCheckout('pro', 'yearly')} disabled={billingBusy} style={{ flex: 1, background: 'transparent', color: 'var(--ink)', padding: '11px 18px', borderRadius: 4, border: '1px solid var(--cream-dark)', fontSize: 13, fontWeight: 500, cursor: billingBusy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: billingBusy ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                      {billingBusy ? '…' : 'Yearly · $250'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Starter user — single Upgrade-to-Pro card alongside the
                Manage subscription card below. */}
            {isStarter && (
              <div style={{ padding: '1.25rem', background: 'white', border: '1.5px solid var(--gold)', borderRadius: 10, marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                  <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>Upgrade to Pro</div>
                  <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: 'rgba(196,146,42,.12)', color: 'var(--gold)' }}>14-day free trial</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: '1rem', lineHeight: 1.55 }}>
                  Add custom domain, white-label share pages, and customizable Pick page templates. Card required; no charge until day 15. After that, $25/mo or $250/yr.
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button onClick={() => startCheckout('pro', 'monthly')} disabled={billingBusy} style={{ background: 'var(--gold)', color: 'var(--ink)', padding: '11px 22px', borderRadius: 4, border: 'none', fontSize: 14, fontWeight: 600, cursor: billingBusy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: billingBusy ? 0.6 : 1 }}>
                    {billingBusy ? 'Loading…' : 'Start Pro trial — $25/mo'}
                  </button>
                  <button onClick={() => startCheckout('pro', 'yearly')} disabled={billingBusy} style={{ background: 'var(--ink)', color: 'var(--cream)', padding: '11px 22px', borderRadius: 4, border: 'none', fontSize: 14, fontWeight: 500, cursor: billingBusy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: billingBusy ? 0.6 : 1 }}>
                    {billingBusy ? '…' : 'Yearly trial — $250'}
                  </button>
                </div>
              </div>
            )}

            {isPaid && (
              <div style={{ padding: '1.25rem', background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10, marginBottom: '1rem' }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 6 }}>Manage subscription</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: '1rem', lineHeight: 1.55 }}>
                  Update your card, switch between monthly/yearly, view invoices, or cancel — handled by Stripe's billing portal. After making changes there, return here and the plan info above will refresh.
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={openBillingPortal} disabled={billingBusy} style={{ background: 'var(--ink)', color: 'var(--cream)', padding: '10px 20px', borderRadius: 4, border: 'none', fontSize: 13, fontWeight: 500, cursor: billingBusy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: billingBusy ? 0.6 : 1 }}>
                    {billingBusy ? 'Opening…' : 'Manage subscription →'}
                  </button>
                  <button onClick={loadProfile} style={{ background: 'transparent', color: 'var(--ink-soft)', padding: '10px 16px', borderRadius: 4, border: '1px solid var(--cream-dark)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Refresh status
                  </button>
                </div>
              </div>
            )}

            {billingError && (
              <div style={{ padding: '8px 12px', background: 'rgba(181,75,42,.08)', border: '1px solid rgba(181,75,42,.2)', borderRadius: 6, fontSize: 13, color: 'var(--rust)' }}>{billingError}</div>
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

            {/* Two-factor authentication */}
            <div style={{ background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10, padding: '1.25rem', maxWidth: 420, marginTop: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>🛡 Two-factor authentication</div>
                {verifiedFactor && <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, background: 'rgba(74,103,65,.1)', color: 'var(--sage)', border: '1px solid rgba(74,103,65,.2)', fontWeight: 500 }}>Enabled</span>}
                <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, background: 'var(--cream-dark)', color: 'var(--ink-soft)', fontWeight: 500 }}>Optional</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, marginBottom: '1rem', lineHeight: 1.5 }}>
                Adds a 6-digit code from your authenticator app at sign-in. Works with Google Authenticator, 1Password, Authy, and any TOTP app.
              </div>

              {verifiedFactor ? (
                <button onClick={disableMfa} disabled={mfaBusy} style={{ background: 'rgba(181,75,42,.08)', color: 'var(--rust)', padding: '9px 18px', borderRadius: 4, border: '1px solid rgba(181,75,42,.2)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {mfaBusy ? 'Working…' : 'Disable 2FA'}
                </button>
              ) : mfaEnrolling ? (
                <>
                  <div style={{ marginBottom: '.75rem', fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.5 }}>Scan this QR code with your authenticator app, then enter the 6-digit code it shows.</div>
                  <div style={{ background: 'white', padding: 12, borderRadius: 8, border: '1px solid var(--cream-dark)', display: 'flex', justifyContent: 'center', marginBottom: '.75rem' }} dangerouslySetInnerHTML={{ __html: mfaEnrolling.qr }} />
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: '.75rem' }}>
                    <span style={{ fontWeight: 500 }}>Or enter manually:</span> <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{mfaEnrolling.secret}</span>
                  </div>
                  <input type="text" inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" style={{ ...inputStyle, marginBottom: '.75rem', letterSpacing: '.2em', fontSize: 16, textAlign: 'center' }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={verifyMfa} disabled={mfaBusy || mfaCode.length !== 6} style={{ flex: 1, background: 'var(--gold)', color: 'var(--ink)', padding: '10px', borderRadius: 4, border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: mfaBusy || mfaCode.length !== 6 ? 0.5 : 1 }}>
                      {mfaBusy ? 'Verifying…' : 'Verify & enable'}
                    </button>
                    <button onClick={cancelMfaEnroll} disabled={mfaBusy} style={{ background: 'transparent', color: 'var(--ink-soft)', padding: '10px 18px', borderRadius: 4, border: '1px solid var(--sand)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <button onClick={startMfaEnroll} disabled={mfaBusy} style={{ background: 'var(--ink)', color: 'var(--cream)', padding: '10px 20px', borderRadius: 4, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {mfaBusy ? 'Working…' : 'Enable 2FA'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {showDomainHelp && (
        <>
          <div onClick={() => setShowDomainHelp(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,.7)', backdropFilter: 'blur(4px)', zIndex: 900 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'white', borderRadius: 16, width: 560, maxWidth: '92vw', maxHeight: '92vh', overflowY: 'auto', zIndex: 1000, boxShadow: '0 24px 64px rgba(0,0,0,.3)' }}>
            <div style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem', gap: 12 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 3 }}>🌐 Set up your custom domain</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300 }}>Roughly a 3-minute setup.</div>
                </div>
                <button onClick={() => setShowDomainHelp(false)} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--cream-dark)', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>1. Pick a subdomain</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.6 }}>Something like <code style={{ background: 'var(--cream)', padding: '1px 5px', borderRadius: 3 }}>locations.yoursite.com</code> or <code style={{ background: 'var(--cream)', padding: '1px 5px', borderRadius: 3 }}>book.yoursite.com</code>. Use a subdomain, not the root domain.</div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>2. Add a CNAME record at your DNS provider</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.6, marginBottom: 8 }}>Log in to the DNS manager for your domain (GoDaddy, Namecheap, Cloudflare, Google Domains, etc.) and add this record:</div>
                <div style={{ background: 'var(--cream)', border: '1px solid var(--cream-dark)', borderRadius: 6, padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: 'var(--ink)' }}>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}><span style={{ color: 'var(--ink-soft)', width: 60 }}>Type:</span><strong>CNAME</strong></div>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}><span style={{ color: 'var(--ink-soft)', width: 60 }}>Host:</span><strong>locations</strong> <span style={{ color: 'var(--ink-soft)', fontWeight: 400 }}>(or whatever subdomain you want)</span></div>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}><span style={{ color: 'var(--ink-soft)', width: 60 }}>Value:</span><strong>{cnameTarget}</strong></div>
                  <div style={{ display: 'flex', gap: 10 }}><span style={{ color: 'var(--ink-soft)', width: 60 }}>TTL:</span><strong>Auto</strong> <span style={{ color: 'var(--ink-soft)', fontWeight: 400 }}>(or 3600)</span></div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 6, fontStyle: 'italic', fontWeight: 300 }}>Some providers use "Points to" or "Target" instead of "Value". Same thing.</div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>3. Enter your domain above and click Save</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.6 }}>We'll check the CNAME and provision a free SSL certificate (Let's Encrypt) automatically. Usually finishes in under 2 minutes, sometimes up to a few hours if your DNS hasn't propagated yet.</div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>4. Your Location Guides switch automatically</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.6 }}>Once verified, all Location Guides (both expiring and permanent) will use your domain. Clients see <code style={{ background: 'var(--cream)', padding: '1px 5px', borderRadius: 3 }}>locations.yoursite.com/pick/…</code> instead of locateshoot.com.</div>
              </div>

              <div style={{ padding: '10px 12px', background: 'rgba(61,110,140,.06)', border: '1px solid rgba(61,110,140,.2)', borderRadius: 8, fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--sky)' }}>Heads up:</strong> Only <code style={{ background: 'white', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--cream-dark)' }}>/pick/…</code> pages serve from your custom domain. Your dashboard, profile, etc. stay on locateshoot.com.
              </div>

              <button onClick={() => setShowDomainHelp(false)} style={{ marginTop: '1.25rem', width: '100%', padding: '11px', borderRadius: 4, background: 'var(--ink)', color: 'var(--cream)', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Got it</button>
            </div>
          </div>
        </>
      )}

      {CUSTOM_SENDER_ENABLED && showSenderHelp && (
        <>
          <div onClick={() => setShowSenderHelp(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,.7)', backdropFilter: 'blur(4px)', zIndex: 900 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'white', borderRadius: 16, width: 600, maxWidth: '92vw', maxHeight: '92vh', overflowY: 'auto', zIndex: 1000, boxShadow: '0 24px 64px rgba(0,0,0,.3)' }}>
            <div style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem', gap: 12 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 3 }}>✉ Set up your custom sending email</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300 }}>About 5 minutes total — most of it is waiting on DNS.</div>
                </div>
                <button onClick={() => setShowSenderHelp(false)} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--cream-dark)', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>1. What this does</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.6 }}>
                  When a client picks a location, the confirmation email currently goes from <code style={{ background: 'var(--cream)', padding: '1px 5px', borderRadius: 3 }}>notifications@locateshoot.com</code> with your name as the reply-to. After this setup, the email goes from <strong>your address</strong> directly — no LocateShoot in the From line.
                </div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>2. What you need</div>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.7 }}>
                  <li>An email address at <strong>your own domain</strong> — e.g. <code style={{ background: 'var(--cream)', padding: '1px 5px', borderRadius: 3 }}>you@yourstudio.com</code>. Gmail / Yahoo / Outlook addresses won't work — you can't add SPF/DKIM records to a domain you don't own.</li>
                  <li>Access to your DNS provider (GoDaddy, Namecheap, Cloudflare, Squarespace, Google Domains, etc. — wherever you bought the domain or manage its DNS).</li>
                </ul>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>3. Enter your email and click Save</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.6 }}>
                  We register the domain part with our email provider (Resend) and they generate two DNS records you'll need: an <strong>SPF</strong> record (says we're allowed to send for your domain) and a <strong>DKIM</strong> record (signs each email so it isn't flagged as spoofed). They'll appear here on the page after you save.
                </div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>4. Add the DNS records</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.6, marginBottom: 8 }}>
                  After you click <strong>Save email</strong>, the exact DNS records you need (SPF + DKIM, sometimes DMARC) appear right on this page in a copyable list — close this help and you'll see them. Each record has a <strong>Type</strong>, <strong>Host</strong>, and <strong>Value</strong>. Copy each one into your DNS provider's dashboard exactly as shown.
                </div>
                <div style={{ background: 'var(--cream)', border: '1px solid var(--cream-dark)', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: 'var(--ink)', lineHeight: 1.7 }}>
                  <div style={{ marginBottom: 4 }}><strong>SPF</strong> — tells receivers Resend may send for your domain.</div>
                  <div style={{ marginBottom: 4 }}><strong>DKIM</strong> — public key used to verify our signature on each email.</div>
                  <div><strong>DMARC</strong> (optional) — tells receivers what to do with messages that fail SPF/DKIM. We recommend the default Resend provides.</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8, fontWeight: 300, lineHeight: 1.55 }}>
                  <strong>Tip on the Host field:</strong> some DNS providers append your domain automatically. If yours does, enter only the prefix like <code style={{ background: 'var(--cream)', padding: '1px 5px', borderRadius: 3 }}>resend._domainkey</code>, not the full <code style={{ background: 'var(--cream)', padding: '1px 5px', borderRadius: 3 }}>resend._domainkey.yoursite.com</code>. If your provider doesn't append, paste the full Host shown.
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 6, fontStyle: 'italic', fontWeight: 300 }}>
                  Already have an SPF record at your domain? Don't add a second — Resend's docs explain how to merge them.
                </div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>5. Click Refresh status</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.6 }}>
                  DNS usually propagates in 5–30 minutes. Once each record shows <strong style={{ color: 'var(--sage)' }}>✓ verified</strong>, the next client confirmation email will go from your address. Until then we keep using <code style={{ background: 'var(--cream)', padding: '1px 5px', borderRadius: 3 }}>notifications@locateshoot.com</code> as a fallback so nothing breaks.
                </div>
              </div>

              <div style={{ padding: '10px 12px', background: 'rgba(61,110,140,.06)', border: '1px solid rgba(61,110,140,.2)', borderRadius: 8, fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--sky)' }}>Stuck?</strong> Resend has provider-specific guides for the most common DNS hosts at <code style={{ background: 'white', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--cream-dark)' }}>resend.com/docs/dashboard/domains/introduction</code>. The exact steps are the same across providers, just labeled differently in their UI.
              </div>

              <button onClick={() => setShowSenderHelp(false)} style={{ marginTop: '1.25rem', width: '100%', padding: '11px', borderRadius: 4, background: 'var(--ink)', color: 'var(--cream)', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Got it</button>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', background: 'var(--ink)', color: 'var(--cream)', padding: '10px 18px', borderRadius: 10, fontSize: 13, border: '1px solid rgba(255,255,255,.1)', zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,.3)', animation: 'toast-in .25s ease' }}>
          {toast}
        </div>
      )}

      <style>{`
        .profile-mobile-nav { display: none; }
        .profile-topnav-mobile { display: none; }
        @media (max-width: 768px) {
          .profile-sidebar { display: none !important; }
          .profile-mobile-nav {
            display: block !important;
            background: white;
            border-bottom: 1px solid var(--cream-dark);
            padding: 1rem 1.25rem;
          }
          .profile-mobile-back { display: none !important; }
          .profile-topnav-mobile { display: block; }
        }
      `}</style>
    </div>
    </div>
  )
}