'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Admin scanner UI. Drives the /api/scan-locations endpoint client-side,
// one (city, category) combo per HTTP request. Each API call takes ~30-60s
// (Claude web-search + Google geocoding per candidate); we serialize the
// loop so aborts are clean and rate-limit blast radius stays small.
//
// Cost estimate at the bottom is a rough per-combo figure — actual spend
// depends on how many search rounds Claude runs and how many candidates
// need geocoding. Watch the running "spent so far" count against the
// estimate; if the ratio drifts wildly, ratio adjust.

// Kept in sync with SCAN_CATEGORY_NAMES in /api/scan-locations/route.ts.
// (Not imported directly because that route is a server file — client can't
// import server modules with `use server` directives or Node-only deps.)
const CATEGORIES = [
  'Parks & Nature',
  'Urban & Architecture',
  'Historic & Cultural',
  'Waterfront & Water Features',
  'Fields, Meadows & Open Spaces',
  'Private Venues & Hidden Gems',
  'Golden Hour & Sunrise Spots',
  'Neighborhoods & Street Life',
]

// Ballpark cost per (city, category) combo, including Anthropic tokens
// (Sonnet 5 with web search) + Google geocoding. Refine over time by
// comparing this estimate to your actual Anthropic dashboard spend.
const EST_COST_PER_COMBO = 0.15

interface RunResult {
  city: string
  category: string
  ok: boolean
  scanned?: number
  inserted?: string[]
  skipped?: string[]
  errors?: string[]
  error?: string
}

