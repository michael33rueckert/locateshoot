'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import PickTemplateEditor from '@/components/PickTemplateEditor'
import TemplatePreview from '@/components/TemplatePreview'
import type { SavedTemplate } from '@/lib/pick-template'
import { PRESETS } from '@/lib/pick-template'

// Pro-tier UI for managing multiple named Location Guide templates.
// Lists the photographer's saved templates, lets them pick which one to
// edit (or add a new one), set a default, rename, or delete.
//
// The actual styling editor (font / colors / header / background) is
// PickTemplateEditor — this component owns the list + persistence
// metadata (name, default flag) and renders the editor for whichever
// template is currently selected.
//
// Falls back gracefully when the pick_templates migration hasn't been
// applied: shows an inline notice and disables the multi-template UI.

interface Props {
  userId: string
  isPro:  boolean
  // Viewer's plan. Currently unused inside the panel (the non-Pro
  // fallback is a quiet placeholder rather than an UpgradePrompt) but
  // kept on the API so callers don't have to remove it if we ever
  // restore plan-aware copy here.
  currentPlan?: 'free' | 'starter' | 'pro'
  // Studio logo URL + change callback. Forwarded to the active
  // PickTemplateEditor so the logo upload UI can sit next to the
  // logo placement controls. The logo lives globally on the
  // photographer's profile (not per-template), so the callback lets
  // the parent page mirror updates into its own sidebar avatar.
  logoUrl?:    string | null
  onLogoChange?: (url: string | null) => void
}

