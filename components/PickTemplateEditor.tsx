'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  DEFAULT_TEMPLATE,
  FONT_OPTIONS,
  type PickTemplate,
  type LayoutKind,
  isValidHex,
  googleFontHref,
} from '@/lib/pick-template'
import TemplatePreview from '@/components/TemplatePreview'
import { validateImageUpload } from '@/lib/upload-validate'

// Pro-only Location Guide template editor. Saves debounced as the
// photographer edits — no manual Save button.
//
// Two persistence modes:
//   1. templateId set    → updates pick_templates.config for that row
//      (the new multi-template world managed by SavedTemplatesPanel).
//   2. templateId null   → legacy single-template mode, writes to
//      profiles.pick_template. Kept for the transition period before
//      the pick_templates migration lands.

interface Props {
  userId:     string
  templateId?: string | null     // when set, write to pick_templates by id
  initial:    PickTemplate | null | undefined
  isPro:      boolean
  onChange?:  (next: PickTemplate) => void
}

export default function PickTemplateEditor({ userId, templateId, initial, isPro, onChange }: Props) {
  const [tpl, setTpl]       = useState<PickTemplate>(initial ?? {})
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  // Color text-input drafts so the user can type a hex value freely
  // without each keystroke triggering validation feedback. Validate on
  // blur or when they hit a valid hex.
  const colorKeys = ['background', 'text', 'accent', 'accentText'] as const
  type ColorKey = typeof colorKeys[number]
  const [colorDrafts, setColorDrafts] = useState<Record<ColorKey, string>>({
    background: tpl.colors?.background ?? DEFAULT_TEMPLATE.colors.background,
    text:       tpl.colors?.text       ?? DEFAULT_TEMPLATE.colors.text,
    accent:     tpl.colors?.accent     ?? DEFAULT_TEMPLATE.colors.accent,
    accentText: tpl.colors?.accentText ?? DEFAULT_TEMPLATE.colors.accentText,
  })

  // Debounced save — coalesce a burst of edits (e.g. dragging a color
  // slider) into a single DB write at most every 600ms.
  const saveTimer = useRef<any>(null)
  function scheduleSave(next: PickTemplate) {
    setError(null)
    onChange?.(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(next), 600)
  }
  async function save(payload: PickTemplate) {
    setSaving(true)
    const { error } = templateId
      ? await supabase.from('pick_templates').update({ config: payload }).eq('id', templateId)
      : await supabase.from('profiles').update({ pick_template: payload }).eq('id', userId)
    setSaving(false)
    if (error) {
      // Most likely cause: the relevant migration hasn't been applied
      // yet — pick_templates table missing OR profiles.pick_template
      // column missing (depending on which path we took above).
      if (/pick_template|relation .* does not exist/.test(error.message)) {
        setError('Template storage missing — run the latest migrations in Supabase.')
      } else {
        setError(error.message)
      }
      return
    }
    setSavedAt(Date.now())
  }

  function setLayout(layout: LayoutKind) {
    const next = { ...tpl, layout }
    setTpl(next); scheduleSave(next)
  }
  function setFont(font: string) {
    const next = { ...tpl, font }
    setTpl(next); scheduleSave(next)
  }
  function setColor(key: ColorKey, value: string) {
    setColorDrafts(prev => ({ ...prev, [key]: value }))
    if (!isValidHex(value)) return
    const next: PickTemplate = { ...tpl, colors: { ...(tpl.colors ?? {}), [key]: value } }
    setTpl(next); scheduleSave(next)
  }
  function setHeader<K extends keyof NonNullable<PickTemplate['header']>>(key: K, value: NonNullable<PickTemplate['header']>[K]) {
    const next: PickTemplate = { ...tpl, header: { ...(tpl.header ?? {}), [key]: value } }
    setTpl(next); scheduleSave(next)
  }
  function setBackground(type: 'none' | 'image', imageUrl?: string) {
    const next: PickTemplate = { ...tpl, background: { type, imageUrl: imageUrl ?? tpl.background?.imageUrl ?? '' } }
    setTpl(next); scheduleSave(next)
  }

  function resetAll() {
    if (!confirm('Reset all template settings to default?')) return
    setTpl({})
    setColorDrafts({
      background: DEFAULT_TEMPLATE.colors.background,
      text:       DEFAULT_TEMPLATE.colors.text,
      accent:     DEFAULT_TEMPLATE.colors.accent,
      accentText: DEFAULT_TEMPLATE.colors.accentText,
    })
    save({})
  }

  // Background image upload — same Supabase Storage bucket the
  // photographer's logo + photos use. Stored under <userId>/template/.
  // SVG is blocked by validateImageUpload — SVG can embed <script>
  // and would execute when the file is served via getPublicUrl().
  const fileRef = useRef<HTMLInputElement>(null)
  async function handleBgUpload(file: File) {
    setError(null)
    const v = validateImageUpload(file)
    if (!v.ok) { setError(v.message); return }
    const path = `${userId}/template/bg-${Date.now()}.${v.ext}`
    const { error: ue } = await supabase.storage.from('location-photos').upload(path, file, { contentType: v.contentType })
    if (ue) { setError(ue.message); return }
    const { data: pub } = supabase.storage.from('location-photos').getPublicUrl(path)
    setBackground('image', pub.publicUrl)
  }

  // Inject a Google Fonts <link> for the chosen font so the preview
  // (and the layout mockups below) actually render in that face. The
  // <link> stays in the document head — when the font changes we
  // append a new one and remove the old. Browsers de-dupe identical
  // hrefs, so flipping back to a previously-used font is instant.
  const activeFont = tpl.font ?? DEFAULT_TEMPLATE.font
  useEffect(() => {
    if (typeof document === 'undefined') return
    const href = googleFontHref(activeFont)
    if (!href) return
    let link = document.querySelector(`link[data-pte-font="${activeFont}"]`) as HTMLLinkElement | null
    if (!link) {
      link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = href
      link.setAttribute('data-pte-font', activeFont)
      document.head.appendChild(link)
    }
  }, [activeFont])

  // Note: no resync-from-initial effect here. SavedTemplatesPanel uses
  // <PickTemplateEditor key={active.id}> to remount on template switch,
  // which already re-seeds local state from the new initial. An effect
  // that watched individual color/font deps would loop: every save
  // calls onChange → parent updates templates → new initial flows in →
  // effect overwrites the user's draft mid-edit.

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 5 }
  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--cream-dark)', borderRadius: 4, fontFamily: 'var(--font-dm-sans),sans-serif', fontSize: 14, color: 'var(--ink)', background: 'white', outline: 'none' }

  if (!isPro) {
    return (
      <div style={{ background: 'var(--cream)', border: '1px solid var(--sand)', borderRadius: 10, padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>🎨 Location Guide template</span>
          <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, background: 'rgba(196,146,42,.12)', color: 'var(--gold)', border: '1px solid rgba(196,146,42,.2)', fontWeight: 500 }}>Pro only</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.55 }}>
          Customize the layout, font, colors, and header of your Location Guides so client-facing pages match your studio's branding. Available on the Pro plan.
        </div>
      </div>
    )
  }

  const layouts: { value: LayoutKind; label: string; desc: string }[] = [
    { value: 'card',     label: 'Card',          desc: 'Tall photo per location with name + meta below.' },
    { value: 'grid',     label: 'Grid',          desc: 'Two-column tiled gallery — fits more on screen.' },
    { value: 'magazine', label: 'Magazine',      desc: 'Hero photo on top, smaller cards beneath.' },
    { value: 'list',     label: 'Compact list',  desc: 'Small thumbnail on the left, info + button on the right.' },
    { value: 'minimal',  label: 'Minimal',       desc: 'Text-forward rows with thumbnail + view link.' },
  ]
  const currentLayout = tpl.layout ?? DEFAULT_TEMPLATE.layout

  // Build a "live" template snapshot from the in-editor state — uses
  // valid color drafts when available so the preview repaints on every
  // valid color tweak without waiting for the debounced save. Falls
  // back to the resolved template for invalid drafts so the preview
  // never breaks mid-edit.
  const livePreview: PickTemplate = {
    ...tpl,
    colors: {
      ...(tpl.colors ?? {}),
      background: isValidHex(colorDrafts.background) ? colorDrafts.background : tpl.colors?.background,
      text:       isValidHex(colorDrafts.text)       ? colorDrafts.text       : tpl.colors?.text,
      accent:     isValidHex(colorDrafts.accent)     ? colorDrafts.accent     : tpl.colors?.accent,
      accentText: isValidHex(colorDrafts.accentText) ? colorDrafts.accentText : tpl.colors?.accentText,
    },
  }

  return (
    <div style={{ background: 'white', border: '1px solid var(--cream-dark)', borderRadius: 10, padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 2 }}>🎨 Location Guide template</div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 300 }}>Match your Location Guides to your studio's branding. Saves automatically as you edit.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--ink-soft)' }}>
          {saving ? '💾 Saving…' : savedAt ? '✓ Saved' : ''}
          <button onClick={resetAll} style={{ padding: '5px 10px', borderRadius: 4, border: '1px solid var(--cream-dark)', background: 'white', fontSize: 11, color: 'var(--ink-soft)', cursor: 'pointer', fontFamily: 'inherit' }}>Reset</button>
        </div>
      </div>

      {/* Layout — thumbnail cards rendered with TemplatePreview so each
          option shows the actual layout proportions + the photographer's
          current colors and font. Click a card to apply that layout. */}
      <div style={{ marginBottom: '1.25rem' }}>
        <label style={labelStyle}>Layout</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          {layouts.map(opt => {
            const active = currentLayout === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setLayout(opt.value)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 8,
                  padding: 8, borderRadius: 8, cursor: 'pointer',
                  border: `2px solid ${active ? 'var(--gold)' : 'var(--cream-dark)'}`,
                  background: active ? 'rgba(196,146,42,.05)' : 'white',
                  transition: 'all .15s', textAlign: 'left',
                  fontFamily: 'inherit',
                }}
              >
                <TemplatePreview template={{ ...livePreview, layout: opt.value }} variant="thumb" studioName="Studio" intro="Pick a location" />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 2px' }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, border: `1.5px solid ${active ? 'var(--gold)' : 'var(--sand)'}`, background: active ? 'var(--gold)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'var(--ink)' }}>
                    {active ? '✓' : ''}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{opt.label}</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 300, lineHeight: 1.4, padding: '0 2px' }}>{opt.desc}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Font */}
      <div style={{ marginBottom: '1.25rem' }}>
        <label style={labelStyle}>Font (used for headers + names)</label>
        <select value={tpl.font ?? DEFAULT_TEMPLATE.font} onChange={e => setFont(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
          {FONT_OPTIONS.map(f => (
            <option key={f.name} value={f.name} style={{ fontFamily: f.name }}>
              {f.name}
            </option>
          ))}
        </select>
        <div style={{ marginTop: 8, padding: '14px 16px', background: 'var(--cream)', borderRadius: 6, border: '1px solid var(--cream-dark)' }}>
          <div style={{ fontFamily: `'${tpl.font ?? DEFAULT_TEMPLATE.font}', serif`, fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 2 }}>
            Sample headline
          </div>
          <div style={{ fontFamily: `'${tpl.font ?? DEFAULT_TEMPLATE.font}', serif`, fontSize: 13, color: 'var(--ink-soft)' }}>
            And a smaller line of text underneath.
          </div>
        </div>
      </div>

      {/* Colors */}
      <div style={{ marginBottom: '1.25rem' }}>
        <label style={labelStyle}>Colors</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {colorKeys.map(key => {
            const labels: Record<ColorKey, string> = {
              background: 'Background',
              text:       'Body text',
              accent:     'Accent (buttons / headers)',
              accentText: 'Accent text (button labels)',
            }
            const draft = colorDrafts[key]
            const valid = isValidHex(draft)
            return (
              <div key={key}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)', marginBottom: 5 }}>{labels[key]}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="color"
                    value={valid ? draft : DEFAULT_TEMPLATE.colors[key]}
                    onChange={e => setColor(key, e.target.value)}
                    aria-label={`${labels[key]} color picker`}
                    style={{ width: 40, height: 36, border: '1px solid var(--cream-dark)', borderRadius: 4, cursor: 'pointer', padding: 2, background: 'white' }}
                  />
                  <input
                    type="text"
                    value={draft}
                    onChange={e => setColor(key, e.target.value)}
                    placeholder="#hex"
                    style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 13, padding: '8px 10px', borderColor: valid ? 'var(--cream-dark)' : 'rgba(181,75,42,.4)' }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Header — logo placement + intro override. The "show studio
          name" toggle lives in the Branding section above (one global
          setting that applies to all guides), not duplicated here. */}
      <div style={{ marginBottom: '1.25rem' }}>
        <label style={labelStyle}>Header</label>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)', marginBottom: 5 }}>Logo placement</div>
          <select
            value={tpl.header?.logoPlacement ?? DEFAULT_TEMPLATE.header.logoPlacement}
            onChange={e => setHeader('logoPlacement', e.target.value as 'left' | 'center' | 'hidden')}
            style={{ ...inputStyle, cursor: 'pointer', maxWidth: 240 }}
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="hidden">Hide logo</option>
          </select>
        </div>
        {/* Logo size — pill row of small/medium/large. Hidden when
            the logo itself is hidden, since size is moot then. */}
        {(tpl.header?.logoPlacement ?? DEFAULT_TEMPLATE.header.logoPlacement) !== 'hidden' && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)', marginBottom: 5 }}>Logo size</div>
            <div style={{ display: 'inline-flex', gap: 6 }}>
              {(['small', 'medium', 'large'] as const).map(size => {
                const active = (tpl.header?.logoSize ?? DEFAULT_TEMPLATE.header.logoSize) === size
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setHeader('logoSize', size)}
                    style={{
                      padding: '7px 14px', borderRadius: 4,
                      border: `1.5px solid ${active ? 'var(--gold)' : 'var(--cream-dark)'}`,
                      background: active ? 'rgba(196,146,42,.08)' : 'white',
                      color: 'var(--ink)', cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: 12,
                      fontWeight: active ? 600 : 400,
                      textTransform: 'capitalize',
                    }}
                  >{size}</button>
                )
              })}
            </div>
          </div>
        )}
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)', marginBottom: 5 }}>Intro line (optional)</div>
          <input
            type="text"
            value={tpl.header?.intro ?? ''}
            onChange={e => setHeader('intro', e.target.value)}
            placeholder="Default: from your Branding tab tagline"
            style={inputStyle}
          />
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4, fontWeight: 300 }}>Override the welcome line shown above the locations. Leave blank to use your branding tagline.</div>
        </div>
      </div>

      {/* Background */}
      <div>
        <label style={labelStyle}>Background</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          {(['none', 'image'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setBackground(t)}
              style={{
                padding: '7px 14px', borderRadius: 4, fontSize: 12, fontWeight: 500,
                border: `1.5px solid ${(tpl.background?.type ?? 'none') === t ? 'var(--gold)' : 'var(--cream-dark)'}`,
                background: (tpl.background?.type ?? 'none') === t ? 'rgba(196,146,42,.05)' : 'white',
                color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {t === 'none' ? 'Solid color' : 'Image'}
            </button>
          ))}
        </div>
        {tpl.background?.type === 'image' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--cream)', border: '1px solid var(--cream-dark)', borderRadius: 6 }}>
            {tpl.background.imageUrl ? (
              <>
                <div style={{ width: 60, height: 40, borderRadius: 4, overflow: 'hidden', flexShrink: 0, background: 'var(--cream-dark)' }}>
                  <img src={tpl.background.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <button onClick={() => setBackground('image', '')} style={{ padding: '5px 10px', borderRadius: 4, background: 'rgba(181,75,42,.08)', color: 'var(--rust)', border: '1px solid rgba(181,75,42,.2)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
              </>
            ) : (
              <button onClick={() => fileRef.current?.click()} style={{ padding: '7px 14px', borderRadius: 4, background: 'var(--ink)', color: 'var(--cream)', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Upload background image</button>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) handleBgUpload(f); if (fileRef.current) fileRef.current.value = '' }} style={{ display: 'none' }} />
          </div>
        )}
      </div>

      {/* Live preview — full-width mock of how the Pick page will
          render with the current settings. Updates on every keystroke
          so the photographer sees changes immediately without having
          to open a real share link in another tab. */}
      <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--cream-dark)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <label style={labelStyle}>Live preview</label>
          <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontStyle: 'italic' }}>How clients will see it</span>
        </div>
        <TemplatePreview template={livePreview} variant="panel" />
      </div>

      {error && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(181,75,42,.08)', border: '1px solid rgba(181,75,42,.2)', borderRadius: 6, fontSize: 12, color: 'var(--rust)' }}>{error}</div>
      )}
    </div>
  )
}
