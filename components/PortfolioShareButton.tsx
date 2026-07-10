'use client'

import { useEffect, useRef, useState } from 'react'

// Split button that lives in page toolbars where the photographer
// needs a fast "share my whole portfolio" action. Primary button on
// the left fires onShare (typically shareOrCopy → OS share sheet or
// clipboard). Optional ⋮ dropdown on the right exposes Preview + Edit
// for the underlying full-portfolio share_link — hidden entirely when
// no menu handlers are provided, so callers that only care about the
// share action (like /portfolio) get a plain single button.
//
// Replaces the earlier PortfolioGuideBanner treatment — locations UI
// pattern: this is an ACTION, not a card.

interface Props {
  onShare:     () => void
  onPreview?:  () => void
  onEdit?:     () => void
  copyState?:  'idle' | 'copied'
  inactive?:   boolean
  /** md for main pages, sm for dashboard section headers. */
  size?:       'sm' | 'md'
  /** Custom label if the default "📚 Share Portfolio" doesn't fit. */
  label?:      string
}

export default function PortfolioShareButton({
  onShare,
  onPreview,
  onEdit,
  copyState = 'idle',
  inactive,
  size = 'md',
  label,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Click-outside closes the ⋮ menu. Same pattern the NotificationBell
  // dropdown uses — pointerdown at document level so a tap anywhere
  // outside the button group collapses the menu without a stray
  // click landing on the underlying page.
  useEffect(() => {
    if (!menuOpen) return
    function handle(e: PointerEvent) {
      const root = rootRef.current
      if (!root) return
      if (!root.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', handle)
    return () => document.removeEventListener('pointerdown', handle)
  }, [menuOpen])

  const hasMenu = !!(onPreview || onEdit)
  const primaryPadding = size === 'sm' ? '7px 14px' : '10px 18px'
  const menuPadding    = size === 'sm' ? '7px 10px' : '10px 12px'
  const fontSize       = size === 'sm' ? 12 : 13
  const menuFontSize   = size === 'sm' ? 12 : 14

  const bgActive = inactive
    ? 'var(--cream-dark)'
    : (copyState === 'copied' ? 'var(--sage)' : 'var(--gold)')
  const fgActive = inactive
    ? 'var(--ink-soft)'
    : (copyState === 'copied' ? 'white' : 'var(--ink)')

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={onShare}
        disabled={inactive}
        title="Share your entire portfolio — opens the OS share sheet, or copies the URL"
        style={{
          padding: primaryPadding,
          borderRadius: hasMenu ? '6px 0 0 6px' : 6,
          background: bgActive,
          color: fgActive,
          border: 'none',
          fontSize,
          fontWeight: 700,
          cursor: inactive ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
      >
        {copyState === 'copied' ? '✓ Link copied!' : (label ?? '📚 Share Portfolio')}
      </button>
      {hasMenu && (
        <button
          onClick={() => setMenuOpen(p => !p)}
          disabled={inactive}
          aria-label="More portfolio actions"
          aria-expanded={menuOpen}
          title="Preview or edit your portfolio share"
          style={{
            padding: menuPadding,
            borderRadius: '0 6px 6px 0',
            background: bgActive,
            color: fgActive,
            border: 'none',
            borderLeft: '1px solid rgba(0,0,0,.12)',
            fontSize: menuFontSize,
            fontWeight: 700,
            cursor: inactive ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ⋮
        </button>
      )}
      {menuOpen && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            background: 'white',
            border: '1px solid var(--cream-dark)',
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(26,22,18,.18)',
            minWidth: 180,
            zIndex: 100,
            overflow: 'hidden',
          }}
        >
          {onPreview && (
            <button
              role="menuitem"
              onClick={() => { setMenuOpen(false); onPreview() }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', padding: '10px 14px', background: 'white', border: 'none', color: 'var(--ink)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--cream)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'white')}
            >
              <span style={{ fontSize: 14 }}>👁</span> Preview as client sees it
            </button>
          )}
          {onEdit && (
            <button
              role="menuitem"
              onClick={() => { setMenuOpen(false); onEdit() }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                textAlign: 'left', padding: '10px 14px', background: 'white',
                border: 'none', color: 'var(--ink)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
                borderTop: onPreview ? '1px solid var(--cream-dark)' : undefined,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--cream)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'white')}
            >
              <span style={{ fontSize: 14 }}>✏️</span> Edit name, message, cover
            </button>
          )}
        </div>
      )}
    </div>
  )
}