export default function LocationScannerPanel() {
  const [citiesText,        setCitiesText]        = useState('')
  const [selectedCats,      setSelectedCats]      = useState<Set<string>>(new Set(CATEGORIES))
  const [running,           setRunning]           = useState(false)
  const [progressDone,      setProgressDone]      = useState(0)
  const [progressTotal,     setProgressTotal]     = useState(0)
  const [currentLabel,      setCurrentLabel]      = useState<string>('')
  const [results,           setResults]           = useState<RunResult[]>([])
  const [aborted,           setAborted]           = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const logRef   = useRef<HTMLDivElement | null>(null)

  // Auto-scroll the live log to the bottom on new entries.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [results.length, currentLabel])

  const cities = useMemo(() => {
    return citiesText
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
  }, [citiesText])

  const totalCombos = cities.length * selectedCats.size
  const estCost     = totalCombos * EST_COST_PER_COMBO
  const totalInserted = results.reduce((n, r) => n + (r.inserted?.length ?? 0), 0)
  const totalSkipped  = results.reduce((n, r) => n + (r.skipped?.length  ?? 0), 0)
  const totalErrors   = results.reduce((n, r) => n + (r.errors?.length   ?? 0) + (r.error ? 1 : 0), 0)

  function toggleCategory(name: string) {
    setSelectedCats(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else                next.add(name)
      return next
    })
  }

  const start = useCallback(async () => {
    if (running || totalCombos === 0) return
    setRunning(true); setAborted(false); setResults([])
    setProgressDone(0); setProgressTotal(totalCombos)

    const abort = new AbortController()
    abortRef.current = abort

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      setResults([{ city: '(auth)', category: '(auth)', ok: false, error: 'Not signed in' }])
      setRunning(false)
      return
    }

    outer:
    for (const city of cities) {
      for (const category of CATEGORIES) {
        if (!selectedCats.has(category))  continue
        if (abort.signal.aborted)         break outer

        setCurrentLabel(`${city} — ${category}`)

        try {
          const res = await fetch('/api/scan-locations', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body:    JSON.stringify({ city, category }),
            signal:  abort.signal,
          })
          const j = await res.json().catch(() => ({}))
          if (!res.ok) {
            setResults(prev => [...prev, { city, category, ok: false, error: j.message ?? j.error ?? `HTTP ${res.status}` }])
          } else {
            setResults(prev => [...prev, {
              city, category, ok: true,
              scanned:  j.scanned ?? 0,
              inserted: j.inserted ?? [],
              skipped:  j.skipped ?? [],
              errors:   j.errors ?? [],
            }])
          }
        } catch (err: any) {
          if (err?.name === 'AbortError') break outer
          setResults(prev => [...prev, { city, category, ok: false, error: err?.message ?? 'network error' }])
        }

        setProgressDone(prev => prev + 1)
      }
    }

    setCurrentLabel('')
    setRunning(false)
    if (abort.signal.aborted) setAborted(true)
    abortRef.current = null
  }, [running, totalCombos, cities, selectedCats])

  function stop() {
    abortRef.current?.abort()
  }

  return (
    <div style={{ background: 'var(--ink)', borderRadius: 10, border: '1px solid rgba(255,255,255,.08)', overflow: 'hidden' }}>
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--cream)', display: 'flex', alignItems: 'center', gap: 8 }}>
          🤖 AI Location Scanner
          <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, background: 'rgba(196,146,42,.2)', color: 'var(--gold)', border: '1px solid rgba(196,146,42,.3)' }}>Bulk seed</span>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(245,240,232,.4)', fontWeight: 300 }}>Sonnet 5 + web search + Google geocoding. ~15 candidates per combo, dedup vs existing.</div>
      </div>

      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Cities input */}
        <div>
          <label style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(245,240,232,.7)', marginBottom: 6 }}>
            Cities
            <span style={{ fontSize: 10, fontWeight: 400, letterSpacing: 0, textTransform: 'none', color: 'rgba(245,240,232,.4)' }}>one per line, "City, ST" (e.g. Boise, ID)</span>
          </label>
          <textarea
            value={citiesText}
            onChange={e => setCitiesText(e.target.value)}
            disabled={running}
            placeholder={"Boise, ID\nMadison, WI\nAsheville, NC"}
            rows={5}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 6, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.12)', color: 'var(--cream)', fontFamily: 'var(--font-mono, Menlo, monospace)', fontSize: 13, outline: 'none', resize: 'vertical', minHeight: 90 }}
          />
          <div style={{ fontSize: 11, color: 'rgba(245,240,232,.4)', marginTop: 4 }}>
            {cities.length} {cities.length === 1 ? 'city' : 'cities'}
          </div>
        </div>

        {/* Category checklist */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(245,240,232,.7)' }}>
              Categories <span style={{ fontSize: 10, fontWeight: 400, letterSpacing: 0, textTransform: 'none', color: 'rgba(245,240,232,.4)' }}>({selectedCats.size}/{CATEGORIES.length})</span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setSelectedCats(new Set(CATEGORIES))} disabled={running} style={{ background: 'transparent', color: 'rgba(245,240,232,.55)', border: 'none', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>select all</button>
              <button onClick={() => setSelectedCats(new Set())}          disabled={running} style={{ background: 'transparent', color: 'rgba(245,240,232,.55)', border: 'none', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>clear</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 6 }}>
            {CATEGORIES.map(cat => {
              const on = selectedCats.has(cat)
              return (
                <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 5, border: `1px solid ${on ? 'rgba(196,146,42,.4)' : 'rgba(255,255,255,.08)'}`, background: on ? 'rgba(196,146,42,.08)' : 'rgba(255,255,255,.02)', cursor: running ? 'default' : 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleCategory(cat)}
                    disabled={running}
                    style={{ margin: 0, accentColor: 'var(--gold)' }}
                  />
                  <span style={{ fontSize: 12, color: on ? 'var(--cream)' : 'rgba(245,240,232,.6)' }}>{cat}</span>
                </label>
              )
            })}
          </div>
        </div>

        {/* Cost estimate + run button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingTop: 4 }}>
          <div style={{ flex: '1 1 auto', minWidth: 0, fontSize: 12, color: 'rgba(245,240,232,.6)', lineHeight: 1.55 }}>
            {totalCombos > 0
              ? <>
                  {totalCombos} combo{totalCombos === 1 ? '' : 's'} to scan · rough estimate <strong style={{ color: 'var(--gold)' }}>${estCost.toFixed(2)}</strong>
                  <div style={{ fontSize: 10, color: 'rgba(245,240,232,.35)', marginTop: 2 }}>Actual cost varies with how many search rounds Claude runs. Watch the running total below.</div>
                </>
              : <>Add cities and pick categories to scan.</>}
          </div>
          {running
            ? <button onClick={stop} style={{ padding: '9px 20px', borderRadius: 6, background: 'var(--rust)', color: 'white', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Stop</button>
            : <button
                onClick={start}
                disabled={totalCombos === 0}
                style={{ padding: '9px 22px', borderRadius: 6, background: totalCombos === 0 ? 'rgba(196,146,42,.3)' : 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 13, fontWeight: 600, cursor: totalCombos === 0 ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                {results.length > 0 ? '🔄 Re-run' : '🚀 Start scan'}
              </button>}
        </div>

        {/* Progress bar */}
        {(running || progressTotal > 0) && (
          <div style={{ marginTop: 4 }}>
            <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round((progressDone / Math.max(1, progressTotal)) * 100)}%`, background: 'var(--gold)', transition: 'width .3s ease' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(245,240,232,.55)', marginTop: 4 }}>
              <div>{running ? `Scanning ${currentLabel || '…'}` : aborted ? 'Stopped' : (progressDone === progressTotal ? '✓ Complete' : 'Idle')}</div>
              <div>{progressDone} / {progressTotal}</div>
            </div>
          </div>
        )}

        {/* Summary stats */}
        {results.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, marginTop: 4 }}>
            <StatBox label="Added"      value={totalInserted} tone="sage" />
            <StatBox label="Skipped"    value={totalSkipped}  tone="muted" />
            <StatBox label="Errors"     value={totalErrors}   tone="rust" />
            <StatBox label="Est. spend" value={`$${(results.length * EST_COST_PER_COMBO).toFixed(2)}`} tone="gold" />
          </div>
        )}

        {/* Live log */}
        {results.length > 0 && (
          <div
            ref={logRef}
            style={{ maxHeight: 260, overflowY: 'auto', background: 'rgba(0,0,0,.25)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 6, padding: '10px 12px', fontFamily: 'var(--font-mono, Menlo, monospace)', fontSize: 11.5, lineHeight: 1.55 }}
          >
            {results.map((r, i) => (
              <div key={i} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: i < results.length - 1 ? '1px dashed rgba(255,255,255,.05)' : 'none' }}>
                <div style={{ color: r.ok ? 'var(--gold)' : 'var(--rust)', fontWeight: 600 }}>
                  {r.ok ? '✓' : '✗'} {r.city} — {r.category}
                </div>
                {r.ok
                  ? <div style={{ color: 'rgba(245,240,232,.55)', paddingLeft: 14 }}>
                      +{r.inserted?.length ?? 0} added · {r.skipped?.length ?? 0} skipped {r.errors && r.errors.length > 0 ? `· ${r.errors.length} errors` : ''}
                      {r.inserted && r.inserted.length > 0 && (
                        <div style={{ color: 'rgba(245,240,232,.4)', fontSize: 11, marginTop: 2 }}>
                          {r.inserted.slice(0, 3).join(', ')}{r.inserted.length > 3 ? `, +${r.inserted.length - 3} more` : ''}
                        </div>
                      )}
                    </div>
                  : <div style={{ color: '#ffb3a0', paddingLeft: 14 }}>{r.error}</div>}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}

function StatBox({ label, value, tone }: { label: string; value: number | string; tone: 'sage' | 'muted' | 'rust' | 'gold' }) {
  const colors: Record<string, string> = {
    sage:  'var(--sage)',
    muted: 'rgba(245,240,232,.6)',
    rust:  '#ffb3a0',
    gold:  'var(--gold)',
  }
  return (
    <div style={{ padding: '10px 12px', borderRadius: 6, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)' }}>
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(245,240,232,.45)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: colors[tone], fontFamily: 'var(--font-playfair),serif' }}>{value}</div>
    </div>
  )
}
