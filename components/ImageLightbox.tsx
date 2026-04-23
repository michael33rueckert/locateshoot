'use client'

import { useEffect, useState } from 'react'

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
  const [touchStart, setTouchStart] = useState<number | null>(null)

  useEffect(() => {
    // Reset to the caller's starting index whenever the source changes.
    setIdx(Math.max(0, Math.min(startIndex, images.length - 1)))
  }, [src, startIndex])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (images.length === 0) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft'  && hasMultiple) setIdx(i => (i - 1 + images.length) % images.length)
      else if (e.key === 'ArrowRight' && hasMultiple) setIdx(i => (i + 1) % images.length)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [images.length, hasMultiple, onClose])

  if (images.length === 0) return null

  const current = images[Math.max(0, Math.min(idx, images.length - 1))]
  const goPrev = () => setIdx(i => (i - 1 + images.length) % images.length)
  const goNext = () => setIdx(i => (i + 1) % images.length)

  // Swipe-to-navigate on touch devices.
  const onTouchStart = (e: React.TouchEvent) => setTouchStart(e.touches[0].clientX)
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStart == null || !hasMultiple) return
    const dx = e.changedTouches[0].clientX - touchStart
    if (Math.abs(dx) > 50) dx < 0 ? goNext() : goPrev()
    setTouchStart(null)
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
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10,8,6,.92)',
        backdropFilter: 'blur(6px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        cursor: 'zoom-out',
      }}
    >
      <img
        src={current}
        alt={alt ?? ''}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          borderRadius: 8,
          boxShadow: '0 24px 80px rgba(0,0,0,.6)',
          cursor: 'default',
        }}
      />

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
          <button
            onClick={e => { e.stopPropagation(); goPrev() }}
            aria-label="Previous image"
            style={{ ...arrowStyle, left: 16 }}
          >
            ‹
          </button>
          <button
            onClick={e => { e.stopPropagation(); goNext() }}
            aria-label="Next image"
            style={{ ...arrowStyle, right: 16 }}
          >
            ›
          </button>

          {/* Bottom arrow pair + counter — easier to reach with thumbs on mobile. */}
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
              style={{ background: 'transparent', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer', fontFamily: 'inherit', padding: '0 6px', lineHeight: 1 }}
            >
              ›
            </button>
          </div>
        </>
      )}
    </div>
  )
}
