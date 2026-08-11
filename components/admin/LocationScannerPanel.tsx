'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Admin scanner UI. Two-phase flow:
//   1. Preview — run /api/scan-locations/query for each (city, category)
//      combo. Each response is annotated with a `conflict` field flagging
//      candidates that look like duplicates of rows already on the map.
//   2. Review — every returned candidate lands in an approval list with
//      a checkbox. Conflicts are unchecked by default and marked with a
//      warning. Non-conflicting candidates are checked by default.
//   3. Commit — /api/scan-locations/commit runs for each combo that
//      has approved candidates, inserting only the ones the admin ticked.
//
// The split fits Vercel Hobby's 60s function cap and lets the admin see
// what the model proposes before spending DB rows on it.

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

const EST_COST_PER_COMBO = 0.15

interface Conflict { id: string; name: string; city: string; reason: string }

interface RawCandidate {
  name:          string
  city:          string
  state:         string
  description?:  string | null
  quality_score?:number | null
  rating?:       number | null
  latitude?:     number | null
  longitude?:    number | null
  [k: string]:   any
}

interface PreviewCandidate {
  key:      string   // `${city}::${category}::${name}` — stable identity for the approval Set
  city:     string
  category: string
  raw:      RawCandidate
  conflict: Conflict | null
}

interface QueryResult { city: string; category: string; ok: boolean; count?: number; conflicts?: number; error?: string }
interface CommitResult { city: string; category: string; ok: boolean; inserted?: string[]; skipped?: string[]; errors?: string[]; error?: string }

type Phase = 'idle' | 'previewing' | 'review' | 'committing' | 'done'

