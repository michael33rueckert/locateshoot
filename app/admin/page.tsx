'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isAdminEmail } from '@/lib/admin'
import AppNav from '@/components/AppNav'

interface PendingLocation { id: string; name: string; city: string; state: string; description: string | null; access_type: string; tags: string[]; created_at: string; latitude: number | null; longitude: number | null }

interface AdminUser { id: string; email: string; full_name: string | null; plan: string | null; created_at: string; portfolio_count: number; share_link_count: number }

interface ManagedLocation {
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

interface AdminMetrics {
  users:        { total: number; by_plan: Record<string, number>; new_this_week: number }
  locations:    { total: number; by_status: Record<string, number> }
  share_links:  { total: number; permanent: number; new_this_week: number }
  client_picks: { total: number }
  portfolio:    { total_rows: number; active_users: number }
}

interface ScanResult {
  success: boolean; inserted: number; errors: number; scans: number
  locations: string[]; errorList: string[]
}

const ALL_CATEGORIES = [
  { name: 'Parks & Nature',                icon: '🌳' },
  { name: 'Urban & Architecture',          icon: '🏙' },
  { name: 'Historic & Cultural',           icon: '🏛' },
  { name: 'Waterfront & Water Features',   icon: '💧' },
  { name: 'Fields, Meadows & Open Spaces', icon: '🌾' },
  { name: 'Private Venues & Hidden Gems',  icon: '✨' },
  { name: 'Golden Hour & Sunrise Spots',   icon: '🌅' },
  { name: 'Neighborhoods & Street Life',   icon: '🏘' },
]

const POPULAR_CITIES = [
  'New York, New York', 'Los Angeles, California', 'Chicago, Illinois',
  'Houston, Texas', 'Phoenix, Arizona', 'Philadelphia, Pennsylvania',
  'San Antonio, Texas', 'San Diego, California', 'Dallas, Texas',
  'Austin, Texas', 'Nashville, Tennessee', 'Denver, Colorado',
  'Seattle, Washington', 'Portland, Oregon', 'Atlanta, Georgia',
  'Miami, Florida', 'Tampa, Florida', 'Charlotte, North Carolina',
  'Raleigh, North Carolina', 'Minneapolis, Minnesota', 'St. Louis, Missouri',
  'Louisville, Kentucky', 'Indianapolis, Indiana', 'Columbus, Ohio',
  'Cleveland, Ohio', 'Pittsburgh, Pennsylvania', 'Detroit, Michigan',
  'Milwaukee, Wisconsin', 'Oklahoma City, Oklahoma', 'Tulsa, Oklahoma',
  'Albuquerque, New Mexico', 'Tucson, Arizona', 'Las Vegas, Nevada',
  'Salt Lake City, Utah', 'Boise, Idaho', 'Sacramento, California',
  'San Francisco, California', 'San Jose, California', 'New Orleans, Louisiana',
  'Memphis, Tennessee', 'Richmond, Virginia', 'Virginia Beach, Virginia',
  'Baltimore, Maryland', 'Washington, DC', 'Boston, Massachusetts',
  'Providence, Rhode Island', 'Hartford, Connecticut', 'Buffalo, New York',
  'Kansas City, Missouri', 'Kansas City, Kansas', 'Overland Park, Kansas',
  'Parkville, Missouri', "Lee's Summit, Missouri", 'Independence, Missouri',
]

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000), hours = Math.floor(diff / 3600000), days = Math.floor(diff / 86400000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

export default function AdminPage() {
  const router = useRouter()
  const [ready,    setReady]    = useState(false)
  const [userId,   setUserId]   = useState<string | null>(null)
  const [toast,    setToast]    = useState<string | null>(null)

  const [metrics,     setMetrics]     = useState<AdminMetrics | null>(null)
  const [users,       setUsers]       = useState<AdminUser[]>([])
  const [pendingLocs, setPendingLocs] = useState<PendingLocation[]>([])
  const [locationCount, setLocationCount] = useState<number>(0)

  const [allLocs,        setAllLocs]        = useState<ManagedLocation[]>([])
  const [locSearch,      setLocSearch]      = useState('')
  const [locStatus,      setLocStatus]      = useState<'all'|'published'|'pending'>('all')
  const [locsLoading,    setLocsLoading]    = useState(false)
  const [editingLoc,     setEditingLoc]     = useState<ManagedLocation | null>(null)
  const [deletingLocId,  setDeletingLocId]  = useState<string | null>(null)

  const [scanRunning,     setScanRunning]     = useState(false)
  const [scanResult,      setScanResult]      = useState<ScanResult | null>(null)
  const [scanProgress,    setScanProgress]    = useState<{ done: number; total: number; current: string } | null>(null)
  const [scanCities,      setScanCities]      = useState<string[]>([])
  const [scanCategories,  setScanCategories]  = useState<string[]>(ALL_CATEGORIES.map(c => c.name))
  const [customCityInput, setCustomCityInput] = useState('')
  const [citySearchQuery, setCitySearchQuery] = useState('')
  const [showPopular,     setShowPopular]     = useState(false)

  const loadAll = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) { router.push('/'); return }
    if (!isAdminEmail(session.user.email)) { router.push('/dashboard'); return }
    setUserId(session.user.id)

    const headers = { Authorization: `Bearer ${session.access_token}` }
    const [metricsRes, usersRes, pendingRes, locCountRes] = await Promise.all([
      fetch('/api/admin/metrics', { headers }).then(r => r.ok ? r.json() : null),
      fetch('/api/admin/users',   { headers }).then(r => r.ok ? r.json() : null),
      supabase.from('locations').select('id,name,city,state,description,access_type,tags,created_at,latitude,longitude').eq('status','pending').eq('source','community').order('created_at',{ascending:false}),
      supabase.from('locations').select('id', { count: 'exact', head: true }),
    ])
    if (metricsRes)             setMetrics(metricsRes)
    if (usersRes?.users)        setUsers(usersRes.users)
    if (pendingRes.data)        setPendingLocs(pendingRes.data)
    if (locCountRes.count !== null && locCountRes.count !== undefined) setLocationCount(locCountRes.count)
    setReady(true)
  }, [router])

  useEffect(() => { loadAll() }, [loadAll])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const estLocations = scanCities.length * scanCategories.length * 20
  const estMinutes   = Math.ceil(scanCities.length * scanCategories.length * 0.7)
  const filteredPopular = POPULAR_CITIES.filter(c => citySearchQuery === '' || c.toLowerCase().includes(citySearchQuery.toLowerCase()))

  async function runScanner() {
    if (!userId || scanCities.length === 0 || scanCategories.length === 0) return
    setScanRunning(true); setScanResult(null)
    // Break the scan into one (city × category) call at a time — keeps each
    // request under Vercel Hobby's 60s cap and lets us show progress.
    const pairs: { city: string; category: string }[] = []
    for (const city of scanCities) for (const category of scanCategories) pairs.push({ city, category })
    setScanProgress({ done: 0, total: pairs.length, current: '' })

    const merged: ScanResult = { success: true, inserted: 0, errors: 0, scans: 0, locations: [], errorList: [] }
    let failedCount = 0
    for (let i = 0; i < pairs.length; i++) {
      const { city, category } = pairs[i]
      setScanProgress({ done: i, total: pairs.length, current: `${category} in ${city.split(',')[0]}` })
      try {
        const res = await fetch('/api/scan-locations', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cities: [city], categories: [category], userId }),
        })
        if (!res.ok) {
          failedCount++
          merged.errorList.push(`${category} / ${city.split(',')[0]} — HTTP ${res.status}`)
          continue
        }
        const data: ScanResult = await res.json()
        merged.inserted  += data.inserted ?? 0
        merged.errors    += data.errors   ?? 0
        merged.scans     += data.scans    ?? 0
        merged.locations.push(...(data.locations ?? []))
        merged.errorList.push(...(data.errorList ?? []))
      } catch (e: any) {
        failedCount++
        merged.errorList.push(`${category} / ${city.split(',')[0]} — ${e?.message ?? 'request failed'}`)
      }
      setScanResult({ ...merged })
    }
    setScanProgress(null)
    setScanRunning(false)
    if (merged.inserted > 0) { setLocationCount(prev => prev + merged.inserted); setToast(`✓ Added ${merged.inserted} locations${failedCount > 0 ? ` · ${failedCount} chunk(s) failed` : ''}`) }
    else if (failedCount > 0) setToast(`⚠ Scan had ${failedCount} failed chunk(s) — see results below`)
    else setToast('Scan complete — no new locations')
  }

  async function setUserPlan(userId: string, plan: 'pro' | 'free') {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch('/api/admin/users/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ userId, plan }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setToast(`⚠ ${data.message ?? data.error ?? 'Could not update'}`); return }
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, plan } : u))
    setToast(plan === 'pro' ? '✓ Granted Pro access' : 'Reverted to Free')
  }

  async function approveLocation(id: string) {
    const { error } = await supabase.from('locations').update({ status: 'published' }).eq('id', id)
    if (!error) { setPendingLocs(prev => prev.filter(l => l.id !== id)); setLocationCount(p => p + 1); setToast('✓ Approved & published') }
  }
  async function rejectLocation(id: string) {
    const { error } = await supabase.from('locations').delete().eq('id', id)
    if (!error) { setPendingLocs(prev => prev.filter(l => l.id !== id)); setToast('Rejected & deleted') }
  }

  const loadAllLocations = useCallback(async () => {
    setLocsLoading(true)
    const { data } = await supabase.from('locations')
      .select('id,name,description,city,state,latitude,longitude,category,access_type,tags,permit_required,permit_fee,permit_notes,permit_website,permit_certainty,best_time,parking_info,status,rating,quality_score,source,created_at')
      .order('created_at', { ascending: false })
      .limit(1000)
    setAllLocs((data ?? []) as ManagedLocation[])
    setLocsLoading(false)
  }, [])

  useEffect(() => { if (ready) loadAllLocations() }, [ready, loadAllLocations])

  const filteredAllLocs = allLocs.filter(l => {
    if (locStatus !== 'all' && l.status !== locStatus) return false
    const q = locSearch.trim().toLowerCase()
    if (!q) return true
    return (l.name?.toLowerCase().includes(q) ?? false)
      || (l.city?.toLowerCase().includes(q) ?? false)
      || (l.state?.toLowerCase().includes(q) ?? false)
  })

  async function saveEditingLoc(updates: Partial<ManagedLocation>) {
    if (!editingLoc) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(`/api/admin/locations/${editingLoc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(updates),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setToast(`⚠ ${j.error ?? 'Update failed'}`); return }
    setAllLocs(prev => prev.map(l => l.id === editingLoc.id ? { ...l, ...(j.location as ManagedLocation) } : l))
    setEditingLoc(null)
    setToast('✓ Saved')
  }

  async function deleteLocation(id: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(`/api/admin/locations/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setToast(`⚠ ${j.error ?? 'Delete failed'}`); return }
    setAllLocs(prev => prev.filter(l => l.id !== id))
    setLocationCount(prev => Math.max(0, prev - 1))
    setDeletingLocId(null)
    setToast('Deleted')
  }

  function addCustomCity() {
    const city = customCityInput.trim(); if (!city) return
    const formatted = city.replace(/\b\w/g, c => c.toUpperCase())
    if (!scanCities.includes(formatted)) setScanCities(p => [...p, formatted])
    setCustomCityInput('')
  }
  function removeCity(c: string) { setScanCities(p => p.filter(x => x !== c)) }
  function togglePopularCity(c: string) { setScanCities(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c]) }
  function toggleCategory(n: string) { setScanCategories(p => p.includes(n) ? p.filter(x => x !== n) : [...p, n]) }

  if (!ready) {
    return (
      <div style={{ minHeight: '100svh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid rgba(0,0,0,.1)', borderTop: '2px solid var(--gold)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 5 }
  const thStyle: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--ink-soft)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid var(--cream-dark)', background: 'var(--cream)' }

  return (
    <div style={{ minHeight: '100svh', background: 'var(--cream)' }}>
      <AppNav />
      <div style={{ background: 'var(--cream-dark)', padding: '10px 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Admin</div>
        <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Admin-only tools & metrics</div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem 1rem 4rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* METRICS */}
        <div style={{ background: 'white', borderRadius: 10, border: '1px solid var(--cream-dark)', padding: '1rem 1.25rem' }}>
          <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>📊 Metrics</div>
          {!metrics ? (
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic' }}>Loading…</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
              <MetricCard label="Total users" value={metrics.users.total} sub={`+${metrics.users.new_this_week} this week`} />
              <MetricCard label="Paid plans" value={Object.entries(metrics.users.by_plan).filter(([p]) => p !== 'free').reduce((s,[,v]) => s+v, 0)} sub={`${metrics.users.by_plan['free'] ?? 0} free`} />
              <MetricCard label="Share links" value={metrics.share_links.total} sub={`+${metrics.share_links.new_this_week} this week`} />
              <MetricCard label="Location guides" value={metrics.share_links.permanent} sub="reusable share links" />
              <MetricCard label="Client picks" value={metrics.client_picks.total} sub="lifetime" />
              <MetricCard label="Map locations" value={metrics.locations.total} sub={`${metrics.locations.by_status['pending'] ?? 0} pending`} />
              <MetricCard label="Portfolio rows" value={metrics.portfolio.total_rows} sub={`${metrics.portfolio.active_users} active users`} />
            </div>
          )}
          {metrics && Object.keys(metrics.users.by_plan).length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--cream-dark)', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(metrics.users.by_plan).map(([plan, count]) => (
                <span key={plan} style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: plan === 'pro' ? 'rgba(196,146,42,.1)' : 'var(--cream-dark)', color: plan === 'pro' ? 'var(--gold)' : 'var(--ink-soft)', border: `1px solid ${plan === 'pro' ? 'rgba(196,146,42,.2)' : 'var(--sand)'}` }}>
                  {plan}: {count}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* USERS */}
        <div style={{ background: 'white', borderRadius: 10, border: '1px solid var(--cream-dark)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--cream-dark)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>👥 Users</div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{users.length} shown</div>
          </div>
          {users.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic' }}>No users yet</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--cream)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--ink-soft)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid var(--cream-dark)' }}>Email</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--ink-soft)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid var(--cream-dark)' }}>Name</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--ink-soft)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid var(--cream-dark)' }}>Plan</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500, color: 'var(--ink-soft)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid var(--cream-dark)' }}>Portfolio</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500, color: 'var(--ink-soft)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid var(--cream-dark)' }}>Shares</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500, color: 'var(--ink-soft)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid var(--cream-dark)' }}>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--cream-dark)' }}>
                      <td style={{ padding: '9px 12px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{u.email}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--ink-soft)' }}>{u.full_name ?? '—'}</td>
                      <td style={{ padding: '9px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: u.plan === 'pro' ? 'rgba(196,146,42,.1)' : 'var(--cream-dark)', color: u.plan === 'pro' ? 'var(--gold)' : 'var(--ink-soft)' }}>{u.plan ?? 'free'}</span>
                          {u.plan === 'pro'
                            ? <button onClick={() => { if (confirm(`Revert ${u.email} to Free? They'll lose Pro features.`)) setUserPlan(u.id, 'free') }} style={{ padding: '2px 7px', borderRadius: 4, background: 'transparent', border: '1px solid rgba(181,75,42,.25)', fontSize: 10, color: 'var(--rust)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Revert</button>
                            : <button onClick={() => setUserPlan(u.id, 'pro')} style={{ padding: '2px 7px', borderRadius: 4, background: 'var(--ink)', border: 'none', fontSize: 10, fontWeight: 500, color: 'var(--cream)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>⭐ Grant Pro</button>}
                        </div>
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{u.portfolio_count}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{u.share_link_count}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--ink-soft)', fontSize: 11, whiteSpace: 'nowrap' }}>{timeAgo(u.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* PENDING SUBMISSIONS */}
        {pendingLocs.length > 0 && (
          <div style={{ background: 'white', borderRadius: 10, border: '1px solid var(--cream-dark)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--cream-dark)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>📬 Pending Submissions</div>
              <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(181,75,42,.1)', color: 'var(--rust)', border: '1px solid rgba(181,75,42,.2)' }}>{pendingLocs.length}</span>
            </div>
            {pendingLocs.map((loc, i) => (
              <div key={loc.id} style={{ padding: '1rem 1.25rem', borderBottom: i < pendingLocs.length - 1 ? '1px solid var(--cream-dark)' : 'none' }}>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 4 }}>{loc.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span>📍 {loc.city}{loc.state ? `, ${loc.state}` : ''}</span>
                    <span style={{ padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: loc.access_type === 'public' ? 'rgba(74,103,65,.1)' : 'rgba(181,75,42,.1)', color: loc.access_type === 'public' ? 'var(--sage)' : 'var(--rust)', border: `1px solid ${loc.access_type === 'public' ? 'rgba(74,103,65,.2)' : 'rgba(181,75,42,.2)'}` }}>{loc.access_type === 'public' ? '● Public' : '🔒 Private'}</span>
                    <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{timeAgo(loc.created_at)}</span>
                  </div>
                  {loc.description && <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.5, marginBottom: 6 }}>{loc.description}</div>}
                  {loc.tags?.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>{loc.tags.map(t => <span key={t} style={{ padding: '2px 7px', borderRadius: 20, fontSize: 10, background: 'var(--cream-dark)', color: 'var(--ink-soft)', border: '1px solid var(--sand)' }}>{t}</span>)}</div>}
                  <div style={{ fontSize: 11, color: loc.latitude && loc.longitude ? 'var(--sage)' : 'var(--rust)', fontWeight: 300 }}>
                    {loc.latitude && loc.longitude ? `📌 Coords: ${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}` : '⚠ No coordinates'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => approveLocation(loc.id)} style={{ flex: 1, padding: '9px', borderRadius: 4, background: 'rgba(74,103,65,.1)', color: 'var(--sage)', border: '1px solid rgba(74,103,65,.25)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>✓ Approve & publish</button>
                  <button onClick={() => rejectLocation(loc.id)} style={{ padding: '9px 18px', borderRadius: 4, background: 'rgba(181,75,42,.08)', color: 'var(--rust)', border: '1px solid rgba(181,75,42,.2)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>✕ Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ALL LOCATIONS */}
        <div style={{ background: 'white', borderRadius: 10, border: '1px solid var(--cream-dark)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--cream-dark)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
              📍 Locations
              <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: 'var(--cream-dark)', color: 'var(--ink-soft)' }}>{filteredAllLocs.length} / {allLocs.length}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Edit or delete any location. Deleting also clears its photos & detaches portfolio references.</div>
          </div>

          <div style={{ padding: '0.75rem 1.25rem', display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid var(--cream-dark)', flexWrap: 'wrap' }}>
            <input value={locSearch} onChange={e => setLocSearch(e.target.value)} placeholder="Search name / city / state…" style={{ flex: 1, minWidth: 200, padding: '8px 12px', border: '1px solid var(--cream-dark)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, outline: 'none' }} />
            {(['all','published','pending'] as const).map(s => (
              <button key={s} onClick={() => setLocStatus(s)} style={{ padding: '6px 12px', borderRadius: 4, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', border: `1px solid ${locStatus === s ? 'var(--gold)' : 'var(--cream-dark)'}`, background: locStatus === s ? 'rgba(196,146,42,.1)' : 'white', color: locStatus === s ? 'var(--gold)' : 'var(--ink-soft)', fontWeight: locStatus === s ? 500 : 400, textTransform: 'capitalize' }}>{s}</button>
            ))}
            <button onClick={loadAllLocations} disabled={locsLoading} style={{ padding: '6px 12px', borderRadius: 4, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', border: '1px solid var(--cream-dark)', background: 'white', color: 'var(--ink-soft)' }}>{locsLoading ? '…' : '↻'}</button>
          </div>

          {locsLoading && allLocs.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic' }}>Loading locations…</div>
          ) : filteredAllLocs.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic' }}>No matches</div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: 600, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ position: 'sticky', top: 0 }}>
                  <tr style={{ background: 'var(--cream)' }}>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Location</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Access</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Rating</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Saves</th>
                    <th style={thStyle}>Source</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAllLocs.map(l => (
                    <tr key={l.id} style={{ borderBottom: '1px solid var(--cream-dark)' }}>
                      <td style={{ padding: '9px 12px', color: 'var(--ink)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.name}>{l.name}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{[l.city, l.state].filter(Boolean).join(', ') || '—'}</td>
                      <td style={{ padding: '9px 12px' }}>
                        <span style={{ padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: l.status === 'published' ? 'rgba(74,103,65,.1)' : 'rgba(181,75,42,.1)', color: l.status === 'published' ? 'var(--sage)' : 'var(--rust)' }}>{l.status}</span>
                      </td>
                      <td style={{ padding: '9px 12px', color: 'var(--ink-soft)', fontSize: 11 }}>{l.access_type ?? '—'}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{l.rating != null ? `★ ${l.rating}` : '—'}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{(l as any).save_count ?? 0}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--ink-soft)', fontSize: 11 }}>{l.source ?? '—'}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => setEditingLoc(l)} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--cream-dark)', background: 'white', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)', marginRight: 6 }}>Edit</button>
                        {deletingLocId === l.id ? (
                          <>
                            <button onClick={() => deleteLocation(l.id)} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--rust)', background: 'var(--rust)', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', color: 'white', marginRight: 4 }}>Confirm</button>
                            <button onClick={() => setDeletingLocId(null)} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--cream-dark)', background: 'white', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink-soft)' }}>Cancel</button>
                          </>
                        ) : (
                          <button onClick={() => setDeletingLocId(l.id)} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid rgba(181,75,42,.25)', background: 'rgba(181,75,42,.05)', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--rust)' }}>Delete</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* AI SCANNER */}
        <div style={{ background: 'var(--ink)', borderRadius: 10, border: '1px solid rgba(255,255,255,.08)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--cream)', display: 'flex', alignItems: 'center', gap: 8 }}>
              🤖 AI Location Scanner
              <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, background: 'rgba(196,146,42,.2)', color: 'var(--gold)', border: '1px solid rgba(196,146,42,.3)' }}>{locationCount.toLocaleString()} in DB</span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(245,240,232,.4)', fontWeight: 300 }}>Multi-pass scan by category — finds locations in any US city.</div>
          </div>

          <div style={{ padding: '1.25rem' }}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ ...labelStyle, color: 'rgba(245,240,232,.5)' }}>Add a city to scan</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="text" value={customCityInput} onChange={e => setCustomCityInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addCustomCity() }} placeholder="e.g. Springfield, Missouri" style={{ flex: 1, padding: '9px 12px', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 4, color: 'var(--cream)', fontFamily: 'inherit', fontSize: 13, outline: 'none' }} />
                <button onClick={addCustomCity} disabled={!customCityInput.trim()} style={{ padding: '9px 16px', borderRadius: 4, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: !customCityInput.trim() ? 0.5 : 1 }}>+ Add</button>
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ ...labelStyle, color: 'rgba(245,240,232,.5)', marginBottom: 0 }}>Popular US cities</label>
                <button onClick={() => setShowPopular(p => !p)} style={{ fontSize: 11, color: 'rgba(245,240,232,.4)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>{showPopular ? 'Hide ▲' : 'Show ▼'}</button>
              </div>
              {showPopular && (
                <>
                  <input type="text" value={citySearchQuery} onChange={e => setCitySearchQuery(e.target.value)} placeholder="Filter cities…" style={{ width: '100%', padding: '7px 12px', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 4, color: 'var(--cream)', fontFamily: 'inherit', fontSize: 12, outline: 'none', marginBottom: 8 }} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 160, overflowY: 'auto' }}>
                    {filteredPopular.map(c => (
                      <button key={c} onClick={() => togglePopularCity(c)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${scanCities.includes(c) ? 'var(--gold)' : 'rgba(255,255,255,.15)'}`, background: scanCities.includes(c) ? 'rgba(196,146,42,.2)' : 'transparent', color: scanCities.includes(c) ? 'var(--gold)' : 'rgba(245,240,232,.5)' }}>
                        {scanCities.includes(c) ? '✓ ' : ''}{c.split(',')[0]}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ ...labelStyle, color: 'rgba(245,240,232,.5)', marginBottom: 0 }}>Queued ({scanCities.length})</label>
                {scanCities.length > 0 && <button onClick={() => setScanCities([])} style={{ fontSize: 11, color: 'rgba(181,75,42,.7)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Clear</button>}
              </div>
              {scanCities.length === 0 ? (
                <div style={{ fontSize: 12, color: 'rgba(245,240,232,.2)', fontStyle: 'italic' }}>No cities added yet</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {scanCities.map(c => (
                    <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px 3px 10px', borderRadius: 20, background: 'rgba(196,146,42,.15)', border: '1px solid rgba(196,146,42,.25)' }}>
                      <span style={{ fontSize: 11, color: 'var(--gold)' }}>{c}</span>
                      <button onClick={() => removeCity(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(196,146,42,.5)', fontSize: 13, padding: '0 2px' }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ ...labelStyle, color: 'rgba(245,240,232,.5)', marginBottom: 0 }}>Categories ({scanCategories.length}/{ALL_CATEGORIES.length})</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setScanCategories(ALL_CATEGORIES.map(c => c.name))} style={{ fontSize: 11, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>All</button>
                  <span style={{ color: 'rgba(255,255,255,.15)' }}>·</span>
                  <button onClick={() => setScanCategories([])} style={{ fontSize: 11, color: 'rgba(245,240,232,.3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>None</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {ALL_CATEGORIES.map(cat => {
                  const sel = scanCategories.includes(cat.name)
                  return (
                    <div key={cat.name} onClick={() => toggleCategory(cat.name)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6, cursor: 'pointer', background: sel ? 'rgba(196,146,42,.1)' : 'rgba(255,255,255,.04)', border: `1px solid ${sel ? 'rgba(196,146,42,.3)' : 'rgba(255,255,255,.08)'}` }}>
                      <div style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${sel ? 'var(--gold)' : 'rgba(255,255,255,.2)'}`, background: sel ? 'var(--gold)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--ink)' }}>{sel ? '✓' : ''}</div>
                      <span style={{ fontSize: 14 }}>{cat.icon}</span>
                      <span style={{ fontSize: 12, color: sel ? 'var(--gold)' : 'rgba(245,240,232,.5)', fontWeight: sel ? 500 : 300 }}>{cat.name}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {scanCities.length > 0 && scanCategories.length > 0 && (
              <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 8, marginBottom: '1.25rem', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, textAlign: 'center' }}>
                <div><div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--gold)' }}>{scanCities.length}</div><div style={{ fontSize: 10, color: 'rgba(245,240,232,.3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>cities</div></div>
                <div><div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: 'var(--gold)' }}>~{estLocations.toLocaleString()}</div><div style={{ fontSize: 10, color: 'rgba(245,240,232,.3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>est.</div></div>
                <div><div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 22, fontWeight: 700, color: estMinutes > 10 ? 'var(--rust)' : 'var(--sage)' }}>~{estMinutes}m</div><div style={{ fontSize: 10, color: 'rgba(245,240,232,.3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>time</div></div>
              </div>
            )}

            <button onClick={runScanner} disabled={scanRunning || scanCities.length === 0 || scanCategories.length === 0} style={{ width: '100%', padding: '13px', borderRadius: 4, background: scanRunning ? 'rgba(196,146,42,.3)' : 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 14, fontWeight: 500, cursor: scanRunning || scanCities.length === 0 || scanCategories.length === 0 ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: scanCities.length === 0 || scanCategories.length === 0 ? 0.4 : 1 }}>
              {scanRunning ? (<><div style={{ width: 16, height: 16, border: '2px solid rgba(26,22,18,.3)', borderTop: '2px solid var(--ink)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />{scanProgress ? `Scanning ${scanProgress.done + 1} / ${scanProgress.total}…` : 'Scanning…'}</>) :
                scanCities.length === 0 ? '← Add a city' :
                scanCategories.length === 0 ? '← Select a category' :
                `🤖 Run — ${scanCities.length} × ${scanCategories.length}`}
            </button>
            {scanRunning && scanProgress && (
              <div style={{ marginTop: 10 }}>
                <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.08)', overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{ height: '100%', width: `${Math.round((scanProgress.done / Math.max(1, scanProgress.total)) * 100)}%`, background: 'var(--gold)', transition: 'width .3s ease' }} />
                </div>
                <div style={{ fontSize: 11, color: 'rgba(245,240,232,.4)' }}>Now: {scanProgress.current}</div>
              </div>
            )}

            {scanResult && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,.05)', borderRadius: 8, border: '1px solid rgba(255,255,255,.1)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cream)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  ✓ Scan complete
                  <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, background: 'rgba(74,103,65,.3)', color: '#c8e8c4', fontWeight: 500 }}>{scanResult.inserted} added</span>
                  {scanResult.errors > 0 && <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, background: 'rgba(255,255,255,.05)', color: 'rgba(245,240,232,.35)' }}>{scanResult.errors} skipped</span>}
                  <span style={{ fontSize: 11, color: 'rgba(245,240,232,.3)' }}>({scanResult.scans} scans run)</span>
                </div>
                {scanResult.locations.length > 0 && (
                  <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: scanResult.errorList.length > 0 ? 8 : 0 }}>
                    {scanResult.locations.map((loc, i) => <div key={i} style={{ fontSize: 11, color: 'rgba(245,240,232,.5)', padding: '2px 0', display: 'flex', alignItems: 'flex-start', gap: 6 }}><span style={{ color: 'var(--sage)', fontSize: 10, marginTop: 2 }}>✓</span><span>{loc}</span></div>)}
                  </div>
                )}
                {scanResult.errorList.length > 0 && (
                  <details>
                    <summary style={{ fontSize: 11, color: 'rgba(245,240,232,.5)', cursor: 'pointer', padding: '6px 0', fontWeight: 500 }}>
                      Show skipped ({scanResult.errorList.length}) — tap to expand
                    </summary>
                    <div style={{ marginTop: 6, maxHeight: 220, overflowY: 'auto', background: 'rgba(0,0,0,.15)', borderRadius: 6, padding: '8px 10px' }}>
                      {scanResult.errorList.map((e, i) => <div key={i} style={{ fontSize: 10, color: 'rgba(245,240,232,.5)', padding: '3px 0', borderBottom: i < scanResult.errorList.length - 1 ? '1px solid rgba(255,255,255,.04)' : 'none', lineHeight: 1.5, wordBreak: 'break-word' }}>• {e}</div>)}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

      {editingLoc && (
        <LocationEditModal loc={editingLoc} onClose={() => setEditingLoc(null)} onSave={saveEditingLoc} />
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', background: 'var(--ink)', color: 'var(--cream)', padding: '10px 18px', borderRadius: 10, fontSize: 13, border: '1px solid rgba(255,255,255,.1)', zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,.3)' }}>
          {toast}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function LocationEditModal({ loc, onClose, onSave }: {
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
            <select style={inp} value={f.permit_certainty ?? ''} onChange={e => upd('permit_certainty', e.target.value || null)}>
              <option value="">—</option>
              <option value="unknown">unknown</option>
              <option value="likely">likely</option>
              <option value="confirmed">confirmed</option>
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

function MetricCard({ label, value, sub }: { label: string; value: number | string; sub: string }) {
  return (
    <div style={{ padding: '12px 14px', background: 'var(--cream)', borderRadius: 8, border: '1px solid var(--cream-dark)' }}>
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-soft)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 24, fontWeight: 700, color: 'var(--ink)', lineHeight: 1, marginBottom: 3 }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
      <div style={{ fontSize: 11, color: 'var(--sage)' }}>{sub}</div>
    </div>
  )
}
