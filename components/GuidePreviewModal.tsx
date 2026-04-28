'use client'

import { useState, useEffect } from 'react'

// Photographer-side preview of a Location Guide. Loads the actual
// /pick/[slug] URL in an iframe so the photographer sees their real
// page with their real branding, locations, fonts, photos. A toggle
// at the top of the modal switches between desktop (full-width
// iframe) and mobile (390px-wide iframe centered on a dark backdrop)
// so the photographer can see both layouts before sending the link
// to a client.

interface Props {
  url:     string
  onClose: () => void
}

export default function GuidePreviewModal({ url, onClose }: Props) {
  // Default to whichever view the photographer is actually USING the
  // app on. If they're on their phone, "Desktop" mode squeezes a
  // 1280-wide page into a 360px-wide modal — illegible. Mobile-first
  // default for narrow viewports (and they can still toggle to desktop
  // if they want to see the full layout).
  const [mode, setMode] = useState<'desktop' | 'mobile'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'mobile' : 'desktop',
  )

  // Esc to close — same convention as the rest of the modals on the
  // photographer side.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,.7)', backdropFilter: 'blur(6px)', zIndex: 1000 }}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: '#1a1612',
        borderRadius: 14,
        width: 'min(1280px, 96vw)',
        height: 'min(1040px, 94vh)',
        zIndex: 1001,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,.45)',
        border: '1px solid rgba(255,255,255,.08)',
      }}>

        {/* Header — title left, viewport toggle center, close right.
            On narrow viewports (Pixel Fold outer, small phones) the
            title is hidden so the toggle + close button always fit
            without clipping. The toggle's text labels collapse to the
            emoji-only versions below 480px to save another ~80px. */}
        <style>{`
          @media (max-width: 599px) {
            .gpm-title { display: none !important; }
          }
          @media (max-width: 479px) {
            .gpm-toggle-label { display: none !important; }
            .gpm-toggle-btn { padding: 6px 10px !important; }
          }
        `}</style>
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <div className="gpm-title" style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            👁 Preview as client sees it
          </div>

          {/* Desktop / Mobile toggle */}
          <div style={{ display: 'inline-flex', borderRadius: 6, border: '1px solid rgba(255,255,255,.15)', overflow: 'hidden', flexShrink: 0 }}>
            <button
              className="gpm-toggle-btn"
              onClick={() => setMode('desktop')}
              style={{
                padding: '6px 14px', border: 'none',
                background: mode === 'desktop' ? 'var(--gold)' : 'transparent',
                color:      mode === 'desktop' ? 'var(--ink)'  : 'rgba(245,240,232,.7)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
              aria-label="Desktop preview"
            >🖥<span className="gpm-toggle-label"> Desktop</span></button>
            <button
              className="gpm-toggle-btn"
              onClick={() => setMode('mobile')}
              style={{
                padding: '6px 14px',
                border: 'none', borderLeft: '1px solid rgba(255,255,255,.15)',
                background: mode === 'mobile' ? 'var(--gold)' : 'transparent',
                color:      mode === 'mobile' ? 'var(--ink)'  : 'rgba(245,240,232,.7)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
              aria-label="Mobile preview"
            >📱<span className="gpm-toggle-label"> Mobile</span></button>
          </div>

          <button
            onClick={onClose}
            aria-label="Close preview"
            style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,.08)', border: 'none', cursor: 'pointer', fontSize: 14, color: 'rgba(245,240,232,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >✕</button>
        </div>

        {/* Iframe container. Desktop = fill. Mobile = 390x844 centered
            on the dark backdrop with a subtle phone-style border so it
            reads as "this is what your client's screen looks like." */}
        <div style={{
          flex: 1, minHeight: 0, background: '#1a1612',
          display: 'flex',
          alignItems: mode === 'mobile' ? 'flex-start' : 'stretch',
          justifyContent: 'center',
          padding: mode === 'mobile' ? '24px 16px' : 0,
          overflow: mode === 'mobile' ? 'auto' : 'hidden',
        }}>
          {mode === 'desktop' ? (
            <iframe
              src={url}
              title="Location Guide preview (desktop)"
              style={{ width: '100%', height: '100%', border: 'none', background: 'white' }}
            />
          ) : (
            <div style={{
              // 430x932 — iPhone 14/15 Pro Max proportions. Drive
              // sizing by height + aspect-ratio so on tablets (where
              // viewport height clamps below ~932) the width shrinks
              // proportionally instead of staying 430 and reading
              // squished. Desktop with a tall viewport still hits the
              // full 932px size.
              height: 'min(932px, calc(94vh - 96px))',
              aspectRatio: '430 / 932',
              background: 'white',
              borderRadius: 24, overflow: 'hidden',
              border: '1px solid rgba(255,255,255,.12)',
              boxShadow: '0 12px 40px rgba(0,0,0,.5)',
              flexShrink: 0,
            }}>
              <iframe
                src={url}
                title="Location Guide preview (mobile)"
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
