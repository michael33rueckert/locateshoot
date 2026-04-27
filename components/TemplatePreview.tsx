'use client'

import type { PickTemplate, LayoutKind } from '@/lib/pick-template'
import { resolveTemplate, googleFontHref } from '@/lib/pick-template'
import { useEffect } from 'react'

// Live mock of the Location Guide pick page using a template's config —
// a real header + sample location cards in the chosen layout, with all
// the template's font/colors/header settings applied. The photographer
// sees their changes reflected here in real time as they edit.
//
// Two flavors:
//   - "thumb"  → small (~140px tall), used in preset gallery + saved-
//                template picker thumbnails. Compact mockup with 2-3
//                placeholder cards.
//   - "panel"  → full-size (the editor's preview pane). Closer to
//                the real Pick page proportions.
//
// Renders entirely with placeholder gradients (no real photos) so it
// works without any portfolio data and stays fast on every keystroke.

export interface TemplatePreviewProps {
  template: PickTemplate | null | undefined
  variant?: 'thumb' | 'panel'
  studioName?: string
  intro?: string
}

export default function TemplatePreview({ template, variant = 'panel', studioName, intro }: TemplatePreviewProps) {
  const tpl = resolveTemplate(template)
  const fontHref = googleFontHref(tpl.font)

  // Load the chosen Google Font on the page so the preview text
  // actually renders in that face. Reuses the same data-pte-font dedupe
  // attribute as the editor so we don't double-mount.
  useEffect(() => {
    if (typeof document === 'undefined' || !fontHref) return
    const existing = document.querySelector(`link[data-pte-font="${tpl.font}"]`)
    if (existing) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = fontHref
    link.setAttribute('data-pte-font', tpl.font)
    document.head.appendChild(link)
  }, [fontHref, tpl.font])

  const isThumb = variant === 'thumb'
  // Logo size scales with the template's header.logoSize choice so
  // the live preview tracks the photographer's small/medium/large
  // selection. Tuned by hand: small ~70%, medium = baseline, large
  // ~140% so the difference reads at a glance.
  const logoSizeKey = (tpl.header.logoSize ?? 'medium') as 'small' | 'medium' | 'large'
  const logoScale   = logoSizeKey === 'small' ? 0.7 : logoSizeKey === 'large' ? 1.4 : 1
  const headerLogoSize = Math.round((isThumb ? 14 : 26) * logoScale)
  const headerHeight   = Math.max(isThumb ? 28 : 56, headerLogoSize + (isThumb ? 8 : 16))
  const titleSize = isThumb ? 9 : 18
  const introSize = isThumb ? 7 : 12
  const padding   = isThumb ? 6 : 16
  const innerGap  = isThumb ? 4 : 10
  const headerJust = tpl.header.logoPlacement === 'center' ? 'center'
                   : tpl.header.logoPlacement === 'right'  ? 'flex-end'
                   : 'flex-start'
  const showLogo  = tpl.header.logoPlacement !== 'hidden'
  // If the photographer set a custom header background, use it on
  // the preview header strip instead of the auto-derived translucent
  // bg. Falls back to the existing 85% opacity of colors.background.
  const headerBg  = tpl.header.bgColor && /^#[0-9a-f]{3,8}$/i.test(tpl.header.bgColor)
    ? tpl.header.bgColor
    : hexWithAlpha(tpl.colors.background, 0.85)

  // Resolved bg layer — image overlay or solid color from the
  // background config; falls through to the colors.background.
  const bgLayer = tpl.background.type === 'image' && tpl.background.imageUrl
    ? { backgroundImage: `url(${tpl.background.imageUrl})`, backgroundSize: 'cover' as const, backgroundPosition: 'center' as const }
    : {}

  return (
    <div
      style={{
        background: tpl.colors.background,
        color:      tpl.colors.text,
        fontFamily: `'${tpl.font}', serif`,
        borderRadius: isThumb ? 6 : 10,
        overflow: 'hidden',
        border: '1px solid rgba(0,0,0,.08)',
        ...bgLayer,
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: headerJust, gap: innerGap,
        padding: `${padding * 0.75}px ${padding}px`,
        borderBottom: `1px solid ${hexWithAlpha(tpl.colors.text, 0.08)}`,
        background: headerBg,
        height: headerHeight,
        boxSizing: 'border-box',
      }}>
        {showLogo && (
          <div style={{
            width: headerLogoSize, height: headerLogoSize, borderRadius: '50%',
            background: tpl.colors.accent, color: tpl.colors.accentText,
            fontSize: isThumb ? 8 : 13, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>L</div>
        )}
        {(studioName ?? 'Studio Name') && (
          <div style={{ fontSize: titleSize, fontWeight: 700, color: tpl.colors.text, fontFamily: 'inherit' }}>
            {studioName ?? 'Studio Name'}
          </div>
        )}
      </div>

      {/* Intro */}
      <div style={{ padding: `${padding * 0.75}px ${padding}px ${padding * 0.5}px`, fontSize: introSize, color: hexWithAlpha(tpl.colors.text, 0.7), fontStyle: 'italic' }}>
        {intro ?? tpl.header.intro ?? "Pick the location for our session"}
      </div>

      {/* Location cards in the chosen layout */}
      <LocationsLayout layout={tpl.layout} variant={variant} accent={tpl.colors.accent} accentText={tpl.colors.accentText} text={tpl.colors.text} />
    </div>
  )
}

// Per-layout sample-card rendering. Uses placeholder gradients (no
// real photos) so the preview works without any portfolio data and
// stays cheap to render on every editor keystroke.
function LocationsLayout({ layout, variant, accent, accentText, text }: { layout: LayoutKind; variant: 'thumb' | 'panel'; accent: string; accentText: string; text: string }) {
  const isThumb = variant === 'thumb'
  const padding = isThumb ? 6 : 16
  const gap     = isThumb ? 4 : 10
  const radius  = isThumb ? 4 : 6

  const placeholderBg = (i: number) => {
    const swatches = [
      'linear-gradient(135deg, #d4c5b0 0%, #a89c8d 100%)',
      'linear-gradient(135deg, #b0c5d4 0%, #8d9ca8 100%)',
      'linear-gradient(135deg, #c5d4b0 0%, #9ca88d 100%)',
      'linear-gradient(135deg, #d4b0c5 0%, #a88d9c 100%)',
    ]
    return swatches[i % swatches.length]
  }

  if (layout === 'list') {
    return (
      <div style={{ padding: `0 ${padding}px ${padding}px`, display: 'flex', flexDirection: 'column', gap }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ display: 'flex', gap, alignItems: 'center', padding: gap, background: 'white', borderRadius: radius, border: `1px solid ${hexWithAlpha(text, .06)}` }}>
            <div style={{ width: isThumb ? 18 : 50, height: isThumb ? 18 : 50, borderRadius: radius, background: placeholderBg(i), flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <SampleNameLine variant={variant} text={text} width="60%" />
              <SampleMetaLine variant={variant} text={text} width="40%" />
            </div>
            <SampleButton variant={variant} accent={accent} accentText={accentText} small />
          </div>
        ))}
      </div>
    )
  }

  if (layout === 'grid') {
    return (
      <div style={{ padding: `0 ${padding}px ${padding}px`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ background: 'white', borderRadius: radius, overflow: 'hidden', border: `1px solid ${hexWithAlpha(text, .06)}` }}>
            <div style={{ aspectRatio: '4 / 3', background: placeholderBg(i) }} />
            <div style={{ padding: gap, display: 'flex', flexDirection: 'column', gap: variant === 'thumb' ? 2 : 6 }}>
              <SampleNameLine variant={variant} text={text} width="80%" />
              <SampleMetaLine variant={variant} text={text} width="55%" />
              <div style={{ marginTop: variant === 'thumb' ? 2 : 4, alignSelf: 'flex-start' }}>
                <SampleButton variant={variant} accent={accent} accentText={accentText} small />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (layout === 'magazine') {
    return (
      <div style={{ padding: `0 ${padding}px ${padding}px`, display: 'flex', flexDirection: 'column', gap }}>
        {/* Hero card */}
        <div style={{ background: 'white', borderRadius: radius, overflow: 'hidden', border: `1px solid ${hexWithAlpha(text, .06)}` }}>
          <div style={{ aspectRatio: '16 / 9', background: placeholderBg(0) }} />
          <div style={{ padding: gap, display: 'flex', flexDirection: 'column', gap: variant === 'thumb' ? 2 : 6 }}>
            <SampleNameLine variant={variant} text={text} width="50%" big />
            <SampleMetaLine variant={variant} text={text} width="35%" />
            <div style={{ marginTop: variant === 'thumb' ? 2 : 4, alignSelf: 'flex-start' }}>
              <SampleButton variant={variant} accent={accent} accentText={accentText} />
            </div>
          </div>
        </div>
        {/* 2-up below */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap }}>
          {[1, 2].map(i => (
            <div key={i} style={{ background: 'white', borderRadius: radius, overflow: 'hidden', border: `1px solid ${hexWithAlpha(text, .06)}` }}>
              <div style={{ aspectRatio: '4 / 3', background: placeholderBg(i) }} />
              <div style={{ padding: gap * 0.7, display: 'flex', flexDirection: 'column', gap: variant === 'thumb' ? 2 : 4 }}>
                <SampleNameLine variant={variant} text={text} width="75%" />
                <div style={{ marginTop: variant === 'thumb' ? 1 : 3, alignSelf: 'flex-start' }}>
                  <SampleButton variant={variant} accent={accent} accentText={accentText} small />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (layout === 'minimal') {
    return (
      <div style={{ padding: `0 ${padding}px ${padding}px`, display: 'flex', flexDirection: 'column', gap: gap * 0.7 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ display: 'flex', gap, alignItems: 'center', padding: `${gap * 0.6}px 0`, borderBottom: i < 3 ? `1px solid ${hexWithAlpha(text, .08)}` : 'none' }}>
            <div style={{ width: isThumb ? 14 : 36, height: isThumb ? 14 : 36, borderRadius: radius, background: placeholderBg(i), flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <SampleNameLine variant={variant} text={text} width="55%" />
            </div>
            {/* Pill-style sample button instead of plain text so the accent
                color is visibly applied at thumb sizes too. */}
            <SampleButton variant={variant} accent={accent} accentText={accentText} small />
          </div>
        ))}
      </div>
    )
  }

  if (layout === 'editorial') {
    // Long-form story per location — magazine-article feel. Each
    // block: section number ('01 / 03'), big serif name, paragraph
    // lines representing description copy, then a select button.
    // Photos are taller (4/5 aspect) so they read as cinematic
    // hero shots rather than thumbnails.
    return (
      <div style={{ padding: `0 ${padding}px ${padding}px`, display: 'flex', flexDirection: 'column', gap: gap * 1.4 }}>
        {[0, 1].map(i => (
          <div key={i} style={{ background: 'white', borderRadius: radius, overflow: 'hidden', border: `1px solid ${hexWithAlpha(text, .06)}` }}>
            <div style={{ aspectRatio: '4 / 5', background: placeholderBg(i) }} />
            <div style={{ padding: `${gap}px ${gap * 1.2}px ${gap}px`, display: 'flex', flexDirection: 'column', gap: variant === 'thumb' ? 2 : 6 }}>
              {/* Index "01 / 02" */}
              <div style={{ fontSize: variant === 'thumb' ? 5 : 10, fontWeight: 600, letterSpacing: '.12em', color: hexWithAlpha(text, .5), textTransform: 'uppercase' }}>
                {String(i + 1).padStart(2, '0')} / 02
              </div>
              <SampleNameLine variant={variant} text={text} width="65%" big />
              {/* Description paragraph lines */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: variant === 'thumb' ? 1.5 : 3 }}>
                <div style={{ height: variant === 'thumb' ? 2 : 4, width: '100%', background: text, opacity: .35, borderRadius: 1 }} />
                <div style={{ height: variant === 'thumb' ? 2 : 4, width: '95%', background: text, opacity: .35, borderRadius: 1 }} />
                <div style={{ height: variant === 'thumb' ? 2 : 4, width: '70%', background: text, opacity: .35, borderRadius: 1 }} />
              </div>
              <div style={{ marginTop: variant === 'thumb' ? 3 : 6, alignSelf: 'flex-start' }}>
                <SampleButton variant={variant} accent={accent} accentText={accentText} />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // 'card' layout — current default. Tall photo per card, name below.
  return (
    <div style={{ padding: `0 ${padding}px ${padding}px`, display: 'flex', flexDirection: 'column', gap }}>
      {[0, 1].map(i => (
        <div key={i} style={{ background: 'white', borderRadius: radius, overflow: 'hidden', border: `1px solid ${hexWithAlpha(text, .06)}` }}>
          <div style={{ aspectRatio: '4 / 3', background: placeholderBg(i) }} />
          <div style={{ padding: gap, display: 'flex', flexDirection: 'column', gap: variant === 'thumb' ? 2 : 6 }}>
            <SampleNameLine variant={variant} text={text} width="65%" big />
            <SampleMetaLine variant={variant} text={text} width="40%" />
            <div style={{ marginTop: variant === 'thumb' ? 2 : 4, alignSelf: 'flex-start' }}>
              <SampleButton variant={variant} accent={accent} accentText={accentText} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function SampleNameLine({ variant, text, width, big }: { variant: 'thumb' | 'panel'; text: string; width: string; big?: boolean }) {
  const h = variant === 'thumb' ? (big ? 5 : 4) : (big ? 9 : 7)
  return <div style={{ height: h, width, background: text, opacity: .85, borderRadius: 1, marginBottom: variant === 'thumb' ? 2 : 4 }} />
}
function SampleMetaLine({ variant, text, width }: { variant: 'thumb' | 'panel'; text: string; width: string }) {
  const h = variant === 'thumb' ? 3 : 5
  return <div style={{ height: h, width, background: text, opacity: .35, borderRadius: 1 }} />
}
function SampleButton({ variant, accent, accentText, small }: { variant: 'thumb' | 'panel'; accent: string; accentText: string; small?: boolean }) {
  const padX = variant === 'thumb' ? 4 : (small ? 8 : 14)
  const padY = variant === 'thumb' ? 2 : (small ? 4 : 8)
  const fontSize = variant === 'thumb' ? 6 : (small ? 10 : 12)
  return (
    <div style={{ padding: `${padY}px ${padX}px`, borderRadius: 4, background: accent, color: accentText, fontSize, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
      Pick →
    </div>
  )
}

// Small helper: blend hex color with alpha for borders/overlays. Keeps
// the preview's borders + dim text in proportion to the chosen palette
// instead of always being a fixed gray.
function hexWithAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return `rgba(0,0,0,${alpha})`
  let h = m[1]
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
