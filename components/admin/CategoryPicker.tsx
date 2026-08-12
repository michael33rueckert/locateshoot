'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { SCAN_CATEGORY_NAMES } from '@/lib/scan-locations'

// Category chooser for admin location forms. Loads the canonical
// scanner categories + every distinct category value already present
// in the locations table, dedups them, and shows a <select>. The
// "+ Add new category…" option flips the picker into a text input
// so a genuinely new category can be typed, but the default flow
// discourages silent typo-duplicates ("Parks & Nature" vs "Parks
// and Nature") because the exact strings on record are always at
// the top of the list.

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  border: '1px solid var(--cream-dark)', borderRadius: 4,
  fontFamily: 'inherit', fontSize: 13, outline: 'none',
  background: 'white', boxSizing: 'border-box',
}

export default function CategoryPicker({ value, onChange }: {
  value: string | null
  onChange: (v: string | null) => void
}) {
  const [dbCats, setDbCats] = useState<string[]>([])
  const [mode,   setMode]   = useState<'select' | 'text'>('select')
  const [draft,  setDraft]  = useState<string>('')

  // Pull distinct categories currently on the locations table so any
  // ad-hoc value already in the wild appears in the dropdown too —
  // otherwise editing an older row would silently re-type its
  // category as a "new" entry and fragment further.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('locations')
        .select('category')
        .not('category', 'is', null)
        .limit(2000)
      if (cancelled) return
      const seen = new Set<string>()
      for (const r of (data ?? []) as { category: string | null }[]) {
        const v = (r.category ?? '').trim()
        if (v) seen.add(v)
      }
      setDbCats(Array.from(seen).sort((a, b) => a.localeCompare(b)))
    })()
    return () => { cancelled = true }
  }, [])

  // Full option list: canonical scanner names first (in their defined
  // order), then any extra distinct DB values (sorted). Dedup so a
  // canonical name that also happens to be in the DB doesn't render
  // twice.
  const options = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const c of SCAN_CATEGORY_NAMES) { if (!seen.has(c)) { seen.add(c); out.push(c) } }
    for (const c of dbCats)              { if (!seen.has(c)) { seen.add(c); out.push(c) } }
    // The current value might be something not (yet) in either list —
    // e.g. an "+ Add new" that hasn't been saved. Make sure the
    // dropdown still reflects it so the picker isn't confusingly
    // showing "—" while the underlying value is set.
    if (value && !seen.has(value)) { seen.add(value); out.push(value) }
    return out
  }, [dbCats, value])

  if (mode === 'text') {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => {
            const v = draft.trim()
            if (v) { onChange(v) }
            // Return to select mode either way — if they typed
            // something we save it; if not, drop back to whatever
            // was there before.
            setMode('select')
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() }
            if (e.key === 'Escape') { setDraft(''); setMode('select') }
          }}
          placeholder="Type a new category and press Enter"
          style={inp}
        />
        <button
          type="button"
          onMouseDown={e => e.preventDefault() /* keep input focused so onBlur runs */}
          onClick={() => setMode('select')}
          style={{ padding: '0 12px', borderRadius: 4, border: '1px solid var(--cream-dark)', background: 'white', color: 'var(--ink-soft)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
        >
          ← Pick
        </button>
      </div>
    )
  }

  return (
    <select
      value={value ?? ''}
      onChange={e => {
        const v = e.target.value
        if (v === '__new__') { setDraft(''); setMode('text'); return }
        onChange(v === '' ? null : v)
      }}
      style={inp}
    >
      <option value="">— none —</option>
      {options.map(c => <option key={c} value={c}>{c}</option>)}
      <option value="__new__">+ Add new category…</option>
    </select>
  )
}