export default function SavedTemplatesPanel({ userId, isPro, logoUrl, onLogoChange }: Props) {
  const [templates, setTemplates] = useState<SavedTemplate[]>([])
  const [activeId,  setActiveId]  = useState<string | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [migrationMissing, setMigrationMissing] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [renaming,  setRenaming]  = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // When true the panel shows the starting-template gallery instead
  // of the saved-templates list. The "+ New template" button toggles
  // this on; picking a preset (or "Blank template") closes it.
  const [showGallery, setShowGallery] = useState(false)

  const load = useCallback(async () => {
    if (!userId || !isPro) return
    setLoading(true); setError(null)
    const { data, error } = await supabase
      .from('pick_templates')
      .select('id,user_id,name,config,is_default,created_at,updated_at')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false })
    if (error) {
      // Most likely the migration 20260426_pick_templates hasn't been
      // applied yet — Supabase returns a 42P01-class "relation does
      // not exist" error. Set a flag so we render a notice instead of
      // the picker UI.
      if (/relation .* does not exist|pick_templates/.test(error.message)) {
        setMigrationMissing(true)
      } else {
        setError(error.message)
      }
      setLoading(false)
      return
    }

    let rows = (data ?? []) as SavedTemplate[]

    // Auto-provision a starting template for new Pro users. Empty
    // config renders as DEFAULT_TEMPLATE (the cream + gold classic
    // look), so a brand-new account can send a Location Guide without
    // ever touching the template editor — and the Create Location
    // Guide modal's template dropdown has at least one option from
    // day one. Existing users with templates skip this branch.
    if (rows.length === 0) {
      const ins = await supabase
        .from('pick_templates')
        .insert({ user_id: userId, name: 'Studio template', config: {}, is_default: true })
        .select('id,user_id,name,config,is_default,created_at,updated_at')
        .single()
      if (ins.error) {
        setError(ins.error.message)
      } else if (ins.data) {
        rows = [ins.data as SavedTemplate]
      }
    }

    setTemplates(rows)
    if (rows.length > 0 && !activeId) setActiveId(rows[0].id)
    setLoading(false)
  }, [userId, isPro, activeId])

  useEffect(() => { load() }, [load])

  async function createFromPreset(presetId: string | null) {
    setError(null); setShowGallery(false)
    const preset = presetId ? PRESETS.find(p => p.id === presetId) : null
    // First template a user adds becomes default automatically. After
    // that, new templates start non-default — they have to explicitly
    // promote one.
    const isFirst = templates.length === 0
    const name    = preset ? preset.name : `Custom template ${templates.length + 1}`
    const config  = preset ? preset.config : {}
    const { data, error } = await supabase
      .from('pick_templates')
      .insert({ user_id: userId, name, config, is_default: isFirst })
      .select('id,user_id,name,config,is_default,created_at,updated_at')
      .single()
    if (error || !data) { setError(error?.message ?? 'Could not add template'); return }
    const next = [data as SavedTemplate, ...templates]
    setTemplates(next)
    setActiveId(data.id)
    // Auto-rename only when the user picked Blank — preset names are
    // already meaningful so they don't need to be edited up front.
    if (!preset) {
      setRenaming(data.id)
      setRenameValue(name)
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Delete this template? Any Location Guides using it will fall back to your default template (or the unbranded default if none).')) return
    const { error } = await supabase.from('pick_templates').delete().eq('id', id)
    if (error) { setError(error.message); return }
    const next = templates.filter(t => t.id !== id)
    setTemplates(next)
    if (activeId === id) setActiveId(next[0]?.id ?? null)
  }

  async function setAsDefault(id: string) {
    setError(null)
    // Two-step: clear any existing default for this user, then set the
    // new one. Wrapped in two updates because Supabase doesn't support
    // arbitrary multi-row update statements via the JS client. The
    // partial unique index in the migration would catch a race, but
    // sequential calls from a single client are fine in practice.
    const clear = await supabase.from('pick_templates').update({ is_default: false }).eq('user_id', userId).eq('is_default', true)
    if (clear.error) { setError(clear.error.message); return }
    const set = await supabase.from('pick_templates').update({ is_default: true }).eq('id', id)
    if (set.error) { setError(set.error.message); return }
    setTemplates(prev => prev.map(t => ({ ...t, is_default: t.id === id })))
  }

  async function renameTemplate(id: string, name: string) {
    const trimmed = name.trim().slice(0, 80)
    if (!trimmed) { setRenaming(null); return }
    const { error } = await supabase.from('pick_templates').update({ name: trimmed }).eq('id', id)
    if (error) { setError(error.message); return }
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, name: trimmed } : t))
    setRenaming(null)
  }

  // When the editor saves a new config, patch our local state so the
  // saved-X-ago hint stays accurate without a re-fetch.
  function handleConfigChange(id: string, next: any) {
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, config: next, updated_at: new Date().toISOString() } : t))
  }

  if (!isPro) {
    // Preview mode: render the same preset gallery + a panel-size
    // template preview that Pro users see, but visually grayed out
    // and non-interactive so the photographer can see exactly what
    // the upgrade unlocks. The Branding tab already hosts the
    // dual-plan UpgradePrompt at the top — no need for a duplicate
    // upgrade card here.
    const featuredPreset = PRESETS[0] // 'classic-editorial' as the default panel preview
    return (
      <div style={{ position: 'relative', opacity: 0.6, filter: 'grayscale(20%)', userSelect: 'none' }}>
        <div style={{ pointerEvents: 'none' }} aria-hidden="true">
          <div style={{ background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10, padding: '1.25rem' }}>
            <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>🎨 Starter templates</div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.5, marginBottom: '1rem' }}>
              Pick from {PRESETS.length} preset styles or build your own from scratch — every template is fully editable (layout, font, colors, header, background image).
            </div>

            {/* Preset gallery — same thumbnails as the Pro 'New
                template' picker, just non-clickable here. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: '1rem' }}>
              {PRESETS.map(preset => (
                <div
                  key={preset.id}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 6,
                    padding: 8, borderRadius: 8,
                    border: '1px solid var(--cream-dark)', background: 'white',
                    textAlign: 'left',
                  }}
                >
                  <TemplatePreview template={preset.config} variant="thumb" studioName="Studio" intro="Pick your location" />
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', padding: '0 2px' }}>{preset.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.4, padding: '0 2px' }}>{preset.description}</div>
                </div>
              ))}
            </div>

            {/* Panel-size live preview of the featured preset so the
                photographer sees what the rendered Location Guide
                actually looks like at full width, not just thumbs. */}
            <div style={{ borderTop: '1px solid var(--cream-dark)', paddingTop: '1rem' }}>
              <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 8 }}>Preview · {featuredPreset.name}</div>
              <TemplatePreview template={featuredPreset.config} variant="panel" studioName="Your Studio" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (migrationMissing) {
    return (
      <div style={{ background: 'rgba(196,146,42,.08)', border: '1px solid rgba(196,146,42,.25)', borderRadius: 10, padding: '1.25rem' }}>
        <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>🎨 Location Guide templates</div>
        <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 300, lineHeight: 1.55 }}>
          Run migration <code style={{ background: 'var(--cream)', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>20260426_pick_templates.sql</code> in Supabase to enable saved templates.
        </div>
      </div>
    )
  }

  const active = templates.find(t => t.id === activeId) ?? null

  return (
    <div style={{ background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10, padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 2 }}>🎨 Location Guide templates</div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.5 }}>Save multiple templates and pick one per Location Guide. Mark one as your default — guides without an explicit template fall back to it.</div>
        </div>
        <button onClick={() => setShowGallery(true)} style={{ padding: '8px 14px', borderRadius: 4, background: 'var(--ink)', color: 'var(--cream)', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>+ New template</button>
      </div>

      {/* Starting-template gallery — shown when "+ New template" is
          clicked. Each preset is a one-click apply that fills in the
          full config (font/colors/layout/header) for the new template,
          which the photographer can then edit further. "Blank
          template" creates an unconfigured row that defaults to the
          existing Pick page render until edited. */}
      {showGallery && (
        <div style={{ marginBottom: '1.25rem', padding: '1rem', background: 'var(--cream)', border: '1px solid var(--cream-dark)', borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 2 }}>Pick a starting template</div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300 }}>You'll be able to customize everything after — font, colors, layout, header.</div>
            </div>
            <button onClick={() => setShowGallery(false)} style={{ background: 'transparent', color: 'var(--ink-soft)', border: 'none', padding: 0, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>Cancel</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            {PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => createFromPreset(preset.id)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 6,
                  padding: 8, borderRadius: 8, cursor: 'pointer',
                  border: '1px solid var(--cream-dark)', background: 'white',
                  textAlign: 'left', fontFamily: 'inherit',
                  transition: 'all .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(196,146,42,.15)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--cream-dark)'; e.currentTarget.style.boxShadow = 'none' }}
              >
                <TemplatePreview template={preset.config} variant="thumb" studioName="Studio" intro="Pick your location" />
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', padding: '0 2px' }}>{preset.name}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.4, padding: '0 2px' }}>{preset.description}</div>
              </button>
            ))}
            {/* Blank option — start from defaults and build from scratch. */}
            <button
              type="button"
              onClick={() => createFromPreset(null)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', justifyContent: 'center',
                padding: 12, borderRadius: 8, cursor: 'pointer',
                border: '1px dashed var(--sand)', background: 'transparent',
                fontFamily: 'inherit', minHeight: 140,
                transition: 'all .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.background = 'rgba(196,146,42,.04)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--sand)'; e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{ fontSize: 32, color: 'var(--ink-soft)', lineHeight: 1 }}>+</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Blank template</div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.4, textAlign: 'center' }}>Start from scratch.</div>
            </button>
          </div>
        </div>
      )}

      {/* Template list — each row is clickable to switch the editor
          below to that template. The active one is highlighted. New
          Pro users always have at least one template (auto-provisioned
          on first load), so the "no templates yet" empty state from
          before is unreachable in practice; the only zero-template
          state now is during the brief loading window. */}
      {loading ? (
        <div style={{ padding: '1rem', textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)' }}>Loading templates…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: '1.25rem' }}>
          {templates.map(t => {
            const isActive = activeId === t.id
            const isRenaming = renaming === t.id
            return (
              <div
                key={t.id}
                onClick={() => { if (!isRenaming) setActiveId(t.id) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 6,
                  border: `1.5px solid ${isActive ? 'var(--gold)' : 'var(--cream-dark)'}`,
                  background: isActive ? 'rgba(196,146,42,.06)' : 'white',
                  cursor: isRenaming ? 'text' : 'pointer',
                  transition: 'all .12s',
                }}
              >
                {isRenaming ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={() => renameTemplate(t.id, renameValue)}
                    onKeyDown={e => { if (e.key === 'Enter') renameTemplate(t.id, renameValue); if (e.key === 'Escape') setRenaming(null) }}
                    style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--gold)', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
                  />
                ) : (
                  <div
                    onDoubleClick={e => { e.stopPropagation(); setRenaming(t.id); setRenameValue(t.name) }}
                    style={{ flex: 1, fontSize: 13, fontWeight: isActive ? 500 : 400, color: 'var(--ink)' }}
                    title="Double-click to rename"
                  >
                    {t.name}
                  </div>
                )}
                {t.is_default && (
                  <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: 'rgba(74,103,65,.12)', color: 'var(--sage)', border: '1px solid rgba(74,103,65,.25)' }}>Default</span>
                )}
                {!t.is_default && (
                  <button
                    onClick={e => { e.stopPropagation(); setAsDefault(t.id) }}
                    style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid var(--cream-dark)', background: 'white', fontSize: 10, fontWeight: 500, color: 'var(--ink-soft)', cursor: 'pointer', fontFamily: 'inherit' }}
                  >Make default</button>
                )}
                <button
                  onClick={e => { e.stopPropagation(); setRenaming(t.id); setRenameValue(t.name) }}
                  style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid var(--cream-dark)', background: 'white', fontSize: 10, fontWeight: 500, color: 'var(--ink-soft)', cursor: 'pointer', fontFamily: 'inherit' }}
                >Rename</button>
                <button
                  onClick={e => { e.stopPropagation(); deleteTemplate(t.id) }}
                  style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(181,75,42,.2)', background: 'rgba(181,75,42,.06)', fontSize: 10, fontWeight: 500, color: 'var(--rust)', cursor: 'pointer', fontFamily: 'inherit' }}
                >Delete</button>
              </div>
            )
          })}
        </div>
      )}

      {/* Active template editor — only shown when there's something to
          edit. The PickTemplateEditor handles its own debounced save
          to pick_templates by id. */}
      {active && (
        <div style={{ borderTop: '1px solid var(--cream-dark)', paddingTop: '1rem' }}>
          <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 8 }}>Editing: {active.name}</div>
          <PickTemplateEditor
            key={active.id}
            userId={userId}
            templateId={active.id}
            initial={active.config}
            isPro={isPro}
            logoUrl={logoUrl}
            onChange={next => handleConfigChange(active.id, next)}
            onLogoChange={onLogoChange}
          />
        </div>
      )}

      {error && <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(181,75,42,.08)', border: '1px solid rgba(181,75,42,.2)', borderRadius: 6, fontSize: 12, color: 'var(--rust)' }}>{error}</div>}

      <div style={{ marginTop: '1rem', fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300 }}>
        Pick a template per guide in the <Link href="/dashboard" style={{ color: 'var(--gold)' }}>Location Guide editor</Link>.
      </div>
    </div>
  )
}
