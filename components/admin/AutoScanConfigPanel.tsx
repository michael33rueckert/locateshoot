'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Admin config for the daily-cron scanner. Reads/writes the
// scanner_config row via /api/admin/scanner-config. The cron itself
// fires from Vercel once a day at 12:00 UTC; toggling enabled=false
// here is what pauses it. Cities × categories drive the queue; only
// one combo runs per daily fire (Vercel Hobby 60s cap).

interface Config {
  enabled:        boolean
  cities:         string[]
  categories:     string[]
  queue_index:    number
  last_run_at:    string | null
  notify_email:   string | null
  notify_user_id: string | null
}

export default function AutoScanConfigPanel() {
  const [config,     setConfig]     = useState<Config | null>(null)
  const [available,  setAvailable]  = useState<string[]>([])
  const [citiesText, setCitiesText] = useState<string>('')
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set())
  const [notifyEmail,  setNotifyEmail]  = useState<string>('')
  const [enabled,      setEnabled]      = useState<boolean>(false)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [savedAt,    setSavedAt]    = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    const res = await fetch('/api/admin/scanner-config', { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) { setError('Failed to load config'); return }
    const json = await res.json()
    const cfg: Config = json.config
    setConfig(cfg)
    setAvailable(json.available_categories ?? [])
    setCitiesText((cfg.cities ?? []).join('\n'))
    setSelectedCats(new Set(cfg.categories ?? []))
    setNotifyEmail(cfg.notify_email ?? '')
    setEnabled(!!cfg.enabled)
    setSavedAt(json.updated_at ?? null)
  }, [])

  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true); setError(null)
    const cities = citiesText.split('\n').map(s => s.trim()).filter(Boolean)
    const categories = Array.from(selectedCats)
    const payload = { enabled, cities, categories, notify_email: notifyEmail.trim() || null }
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setError('Not signed in'); setSaving(false); return }
    const res = await fetch('/api/admin/scanner-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setError(json?.error ?? 'Save failed'); setSaving(false); return }
    setConfig(json.config)
    setSavedAt(new Date().toISOString())
    setSaving(false)
  }

  function toggleCat(name: string) {
    setSelectedCats(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }

  const combos = citiesText.split('\n').filter(s => s.trim()).length * selectedCats.size
  const daysToCycle = combos // one combo per daily run

  return (
    <div style={{ background: 'var(--ink)', borderRadius: 10, border: '1px solid rgba(255,255,255,.08)', overflow: 'hidden' }}>
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--cream)', display: 'flex', alignItems: 'center', gap: 8 }}>
          🌙 Auto scan — daily
          <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, background: enabled ? 'rgba(74,103,65,.25)' : 'rgba(255,255,255,.08)', color: enabled ? 'var(--sage)' : 'rgba(245,240,232,.55)', border: `1px solid ${enabled ? 'rgba(74,103,65,.4)' : 'rgba(255,255,255,.12)'}` }}>{enabled ? 'On' : 'Off'}</span>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(245,240,232,.4)', fontWeight: 300 }}>
          Fires at 12:00 UTC. One (city × category) per run · candidates land in Pending until you swipe to keep.
        </div>
      </div>

      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 14 }}>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 6, border: `1px solid ${enabled ? 'rgba(196,146,42,.4)' : 'rgba(255,255,255,.08)'}`, background: enabled ? 'rgba(196,146,42,.08)' : 'rgba(255,255,255,.02)', cursor: 'pointer' }}>
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} style={{ margin: 0, accentColor: 'var(--gold)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cream)' }}>Enable daily auto scan</div>
            <div style={{ fontSize: 11, color: 'rgba(245,240,232,.5)', fontWeight: 300, marginTop: 2 }}>
              When on, one combo runs each day. When off, the cron endpoint returns immediately without touching Claude / geocoding.
            </div>
          </div>
        </label>

        <div>
          <label style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(245,240,232,.7)', marginBottom: 6 }}>
            Cities
            <span style={{ fontSize: 10, fontWeight: 400, letterSpacing: 0, textTransform: 'none', color: 'rgba(245,240,232,.4)' }}>one per line, "City, ST" (e.g. Boise, ID)</span>
          </label>
          <textarea
            value={citiesText}
            onChange={e => setCitiesText(e.target.value)}
            placeholder={"Kansas City, MO\nBoise, ID\nAsheville, NC"}
            rows={5}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 6, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.12)', color: 'var(--cream)', fontFamily: 'var(--font-mono, Menlo, monospace)', fontSize: 13, outline: 'none', resize: 'vertical', minHeight: 90 }}
          />
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(245,240,232,.7)' }}>
              Categories <span style={{ fontSize: 10, fontWeight: 400, letterSpacing: 0, textTransform: 'none', color: 'rgba(245,240,232,.4)' }}>({selectedCats.size}/{available.length})</span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setSelectedCats(new Set(available))} style={{ background: 'transparent', color: 'rgba(245,240,232,.55)', border: 'none', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>select all</button>
              <button onClick={() => setSelectedCats(new Set())}           style={{ background: 'transparent', color: 'rgba(245,240,232,.55)', border: 'none', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>clear</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 6 }}>
            {available.map(cat => {
              const on = selectedCats.has(cat)
              return (
                <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 5, border: `1px solid ${on ? 'rgba(196,146,42,.4)' : 'rgba(255,255,255,.08)'}`, background: on ? 'rgba(196,146,42,.08)' : 'rgba(255,255,255,.02)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={on} onChange={() => toggleCat(cat)} style={{ margin: 0, accentColor: 'var(--gold)' }} />
                  <span style={{ fontSize: 12, color: on ? 'var(--cream)' : 'rgba(245,240,232,.6)' }}>{cat}</span>
                </label>
              )
            })}
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(245,240,232,.7)', marginBottom: 6 }}>
            Notify email <span style={{ fontSize: 10, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'rgba(245,240,232,.4)' }}>(push always goes to you)</span>
          </label>
          <input
            type="email"
            value={notifyEmail}
            onChange={e => setNotifyEmail(e.target.value)}
            placeholder="michael@locateshoot.com"
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 6, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.12)', color: 'var(--cream)', fontFamily: 'inherit', fontSize: 13, outline: 'none' }}
          />
        </div>

        <div style={{ padding: '10px 12px', borderRadius: 6, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', fontSize: 12, color: 'rgba(245,240,232,.65)', lineHeight: 1.55 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span>{combos > 0 ? <>Full cycle: <strong style={{ color: 'var(--gold)' }}>{daysToCycle} day{daysToCycle === 1 ? '' : 's'}</strong> at 1 combo/day</> : 'Add cities and categories to schedule scans.'}</span>
            {config?.last_run_at && <span style={{ fontSize: 11, color: 'rgba(245,240,232,.4)' }}>Last run {new Date(config.last_run_at).toLocaleString()}</span>}
          </div>
          {config && combos > 0 && (
            <div style={{ fontSize: 11, color: 'rgba(245,240,232,.4)', marginTop: 4 }}>
              Next up: queue position {((config.queue_index % combos) + combos) % combos + 1} of {combos}
            </div>
          )}
        </div>

        {error && <div style={{ padding: '8px 12px', background: 'rgba(181,75,42,.1)', border: '1px solid rgba(181,75,42,.3)', borderRadius: 6, fontSize: 12, color: '#ffb3a0' }}>{error}</div>}
        {savedAt && !error && <div style={{ fontSize: 11, color: 'rgba(74,103,65,.9)' }}>✓ Saved {new Date(savedAt).toLocaleTimeString()}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={save}
            disabled={saving}
            style={{ padding: '9px 22px', borderRadius: 6, background: saving ? 'rgba(196,146,42,.4)' : 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Saving…' : 'Save config'}
          </button>
        </div>
      </div>
    </div>
  )
}
