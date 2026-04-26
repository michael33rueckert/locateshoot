'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  /** URLs to show. Accepts a single string for backwards compatibility; null/undefined hides the lightbox. */
  src?: string | string[] | null
  /** Index to start on when `src` is an array. */
  startIndex?: number
  alt?: string
  onClose: () => void
}

/**
 * Fullscreen image lightbox with optional multi-image navigation (arrows + swipe + keyboard).
 * Click the backdrop or press Esc to close. Left/right arrows (UI + keyboard) cycle through when
 * more than one image is provided.
 */
export default function ImageLightbox({ src, startIndex = 0, alt, onClose }: Props) {
  const images = Array.isArray(src) ? src.filter(Boolean) as string[] : (src ? [src] : [])
  const hasMultiple = images.length > 1
  const [idx, setIdx] = useState(0)
  // Horizontal scroll-snap strip — same pattern the pick page detail
  // panel uses for its hero. Lets the OS handle the swipe gesture
  // (1:1 finger tracking + momentum + snap) instead of our old
  // touchstart/touchend handlers, which just swapped the displayed
  // image with no animation and felt delayed because the next image
  // wasn't in the DOM until after the swipe completed.
  const stripRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Reset to the caller's starting index whenever the source changes.
    const next = Math.max(0, Math.min(startIndex, images.length - 1))
    setIdx(next)
    // Jump the strip to the right slot without animating (instant).
    requestAnimationFrame(() => {
      const el = stripRef.current
      if (el) el.scrollTo({ left: next * el.clientWidth, behavior: 'instant' as ScrollBehavior })
    })
  }, [src, startIndex])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (images.length === 0) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft'  && hasMultiple) goPrev()
      else if (e.key === 'ArrowRight' && hasMultiple) goNext()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [images.length, hasMultiple, onClose])  // eslint-disable-line react-hooks/exhaustive-deps

  if (images.length === 0) return null

  // Programmatic navigation scrolls the strip — keeps the same animated
  // motion as the swipe gesture. Wraps around at both ends.
  function scrollToIdx(next: number, smooth = true) {
    const el = stripRef.current
    if (!el) return
    el.scrollTo({ left: next * el.clientWidth, behavior: smooth ? 'smooth' : 'instant' as ScrollBehavior })
  }
  const goPrev = () => {
    const next = (idx - 1 + images.length) % images.length
    scrollToIdx(next)
  }
  const goNext = () => {
    const next = (idx + 1) % images.length
    scrollToIdx(next)
  }

  // Keep idx in sync with where the user has scrolled, so the counter
  // ("3 / 8") and arrow buttons reflect the current image.
  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    if (el.clientWidth === 0) return
    const next = Math.round(el.scrollLeft / el.clientWidth)
    if (next !== idx) setIdx(next)
  }

  const arrowStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: 'rgba(255,255,255,.12)',
    color: 'white',
    border: '1px solid rgba(255,255,255,.2)',
    cursor: 'pointer',
    fontSize: 22,
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(10px)',
    zIndex: 2,
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10,8,6,.92)',
        backdropFilter: 'blur(6px)',
        zIndex: 10000,
        cursor: 'zoom-out',
      }}
    >
      {/* Horizontal scroll-snap strip. Touch swipes are handled by the
          OS for 1:1 finger tracking + momentum + snap. All images are
          rendered (not just the active one) so the next slide is
          already loaded by the time the user finishes swiping —
          eliminates the "tap, wait, see" delay the old single-img
          lightbox had. */}
      <div
        ref={stripRef}
        onScroll={handleScroll}
        onClick={e => e.stopPropagation()}
        className="lightbox-strip"
        style={{
          position: 'absolute', inset: 0,
          display: 'flex',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}
      >
        {images.map((url, i) => (
          <div
            key={i}
            onClick={onClose}
            style={{
              flex: '0 0 100%',
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2rem',
              boxSizing: 'border-box',
              scrollSnapAlign: 'start',
              scrollSnapStop: 'always',
            }}
          >
            <img
              src={url}
              alt={alt ?? ''}
              onClick={e => e.stopPropagation()}
              loading={Math.abs(i - idx) <= 1 ? 'eager' : 'lazy'}
              decoding="async"
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                borderRadius: 8,
                boxShadow: '0 24px 80px rgba(0,0,0,.6)',
                cursor: 'default',
              }}
            />
          </div>
        ))}
      </div>

      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: 'rgba(255,255,255,.12)',
          color: 'white',
          border: '1px solid rgba(255,255,255,.2)',
          cursor: 'pointer',
          fontSize: 20,
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(10px)',
          zIndex: 2,
        }}
      >
        ✕
      </button>

      {hasMultiple && (
        <>
          {/* Side + bottom arrows are only useful for mouse/keyboard users.
              Touch devices swipe (onTouchStart/End handlers above), so hide
              the chrome on ≤1023px to match the rest of the app's touch UX. */}
          <button
            onClick={e => { e.stopPropagation(); goPrev() }}
            aria-label="Previous image"
            className="lightbox-side-arrow"
            style={{ ...arrowStyle, left: 16 }}
          >
            ‹
          </button>
          <button
            onClick={e => { e.stopPropagation(); goNext() }}
            aria-label="Next image"
            className="lightbox-side-arrow"
            style={{ ...arrowStyle, right: 16 }}
          >
            ›
          </button>

          {/* Bottom counter pill — shows "N of M". On desktop keeps the
              arrow buttons on either side; on touch breakpoints we drop
              the arrows and only show the counter. */}
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              bottom: 20,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 16px',
              borderRadius: 999,
              background: 'rgba(0,0,0,.45)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,.15)',
              zIndex: 2,
            }}
          >
            <button
              onClick={goPrev}
              aria-label="Previous image"
              className="lightbox-bottom-arrow"
              style={{ background: 'transparent', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer', fontFamily: 'inherit', padding: '0 6px', lineHeight: 1 }}
            >
              ‹
            </button>
            <span style={{ color: 'rgba(255,255,255,.85)', fontSize: 13, fontVariantNumeric: 'tabular-nums', minWidth: 40, textAlign: 'center' }}>
              {idx + 1} / {images.length}
            </span>
            <button
              onClick={goNext}
              aria-label="Next image"
              className="lightbox-bottom-arrow"
              style={{ background: 'transparent', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer', fontFamily: 'inherit', padding: '0 6px', lineHeight: 1 }}
            >
              ›
            </button>
          </div>
        </>
      )}
      <style>{`
        .lightbox-strip::-webkit-scrollbar { display: none; }
        @media (max-width: 1023px) {
          .lightbox-side-arrow, .lightbox-bottom-arrow { display: none !important; }
        }
      `}</style>
    </div>
  )
}
