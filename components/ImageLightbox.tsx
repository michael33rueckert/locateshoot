'use client'

import { useEffect } from 'react'

interface Props {
  src: string | null
  alt?: string
  onClose: () => void
}

/**
 * Fullscreen image lightbox. Click the backdrop or press Esc to close.
 * Renders only when `src` is truthy.
 */
export default function ImageLightbox({ src, alt, onClose }: Props) {
  useEffect(() => {
    if (!src) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [src, onClose])

  if (!src) return null

  return (
    <div
      onClick={onClose}
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
        src={src}
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
        }}
      >
        ✕
      </button>
    </div>
  )
}
