'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isAdminEmail } from '@/lib/admin'
import AppNav from '@/components/AppNav'
import LocationEditModal from '@/components/admin/LocationEditModal'

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

// Audit results returned by /api/admin/audit-locations.
interface AuditLocation {
  id: string; name: string
  city: string | null; state: string | null
  latitude: number | null; longitude: number | null
  description: string | null; category: string | null
}
interface DuplicateFlag {
  type: 'duplicate'; reason: string
  primary: AuditLocation; duplicate: AuditLocation
  distanceMiles: number
}
interface IncorrectFlag {
  type: 'incorrect'; reason: string; location: AuditLocation
}
interface AuditBatchResult {
  batchIndex: number; totalBatches: number
  totalLocations: number; batchSize: number
  duplicates: DuplicateFlag[]; incorrect: IncorrectFlag[]
}

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
  const [userSearch,  setUserSearch]  = useState('')
  const [pendingLocs, setPendingLocs] = useState<PendingLocation[]>([])
  const [locationCount, setLocationCount] = useState<number>(0)

  const [allLocs,        setAllLocs]        = useState<ManagedLocation[]>([])
  const [locSearch,      setLocSearch]      = useState('')
  const [locStatus,      setLocStatus]      = useState<'all'|'published'|'pending'>('all')
  const [locsLoading,    setLocsLoading]    = useState(false)
  const [editingLoc,     setEditingLoc]     = useState<ManagedLocation | null>(null)
  const [deletingLocId,  setDeletingLocId]  = useState<string | null>(null)
  // 10 rows per page on the Locations + Users tables — anything
  // past that turns the panel into a scrolling wall.
  const [locsPage,       setLocsPage]       = useState(1)
  const [usersPage,      setUsersPage]      = useState(1)
  const ADMIN_PAGE_SIZE = 10

  // ── Quality audit state ──
  // The audit runs in 50-row AI batches so each backend call stays
  // under Vercel's 60s function timeout. Duplicate detection is local
  // and arrives once on batch 0; AI flags accumulate batch-by-batch.
  const [auditRunning,     setAuditRunning]     = useState(false)
  const [auditDone,        setAuditDone]        = useState(false)
  const [auditProgress,    setAuditProgress]    = useState<{ done: number; total: number } | null>(null)
  const [auditDuplicates,  setAuditDuplicates]  = useState<DuplicateFlag[]>([])
  const [auditIncorrect,   setAuditIncorrect]   = useState<IncorrectFlag[]>([])
  const [auditDismissed,   setAuditDismissed]   = useState<Set<string>>(new Set())

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

  async function runAudit() {
    if (!userId || auditRunning) return
    setAuditRunning(true)
    setAuditDone(false)
    setAuditDuplicates([])
    setAuditIncorrect([])
    setAuditDismissed(new Set())
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setAuditRunning(false); return }
    let batchIndex = 0
    let totalBatches = 1
    let failedCount = 0
    setAuditProgress({ done: 0, total: 1 })
    while (batchIndex < totalBatches) {
      try {
        const res = await fetch(`/api/admin/audit-locations?batch=${batchIndex}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          failedCount++
          break
        }
        const data: AuditBatchResult = await res.json()
        totalBatches = Math.max(1, data.totalBatches)
        if (batchIndex === 0 && data.duplicates.length > 0) setAuditDuplicates(data.duplicates)
        if (data.incorrect.length > 0) setAuditIncorrect(prev => [...prev, ...data.incorrect])
        batchIndex++
        setAuditProgress({ done: batchIndex, total: totalBatches })
      } catch {
        failedCount++
        break
      }
    }
    setAuditProgress(null)
    setAuditRunning(false)
    setAuditDone(true)
    if (failedCount > 0) setToast('⚠ Audit hit an error — partial results shown')
    else setToast('✓ Audit complete')
  }

  function dismissAuditFlag(key: string) {
    setAuditDismissed(prev => {
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }

  async function setUserPlan(userId: string, plan: 'pro' | 'starter' | 'free') {
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
    const label = plan === 'pro' ? '✓ Set to Pro' : plan === 'starter' ? '✓ Set to Starter' : '✓ Set to Free'
    setToast(label)
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
              <MetricCard label="Location Guides" value={metrics.share_links.total} sub={`+${metrics.share_links.new_this_week} this week`} />
              <MetricCard label="Saved guides" value={metrics.share_links.permanent} sub="reusable Location Guides" />
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
        {(() => {
          const q = userSearch.trim().toLowerCase()
          const filteredUsers = q === '' ? users : users.filter(u =>
            (u.email ?? '').toLowerCase().includes(q) ||
            (u.full_name ?? '').toLowerCase().includes(q),
          )
          return (
        <div style={{ background: 'white', borderRadius: 10, border: '1px solid var(--cream-dark)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--cream-dark)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>👥 Users</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 280px', maxWidth: 480 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type="text"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Search name or email"
                  style={{ width: '100%', padding: '7px 30px 7px 12px', border: '1px solid var(--cream-dark)', borderRadius: 6, fontFamily: 'inherit', fontSize: 13, outline: 'none', color: 'var(--ink)', background: 'white' }}
                />
                {userSearch
                  ? <button onClick={() => setUserSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1, padding: 0 }}>✕</button>
                  : <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--ink-soft)', pointerEvents: 'none' }}>🔍</span>}
              </div>
              <span style={{ fontSize: 12, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
                {q === '' ? `${users.length} shown` : `${filteredUsers.length} of ${users.length}`}
              </span>
            </div>
          </div>
          {filteredUsers.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
              {q === '' ? 'No users yet' : `No users match "${userSearch}"`}
            </div>
          ) : (() => {
            const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / ADMIN_PAGE_SIZE))
            const activeUserPage = Math.min(usersPage, totalUserPages)
            const userStart = (activeUserPage - 1) * ADMIN_PAGE_SIZE
            const visibleUsers = filteredUsers.slice(userStart, userStart + ADMIN_PAGE_SIZE)
            return (
            <>
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
                  {visibleUsers.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--cream-dark)' }}>
                      <td style={{ padding: '9px 12px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{u.email}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--ink-soft)' }}>{u.full_name ?? '—'}</td>
                      <td style={{ padding: '9px 12px' }}>
                        {/* Plan picker — segmented control of all three
                            tiers. The active tier is filled (gold for
                            Pro, soft gold for Starter, dark ink for
                            Free) so it's obvious at a glance which one
                            is set. Inactive tiers are white-bg / muted.
                            Clicking an inactive one switches; confirms
                            on downgrades (target rank < current rank). */}
                        {(() => {
                          const current = (u.plan ?? 'free') as 'free' | 'starter' | 'pro'
                          const tiers: ('free' | 'starter' | 'pro')[] = ['free', 'starter', 'pro']
                          const labels: Record<string, string> = { free: 'Free', starter: '✦ Starter', pro: '⭐ Pro' }
                          function switchTo(target: 'free' | 'starter' | 'pro') {
                            if (target === current) return
                            const downgradeRanks: Record<string, number> = { free: 0, starter: 1, pro: 2 }
                            if (downgradeRanks[target] < downgradeRanks[current]) {
                              if (!confirm(`Move ${u.email} from ${current} to ${target}? They'll lose tier-gated features (templates, custom domain, etc.) immediately.`)) return
                            }
                            setUserPlan(u.id, target)
                          }
                          function activeStyles(t: 'free' | 'starter' | 'pro'): React.CSSProperties {
                            if (t === 'pro')     return { background: 'var(--gold)', color: 'var(--ink)', fontWeight: 700 }
                            if (t === 'starter') return { background: 'rgba(196,146,42,.18)', color: 'var(--gold)', fontWeight: 700 }
                            return { background: 'var(--ink)', color: 'var(--cream)', fontWeight: 700 }
                          }
                          return (
                            <div style={{ display: 'inline-flex', borderRadius: 6, border: '1px solid var(--cream-dark)', overflow: 'hidden' }}>
                              {tiers.map((t, i) => {
                                const isActive = t === current
                                return (
                                  <button
                                    key={t}
                                    onClick={() => switchTo(t)}
                                    title={isActive ? `Currently ${t}` : `Switch to ${t}`}
                                    style={{
                                      padding: '5px 12px',
                                      border: 'none',
                                      borderRight: i < tiers.length - 1 ? '1px solid var(--cream-dark)' : 'none',
                                      fontSize: 11,
                                      fontFamily: 'inherit',
                                      whiteSpace: 'nowrap',
                                      cursor: isActive ? 'default' : 'pointer',
                                      ...(isActive
                                        ? activeStyles(t)
                                        : { background: 'white', color: 'var(--ink-soft)', fontWeight: 400 }),
                                    }}
                                  >
                                    {labels[t]}
                                  </button>
                                )
                              })}
                            </div>
                          )
                        })()}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{u.portfolio_count}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{u.share_link_count}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--ink-soft)', fontSize: 11, whiteSpace: 'nowrap' }}>{timeAgo(u.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalUserPages > 1 && (() => {
              const btn = (label: string, target: number, disabled: boolean, isActive = false): React.ReactNode => (
                <button
                  key={label}
                  onClick={() => setUsersPage(target)}
                  disabled={disabled}
                  style={{
                    minWidth: 28, padding: '4px 8px', borderRadius: 4,
                    fontFamily: 'inherit', fontSize: 12, fontWeight: isActive ? 600 : 400,
                    color: disabled ? 'var(--ink-soft)' : isActive ? 'var(--ink)' : 'var(--ink-mid)',
                    background: isActive ? 'var(--cream)' : 'transparent',
                    border: `1px solid ${isActive ? 'var(--cream-dark)' : 'transparent'}`,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.4 : 1,
                  }}
                >{label}</button>
              )
              return (
                <div style={{ padding: '10px 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTop: '1px solid var(--cream-dark)', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                    Showing {userStart + 1}–{userStart + visibleUsers.length} of {filteredUsers.length}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    {btn('←', Math.max(1, activeUserPage - 1), activeUserPage === 1)}
                    {Array.from({ length: totalUserPages }, (_, i) => btn(String(i + 1), i + 1, false, activeUserPage === i + 1))}
                    {btn('→', Math.min(totalUserPages, activeUserPage + 1), activeUserPage === totalUserPages)}
                  </div>
                </div>
              )
            })()}
            </>
            )
          })()}
        </div>
        )
        })()}

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
          ) : (() => {
            const totalPages = Math.max(1, Math.ceil(filteredAllLocs.length / ADMIN_PAGE_SIZE))
            // Clamp the active page so a search that shrinks the
            // result set doesn't leave us on a now-empty trailing
            // page; clearing the search restores the original page
            // since locsPage state isn't actually reset.
            const activePage = Math.min(locsPage, totalPages)
            const start = (activePage - 1) * ADMIN_PAGE_SIZE
            const visible = filteredAllLocs.slice(start, start + ADMIN_PAGE_SIZE)
            return (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--cream)' }}>
                        <th style={thStyle}>Name</th>
                        <th style={thStyle}>Location</th>
                        <th style={thStyle}>Status</th>
                        <th style={thStyle}>Access</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Rating</th>
                        <th style={thStyle}>Source</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map(l => (
                        <tr key={l.id} style={{ borderBottom: '1px solid var(--cream-dark)' }}>
                          <td style={{ padding: '9px 12px', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.name}>
                            <Link href={`/explore?loc=${l.id}`} style={{ color: 'var(--sky)', textDecoration: 'none', fontWeight: 500 }}>{l.name}</Link>
                          </td>
                          <td style={{ padding: '9px 12px', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{[l.city, l.state].filter(Boolean).join(', ') || '—'}</td>
                          <td style={{ padding: '9px 12px' }}>
                            <span style={{ padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: l.status === 'published' ? 'rgba(74,103,65,.1)' : 'rgba(181,75,42,.1)', color: l.status === 'published' ? 'var(--sage)' : 'var(--rust)' }}>{l.status}</span>
                          </td>
                          <td style={{ padding: '9px 12px', color: 'var(--ink-soft)', fontSize: 11 }}>{l.access_type ?? '—'}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{l.rating != null ? `★ ${l.rating}` : '—'}</td>
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
                {totalPages > 1 && (() => {
                  const btn = (label: string, target: number, disabled: boolean, isActive = false): React.ReactNode => (
                    <button
                      key={label}
                      onClick={() => setLocsPage(target)}
                      disabled={disabled}
                      style={{
                        minWidth: 28, padding: '4px 8px', borderRadius: 4,
                        fontFamily: 'inherit', fontSize: 12, fontWeight: isActive ? 600 : 400,
                        color: disabled ? 'var(--ink-soft)' : isActive ? 'var(--ink)' : 'var(--ink-mid)',
                        background: isActive ? 'var(--cream)' : 'transparent',
                        border: `1px solid ${isActive ? 'var(--cream-dark)' : 'transparent'}`,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        opacity: disabled ? 0.4 : 1,
                      }}
                    >{label}</button>
                  )
                  return (
                    <div style={{ padding: '10px 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTop: '1px solid var(--cream-dark)', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                        Showing {start + 1}–{start + visible.length} of {filteredAllLocs.length}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {btn('←', Math.max(1, activePage - 1), activePage === 1)}
                        {Array.from({ length: totalPages }, (_, i) => btn(String(i + 1), i + 1, false, activePage === i + 1))}
                        {btn('→', Math.min(totalPages, activePage + 1), activePage === totalPages)}
                      </div>
                    </div>
                  )
                })()}
              </>
            )
          })()}
        </div>

        {/* QUALITY AUDIT — replaces the old AI scanner. Runs Claude
            against all published locations to surface suspected
            duplicates and entries with bad data. Each flag carries
            enough info to render the row + its concern; Edit /
            Delete reuse the existing /api/admin/locations handlers
            so a fix here updates the main Locations table inline. */}
        <div style={{ background: 'var(--ink)', borderRadius: 10, border: '1px solid rgba(255,255,255,.08)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--cream)', display: 'flex', alignItems: 'center', gap: 8 }}>
              🔎 Quality Audit
              <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, background: 'rgba(196,146,42,.2)', color: 'var(--gold)', border: '1px solid rgba(196,146,42,.3)' }}>{locationCount.toLocaleString()} in DB</span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(245,240,232,.4)', fontWeight: 300 }}>Find suspected duplicates + entries with incorrect data.</div>
          </div>

          <div style={{ padding: '1.25rem' }}>
            <button
              onClick={runAudit}
              disabled={auditRunning}
              style={{
                width: '100%', padding: '13px', borderRadius: 4,
                background: auditRunning ? 'rgba(196,146,42,.3)' : 'var(--gold)',
                color: 'var(--ink)', border: 'none',
                fontSize: 14, fontWeight: 500,
                cursor: auditRunning ? 'default' : 'pointer',
                fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {auditRunning
                ? (<><div style={{ width: 16, height: 16, border: '2px solid rgba(26,22,18,.3)', borderTop: '2px solid var(--ink)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />Auditing {auditProgress?.done ?? 0} / {auditProgress?.total ?? '…'}</>)
                : (auditDone ? '🔄 Run audit again' : '🔎 Run quality audit')}
            </button>

            {auditRunning && auditProgress && auditProgress.total > 0 && (
              <div style={{ marginTop: 10, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round((auditProgress.done / auditProgress.total) * 100)}%`, background: 'var(--gold)', transition: 'width .3s ease' }} />
              </div>
            )}

            {/* Empty-state when the audit has completed and found
                nothing — explicit "no problems" reads better than a
                blank panel. */}
            {auditDone && auditDuplicates.length === 0 && auditIncorrect.length === 0 && (
              <div style={{ marginTop: '1rem', padding: '14px', background: 'rgba(74,103,65,.1)', border: '1px solid rgba(74,103,65,.3)', borderRadius: 8, fontSize: 13, color: '#c8e8c4', textAlign: 'center' }}>
                ✓ No suspected duplicates or incorrect entries found.
              </div>
            )}

            {/* DUPLICATES */}
            {auditDuplicates.length > 0 && (
              <div style={{ marginTop: '1.25rem' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cream)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
                  Suspected duplicates ({auditDuplicates.filter(d => !auditDismissed.has(`d:${d.duplicate.id}:${d.primary.id}`)).length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {auditDuplicates.map(d => {
                    const key = `d:${d.duplicate.id}:${d.primary.id}`
                    if (auditDismissed.has(key)) return null
                    return (
                      <div key={key} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 8, padding: '12px 14px' }}>
                        <div style={{ fontSize: 11, color: 'var(--gold)', marginBottom: 8, fontStyle: 'italic' }}>{d.reason}</div>
                        {([d.primary, d.duplicate] as const).map((row, idx) => {
                          const isDup = idx === 1
                          const managed = allLocs.find(l => l.id === row.id) ?? null
                          return (
                            <div key={row.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderTop: idx === 1 ? '1px solid rgba(255,255,255,.06)' : 'none' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cream)' }}>
                                  {row.name}
                                  <span style={{ marginLeft: 8, fontSize: 10, color: isDup ? 'var(--rust)' : 'var(--sage)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                                    {isDup ? 'newer · likely duplicate' : 'older · keep'}
                                  </span>
                                </div>
                                <div style={{ fontSize: 11, color: 'rgba(245,240,232,.5)' }}>{[row.city, row.state].filter(Boolean).join(', ') || '—'}</div>
                              </div>
                              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                {managed && (
                                  <button onClick={() => setEditingLoc(managed)} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: 'rgba(245,240,232,.7)', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                                )}
                                <button onClick={() => { deleteLocation(row.id); dismissAuditFlag(key) }} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid rgba(181,75,42,.4)', background: 'rgba(181,75,42,.15)', color: '#ffd0c0', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                              </div>
                            </div>
                          )
                        })}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                          <button onClick={() => dismissAuditFlag(key)} style={{ fontSize: 11, color: 'rgba(245,240,232,.4)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Not a duplicate — dismiss</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* INCORRECT INFO */}
            {auditIncorrect.length > 0 && (
              <div style={{ marginTop: '1.25rem' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cream)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
                  Suspected incorrect data ({auditIncorrect.filter(f => !auditDismissed.has(`i:${f.location.id}`)).length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {auditIncorrect.map(f => {
                    const key = `i:${f.location.id}`
                    if (auditDismissed.has(key)) return null
                    const managed = allLocs.find(l => l.id === f.location.id) ?? null
                    return (
                      <div key={key} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 8, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cream)' }}>{f.location.name}</div>
                          <div style={{ fontSize: 11, color: 'rgba(245,240,232,.5)', marginBottom: 4 }}>{[f.location.city, f.location.state].filter(Boolean).join(', ') || '—'}</div>
                          <div style={{ fontSize: 12, color: 'var(--gold)', fontStyle: 'italic', lineHeight: 1.5 }}>{f.reason}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          {managed && (
                            <button onClick={() => setEditingLoc(managed)} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: 'rgba(245,240,232,.7)', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                          )}
                          <button onClick={() => { deleteLocation(f.location.id); dismissAuditFlag(key) }} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid rgba(181,75,42,.4)', background: 'rgba(181,75,42,.15)', color: '#ffd0c0', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                          <button onClick={() => dismissAuditFlag(key)} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: 'rgba(245,240,232,.4)', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Dismiss</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
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

function MetricCard({ label, value, sub }: { label: string; value: number | string; sub: string }) {
  return (
    <div style={{ padding: '12px 14px', background: 'var(--cream)', borderRadius: 8, border: '1px solid var(--cream-dark)' }}>
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-soft)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 24, fontWeight: 700, color: 'var(--ink)', lineHeight: 1, marginBottom: 3 }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
      <div style={{ fontSize: 11, color: 'var(--sage)' }}>{sub}</div>
    </div>
  )
}