export default function LocationScannerPanel() {
  const [citiesText,    setCitiesText]    = useState('')
  const [selectedCats,  setSelectedCats]  = useState<Set<string>>(new Set(CATEGORIES))
  const [phase,         setPhase]         = useState<Phase>('idle')
  const [progressDone,  setProgressDone]  = useState(0)
  const [progressTotal, setProgressTotal] = useState(0)
  const [currentLabel,  setCurrentLabel]  = useState<string>('')
  const [aborted,       setAborted]       = useState(false)
  const [queryResults,  setQueryResults]  = useState<QueryResult[]>([])
  const [candidates,    setCandidates]    = useState<PreviewCandidate[]>([])
  const [approved,      setApproved]      = useState<Set<string>>(new Set())
  const [commitResults, setCommitResults] = useState<CommitResult[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const logRef   = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [queryResults.length, commitResults.length, currentLabel])

  const cities = useMemo(() => citiesText.split('\n').map(s => s.trim()).filter(Boolean), [citiesText])
  const totalCombos = cities.length * selectedCats.size
  const estCost     = totalCombos * EST_COST_PER_COMBO
  const running     = phase === 'previewing' || phase === 'committing'
  const totalInserted = commitResults.reduce((n, r) => n + (r.inserted?.length ?? 0), 0)
  const totalSkipped  = commitResults.reduce((n, r) => n + (r.skipped?.length  ?? 0), 0)
  const totalCommitErrors = commitResults.reduce((n, r) => n + (r.errors?.length ?? 0) + (r.error ? 1 : 0), 0)
  const totalConflicts    = candidates.filter(c => c.conflict).length

  function toggleCategory(name: string) {
    setSelectedCats(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }

  function toggleApproved(key: string) {
    setApproved(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  function resetAll() {
    setPhase('idle')
    setQueryResults([]); setCandidates([]); setApproved(new Set()); setCommitResults([])
    setProgressDone(0); setProgressTotal(0); setCurrentLabel(''); setAborted(false)
  }

  const runPreview = useCallback(async () => {
    if (running || totalCombos === 0) return
    setPhase('previewing')
    setAborted(false)
    setQueryResults([]); setCandidates([]); setApproved(new Set()); setCommitResults([])
    setProgressDone(0); setProgressTotal(totalCombos)

    const abort = new AbortController()
    abortRef.current = abort

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      setQueryResults([{ city: '(auth)', category: '(auth)', ok: false, error: 'Not signed in' }])
      setPhase('idle')
      return
    }

    const collected: PreviewCandidate[] = []
    const defaultApproved = new Set<string>()

    outer:
    for (const city of cities) {
      for (const category of CATEGORIES) {
        if (!selectedCats.has(category)) continue
        if (abort.signal.aborted)        break outer
        setCurrentLabel(`${city} — ${category} · querying Claude…`)
        try {
          const res = await fetch('/api/scan-locations/query', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body:    JSON.stringify({ city, category }),
            signal:  abort.signal,
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok) {
            setQueryResults(prev => [...prev, { city, category, ok: false, error: `query: ${json.message ?? json.error ?? `HTTP ${res.status}`}` }])
          } else {
            const arr = Array.isArray(json.candidates) ? json.candidates : []
            let conflicts = 0
            for (const c of arr) {
              const key = `${city}::${category}::${(c?.name ?? '').toLowerCase()}`
              const conflict = c?.conflict ?? null
              collected.push({ key, city, category, raw: c, conflict })
              if (conflict) conflicts++
              else          defaultApproved.add(key)
            }
            setQueryResults(prev => [...prev, { city, category, ok: true, count: arr.length, conflicts }])
          }
        } catch (err: any) {
          if (err?.name === 'AbortError') break outer
          setQueryResults(prev => [...prev, { city, category, ok: false, error: err?.message ?? 'network error' }])
        }
        setProgressDone(prev => prev + 1)
      }
    }

    setCandidates(collected)
    setApproved(defaultApproved)
    setCurrentLabel('')
    setPhase(abort.signal.aborted ? 'idle' : 'review')
    if (abort.signal.aborted) setAborted(true)
    abortRef.current = null
  }, [running, totalCombos, cities, selectedCats])

  const runCommit = useCallback(async () => {
    if (running || approved.size === 0) return
    setPhase('committing')
    setCommitResults([])
    setAborted(false)

    // Group approved candidates back by (city, category) so we can
    // ship one /commit request per combo — the endpoint's dedup and
    // geocode work is already scoped that way.
    const grouped = new Map<string, { city: string; category: string; raws: RawCandidate[] }>()
    for (const c of candidates) {
      if (!approved.has(c.key)) continue
      const gk = `${c.city}::${c.category}`
      const g = grouped.get(gk) ?? { city: c.city, category: c.category, raws: [] }
      g.raws.push(c.raw)
      grouped.set(gk, g)
    }

    const abort = new AbortController()
    abortRef.current = abort
    setProgressDone(0); setProgressTotal(grouped.size)

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      setCommitResults([{ city: '(auth)', category: '(auth)', ok: false, error: 'Not signed in' }])
      setPhase('review')
      return
    }

    for (const { city, category, raws } of grouped.values()) {
      if (abort.signal.aborted) break
      setCurrentLabel(`${city} — ${category} · saving ${raws.length}…`)
      try {
        const res = await fetch('/api/scan-locations/commit', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ city, category, candidates: raws }),
          signal:  abort.signal,
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          setCommitResults(prev => [...prev, { city, category, ok: false, error: `commit: ${json.message ?? json.error ?? `HTTP ${res.status}`}` }])
        } else {
          setCommitResults(prev => [...prev, {
            city, category, ok: true,
            inserted: json.inserted ?? [],
            skipped:  json.skipped ?? [],
            errors:   json.errors ?? [],
          }])
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') break
        setCommitResults(prev => [...prev, { city, category, ok: false, error: err?.message ?? 'network error' }])
      }
      setProgressDone(prev => prev + 1)
    }

    setCurrentLabel('')
    setPhase(abort.signal.aborted ? 'review' : 'done')
    if (abort.signal.aborted) setAborted(true)
    abortRef.current = null
  }, [running, approved, candidates])

  function stop() { abortRef.current?.abort() }

  // Grouped candidates for the review UI — keeps the visual order
  // predictable (city → category → name).
  const groupedForReview = useMemo(() => {
    const groups = new Map<string, { city: string; category: string; items: PreviewCandidate[] }>()
    for (const c of candidates) {
      const key = `${c.city}::${c.category}`
      const g = groups.get(key) ?? { city: c.city, category: c.category, items: [] }
      g.items.push(c)
      groups.set(key, g)
    }
    return Array.from(groups.values())
  }, [candidates])

  return (
    <div style={{ background: 'var(--ink)', borderRadius: 10, border: '1px solid rgba(255,255,255,.08)', overflow: 'hidden' }}>
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--cream)', display: 'flex', alignItems: 'center', gap: 8 }}>
          🤖 AI Location Scanner
          <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, background: 'rgba(196,146,42,.2)', color: 'var(--gold)', border: '1px solid rgba(196,146,42,.3)' }}>Preview + approve</span>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(245,240,232,.4)', fontWeight: 300 }}>Sonnet 5 + web search. Candidates land in an approval list before hitting the map.</div>
      </div>

      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Inputs — hidden once a preview exists so review stays focused. */}
        {phase === 'idle' && (
          <>
            <div>
              <label style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(245,240,232,.7)', marginBottom: 6 }}>
                Cities
                <span style={{ fontSize: 10, fontWeight: 400, letterSpacing: 0, textTransform: 'none', color: 'rgba(245,240,232,.4)' }}>one per line, "City, ST" (e.g. Boise, ID)</span>
              </label>
              <textarea
                value={citiesText}
                onChange={e => setCitiesText(e.target.value)}
                placeholder={"Boise, ID\nMadison, WI\nAsheville, NC"}
                rows={5}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 6, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.12)', color: 'var(--cream)', fontFamily: 'var(--font-mono, Menlo, monospace)', fontSize: 13, outline: 'none', resize: 'vertical', minHeight: 90 }}
              />
              <div style={{ fontSize: 11, color: 'rgba(245,240,232,.4)', marginTop: 4 }}>
                {cities.length} {cities.length === 1 ? 'city' : 'cities'}
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(245,240,232,.7)' }}>
                  Categories <span style={{ fontSize: 10, fontWeight: 400, letterSpacing: 0, textTransform: 'none', color: 'rgba(245,240,232,.4)' }}>({selectedCats.size}/{CATEGORIES.length})</span>
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setSelectedCats(new Set(CATEGORIES))} style={{ background: 'transparent', color: 'rgba(245,240,232,.55)', border: 'none', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>select all</button>
                  <button onClick={() => setSelectedCats(new Set())}          style={{ background: 'transparent', color: 'rgba(245,240,232,.55)', border: 'none', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>clear</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 6 }}>
                {CATEGORIES.map(cat => {
                  const on = selectedCats.has(cat)
                  return (
                    <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 5, border: `1px solid ${on ? 'rgba(196,146,42,.4)' : 'rgba(255,255,255,.08)'}`, background: on ? 'rgba(196,146,42,.08)' : 'rgba(255,255,255,.02)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={on} onChange={() => toggleCategory(cat)} style={{ margin: 0, accentColor: 'var(--gold)' }} />
                      <span style={{ fontSize: 12, color: on ? 'var(--cream)' : 'rgba(245,240,232,.6)' }}>{cat}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingTop: 4 }}>
              <div style={{ flex: '1 1 auto', minWidth: 0, fontSize: 12, color: 'rgba(245,240,232,.6)', lineHeight: 1.55 }}>
                {totalCombos > 0
                  ? <>
                      {totalCombos} combo{totalCombos === 1 ? '' : 's'} to scan · rough estimate <strong style={{ color: 'var(--gold)' }}>${estCost.toFixed(2)}</strong>
                      <div style={{ fontSize: 10, color: 'rgba(245,240,232,.35)', marginTop: 2 }}>Only the preview call costs money; approving the list is free.</div>
                    </>
                  : <>Add cities and pick categories to scan.</>}
              </div>
              <button
                onClick={runPreview}
                disabled={totalCombos === 0}
                style={{ padding: '9px 22px', borderRadius: 6, background: totalCombos === 0 ? 'rgba(196,146,42,.3)' : 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 13, fontWeight: 600, cursor: totalCombos === 0 ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                🔎 Preview candidates
              </button>
            </div>
          </>
        )}

        {/* Progress — shown while previewing or committing. */}
        {(phase === 'previewing' || phase === 'committing') && (
          <div style={{ marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: 'rgba(245,240,232,.75)', flex: 1 }}>
                {phase === 'previewing' ? 'Preview scan in progress' : 'Committing approved candidates'} — {currentLabel || '…'}
              </div>
              <button onClick={stop} style={{ padding: '7px 16px', borderRadius: 6, background: 'var(--rust)', color: 'white', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Stop</button>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round((progressDone / Math.max(1, progressTotal)) * 100)}%`, background: 'var(--gold)', transition: 'width .3s ease' }} />
            </div>
            <div style={{ fontSize: 11, color: 'rgba(245,240,232,.55)', marginTop: 4, textAlign: 'right' }}>{progressDone} / {progressTotal}</div>
          </div>
        )}

        {/* Review — approval list. */}
        {phase === 'review' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: 'rgba(245,240,232,.75)', lineHeight: 1.5 }}>
                <div style={{ fontWeight: 600, color: 'var(--cream)', marginBottom: 2 }}>Review candidates before adding</div>
                {candidates.length} candidate{candidates.length === 1 ? '' : 's'} · {approved.size} approved · <span style={{ color: totalConflicts > 0 ? '#ffb877' : 'inherit' }}>{totalConflicts} possible duplicate{totalConflicts === 1 ? '' : 's'}</span> (unchecked by default)
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setApproved(new Set(candidates.map(c => c.key)))} style={{ background: 'transparent', color: 'rgba(245,240,232,.7)', border: '1px solid rgba(255,255,255,.15)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: '5px 10px', borderRadius: 4 }}>Check all</button>
                <button onClick={() => setApproved(new Set(candidates.filter(c => !c.conflict).map(c => c.key)))} style={{ background: 'transparent', color: 'rgba(245,240,232,.7)', border: '1px solid rgba(255,255,255,.15)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: '5px 10px', borderRadius: 4 }}>Skip conflicts</button>
                <button onClick={() => setApproved(new Set())} style={{ background: 'transparent', color: 'rgba(245,240,232,.7)', border: '1px solid rgba(255,255,255,.15)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: '5px 10px', borderRadius: 4 }}>Uncheck all</button>
              </div>
            </div>

            <div style={{ maxHeight: 500, overflowY: 'auto', background: 'rgba(0,0,0,.25)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 6 }}>
              {groupedForReview.map(g => (
                <div key={`${g.city}::${g.category}`} style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                  <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,.03)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'rgba(245,240,232,.65)' }}>
                    {g.city} · {g.category} <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'rgba(245,240,232,.4)', marginLeft: 6 }}>{g.items.length} candidate{g.items.length === 1 ? '' : 's'}</span>
                  </div>
                  {g.items.map(c => {
                    const on = approved.has(c.key)
                    return (
                      <label key={c.key} style={{ display: 'flex', gap: 10, padding: '9px 12px', cursor: 'pointer', borderTop: '1px solid rgba(255,255,255,.03)', background: on ? 'rgba(196,146,42,.04)' : 'transparent' }}>
                        <input type="checkbox" checked={on} onChange={() => toggleApproved(c.key)} style={{ margin: '3px 0 0', accentColor: 'var(--gold)' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)' }}>{c.raw.name}</span>
                            {typeof c.raw.quality_score === 'number' && (
                              <span style={{ fontSize: 10, color: 'rgba(245,240,232,.55)', fontFamily: 'var(--font-mono, Menlo, monospace)' }}>q{c.raw.quality_score}</span>
                            )}
                            {typeof c.raw.rating === 'number' && c.raw.rating > 0 && (
                              <span style={{ fontSize: 10, color: 'rgba(245,240,232,.55)', fontFamily: 'var(--font-mono, Menlo, monospace)' }}>★{c.raw.rating.toFixed(1)}</span>
                            )}
                            {c.conflict && (
                              <span title={`${c.conflict.reason} → ${c.conflict.name}`} style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: 'rgba(255,120,80,.15)', color: '#ffb877', border: '1px solid rgba(255,120,80,.35)' }}>
                                ⚠ likely duplicate of {c.conflict.name}
                              </span>
                            )}
                          </div>
                          {c.raw.description && (
                            <div style={{ fontSize: 12, color: 'rgba(245,240,232,.55)', marginTop: 3, lineHeight: 1.45 }}>
                              {c.raw.description.length > 220 ? c.raw.description.slice(0, 220) + '…' : c.raw.description}
                            </div>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>
              ))}
              {candidates.length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', fontSize: 13, color: 'rgba(245,240,232,.5)' }}>
                  Preview returned no candidates. Try different cities or categories.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button onClick={resetAll} style={{ padding: '9px 18px', borderRadius: 6, background: 'transparent', color: 'rgba(245,240,232,.7)', border: '1px solid rgba(255,255,255,.15)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                ← Start over
              </button>
              <button
                onClick={runCommit}
                disabled={approved.size === 0}
                style={{ padding: '9px 22px', borderRadius: 6, background: approved.size === 0 ? 'rgba(196,146,42,.3)' : 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 13, fontWeight: 600, cursor: approved.size === 0 ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                ✓ Add {approved.size} to map
              </button>
            </div>
          </div>
        )}

        {/* Done — commit summary. */}
        {phase === 'done' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ padding: '12px 14px', background: 'rgba(74,103,65,.1)', border: '1px solid rgba(74,103,65,.25)', borderRadius: 8, color: 'var(--cream)', fontSize: 13, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>✓ Scan complete</div>
              <div style={{ color: 'rgba(245,240,232,.7)' }}>
                {totalInserted} added · {totalSkipped} skipped by server-side dedup · {totalCommitErrors} error{totalCommitErrors === 1 ? '' : 's'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={resetAll} style={{ padding: '9px 22px', borderRadius: 6, background: 'var(--gold)', color: 'var(--ink)', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                🔄 New scan
              </button>
            </div>
          </div>
        )}

        {/* Live log — shown across previewing / committing / done. */}
        {(queryResults.length > 0 || commitResults.length > 0) && (
          <div
            ref={logRef}
            style={{ maxHeight: 200, overflowY: 'auto', background: 'rgba(0,0,0,.25)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 6, padding: '10px 12px', fontFamily: 'var(--font-mono, Menlo, monospace)', fontSize: 11.5, lineHeight: 1.55 }}
          >
            {queryResults.map((r, i) => (
              <div key={`q${i}`} style={{ marginBottom: 4 }}>
                <span style={{ color: r.ok ? 'var(--gold)' : 'var(--rust)', fontWeight: 600 }}>{r.ok ? 'PREVIEW ✓' : 'PREVIEW ✗'}</span>{' '}
                <span style={{ color: 'rgba(245,240,232,.7)' }}>{r.city} — {r.category}</span>{' '}
                {r.ok
                  ? <span style={{ color: 'rgba(245,240,232,.45)' }}>{r.count} candidates{r.conflicts ? ` · ${r.conflicts} flagged` : ''}</span>
                  : <span style={{ color: '#ffb3a0' }}>{r.error}</span>}
              </div>
            ))}
            {commitResults.map((r, i) => (
              <div key={`c${i}`} style={{ marginBottom: 4 }}>
                <span style={{ color: r.ok ? 'var(--sage)' : 'var(--rust)', fontWeight: 600 }}>{r.ok ? 'COMMIT ✓' : 'COMMIT ✗'}</span>{' '}
                <span style={{ color: 'rgba(245,240,232,.7)' }}>{r.city} — {r.category}</span>{' '}
                {r.ok
                  ? <span style={{ color: 'rgba(245,240,232,.45)' }}>+{r.inserted?.length ?? 0} added · {r.skipped?.length ?? 0} skipped{r.errors && r.errors.length > 0 ? ` · ${r.errors.length} errors` : ''}</span>
                  : <span style={{ color: '#ffb3a0' }}>{r.error}</span>}
              </div>
            ))}
            {aborted && <div style={{ color: '#ffb3a0', marginTop: 4 }}>— Aborted —</div>}
          </div>
        )}

      </div>
    </div>
  )
}
