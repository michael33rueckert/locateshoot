'use client'

import { useState, useEffect, useRef } from 'react'

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

  // Mobile preview: render the iframe at fixed iPhone Pro Max
  // dimensions (430 × 932) and visually scale it down to fit the
  // modal — instead of letting the iframe shrink with the modal,
  // which made the iframe content think it was on a 320-330px phone
  // and wrap text aggressively. Scale is recomputed on resize so a
  // window drag updates it live.
  const PHONE_W = 430
  const PHONE_H = 932
  const phoneFrameRef = useRef<HTMLDivElement | null>(null)
  const [phoneScale, setPhoneScale] = useState(1)
  useEffect(() => {
    if (mode !== 'mobile') return
    const el = phoneFrameRef.current
    if (!el) return
    const update = () => {
      const h = el.getBoundingClientRect().height
      if (h > 0) setPhoneScale(h / PHONE_H)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => { ro.disconnect(); window.removeEventListener('resize', update) }
  }, [mode])

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
        // dvh (dynamic viewport height) excludes the browser chrome /
        // URL bar from the available height. With plain vh, the modal
        // gets centered on the full viewport including chrome — which
        // means the top of the modal slides UP behind the URL bar on
        // tall mobile + foldable displays, clipping the header
        // buttons. dvh fixes that. 90% leaves a comfortable margin.
        height: 'min(1040px, 90dvh)',
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
            <div
              ref={phoneFrameRef}
              style={{
                // Outer phone frame — drives the *visible* size.
                // 430x932 = iPhone 14/15 Pro Max proportions.
                // On shorter viewports (tablets, narrow desktops)
                // this clamps via 90dvh so the frame never overflows
                // the modal; the inner iframe is scaled to match.
                height: 'min(932px, calc(90dvh - 96px))',
                aspectRatio: '430 / 932',
                background: 'white',
                borderRadius: 24, overflow: 'hidden',
                border: '1px solid rgba(255,255,255,.12)',
                boxShadow: '0 12px 40px rgba(0,0,0,.5)',
                flexShrink: 0,
                position: 'relative',
              }}
            >
              {/* Inner iframe is ALWAYS rendered at native phone
                  dimensions (430x932) so its viewport-derived layout
                  (media queries, text wrap, env(safe-area-inset-*))
                  matches a real phone exactly. The CSS transform
                  scales the rendered output down to fit the outer
                  frame — so the photographer sees what their client
                  on a 430px phone would see, not a squished version. */}
              <div style={{
                position: 'absolute',
                top: 0, left: 0,
                width: PHONE_W, height: PHONE_H,
                transformOrigin: 'top left',
                transform: `scale(${phoneScale})`,
              }}>
                <iframe
                  src={url}
                  title="Location Guide preview (mobile)"
                  style={{ width: '100%', height: '100%', border: 'none' }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
