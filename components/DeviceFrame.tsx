import React from 'react'

// CSS device frames for marketing screenshots — pure styling, no
// external mockup PNGs or licensing concerns. Two variants:
//
//   <LaptopFrame src="/marketing/screenshots/dashboard.png" />
//     Modern thin-bezel laptop. 16:10 screen with the screenshot
//     inside, a subtle hinge bar below, and a drop shadow on the
//     floor. Good for product views where the screenshot is wide
//     (dashboard, explore, profile).
//
//   <PhoneFrame src="/marketing/screenshots/pick.png" />
//     Modern bezel-less phone. ~9:19 screen with a tiny camera
//     dot at the top, rounded corners, and a thin home-indicator
//     pill at the bottom. Good for narrow / mobile-first views
//     (pick page, location detail panel).
//
// Both accept an optional `alt` for accessibility and an optional
// `caption` rendered below the device. The frame width adapts to
// its container — drop them in any flex/grid cell.

interface FrameProps {
  src:      string
  alt?:     string
  caption?: string
}

export function LaptopFrame({ src, alt, caption }: FrameProps) {
  return (
    <figure style={{ margin: 0, width: '100%' }}>
      {/* Outer bezel — dark gray, slightly rounded top, flatter bottom */}
      <div style={{
        position: 'relative',
        background: 'linear-gradient(180deg, #2a2a2c 0%, #1a1a1c 100%)',
        borderRadius: '14px 14px 6px 6px',
        padding: '14px 14px 16px',
        boxShadow:
          '0 1px 0 rgba(255,255,255,0.06) inset, ' +     // top edge highlight
          '0 30px 60px -12px rgba(26,22,18,0.35), ' +     // big soft shadow
          '0 18px 32px -18px rgba(26,22,18,0.30)',
      }}>
        {/* Camera dot — tiny gray dot centered on the top bezel */}
        <div style={{
          position: 'absolute',
          top: 6, left: '50%', transform: 'translateX(-50%)',
          width: 4, height: 4, borderRadius: '50%',
          background: '#3a3a3c',
        }} />
        {/* Screen — white background, screenshot fits inside */}
        <div style={{
          background: '#ffffff',
          borderRadius: 6,
          aspectRatio: '16 / 10',
          overflow: 'hidden',
          position: 'relative',
        }}>
          <img
            src={src}
            alt={alt ?? ''}
            style={{
              width: '100%', height: '100%',
              objectFit: 'cover', objectPosition: 'top',
              display: 'block',
            }}
          />
        </div>
      </div>

      {/* Hinge — short flat bar suggesting the laptop base */}
      <div style={{
        margin: '0 auto',
        width: '18%',
        height: 6,
        background: 'linear-gradient(180deg, #1a1a1c 0%, #0e0e10 100%)',
        borderRadius: '0 0 8px 8px',
        boxShadow: '0 6px 14px -6px rgba(0,0,0,0.35)',
      }} />
      {/* Floor shadow — soft radial gradient under the device */}
      <div style={{
        height: 24, marginTop: -2,
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.10) 0%, transparent 70%)',
      }} />

      {caption && (
        <figcaption style={{
          marginTop: 12, fontSize: 17, color: 'var(--ink)',
          textAlign: 'center', fontWeight: 500,
          fontFamily: 'var(--font-playfair),serif',
        }}>
          {caption}
        </figcaption>
      )}
    </figure>
  )
}

export function PhoneFrame({ src, alt, caption }: FrameProps) {
  return (
    <figure style={{ margin: 0, width: '100%', maxWidth: 280 }}>
      {/* Outer bezel — modern bezel-less phone, deep black, rounded corners */}
      <div style={{
        position: 'relative',
        background: 'linear-gradient(180deg, #1d1d1f 0%, #0a0a0b 100%)',
        borderRadius: 36,
        padding: 8,
        boxShadow:
          '0 1px 0 rgba(255,255,255,0.04) inset, ' +
          '0 30px 60px -12px rgba(26,22,18,0.35), ' +
          '0 18px 32px -18px rgba(26,22,18,0.30)',
      }}>
        {/* Screen — top half white, bottom half dark. The current Pick
            page screenshot has a white "Browse locations" sticky bar
            at its very top and a dark "Send my choice" confirm bar at
            its very bottom; pairing them with matching letterbox fills
            hides the contain-letterbox seam on both ends. The image
            is opaque, so the 50% gradient hard stop disappears behind
            it — only the small letterbox strips above and below are
            visible. */}
        <div style={{
          background: 'linear-gradient(to bottom, #ffffff 50%, #1a1612 50%)',
          borderRadius: 28,
          aspectRatio: '9 / 19.5',
          overflow: 'hidden',
          position: 'relative',
        }}>
          {/* Dynamic-island-ish notch pill */}
          <div style={{
            position: 'absolute',
            top: 10, left: '50%', transform: 'translateX(-50%)',
            width: 70, height: 18, borderRadius: 999,
            background: '#0a0a0b',
            zIndex: 2,
          }} />
          <img
            src={src}
            alt={alt ?? ''}
            style={{
              width: '100%', height: '100%',
              // contain (not cover) so screenshots that aren't 9:19.5
              // — most browser-captured pick page shots are ~9:16 to
              // 9:18 — show their full width without left/right
              // cropping. Centered vertically (rather than top-
              // anchored) so the letterbox splits evenly above + below
              // the screenshot. That puts the notch pill in the top
              // letterbox region instead of overlapping the screenshot's
              // own header (where the photographer's logo lives).
              objectFit: 'contain', objectPosition: 'center',
              display: 'block',
            }}
          />
          {/* Home indicator pill at the bottom — light/translucent
              white so it reads on the dark bottom letterbox (the dark
              fill matches the screenshot's bottom action bar). */}
          <div style={{
            position: 'absolute',
            bottom: 6, left: '50%', transform: 'translateX(-50%)',
            width: '32%', height: 4, borderRadius: 999,
            background: 'rgba(245,240,232,0.55)',
            zIndex: 2,
          }} />
        </div>
      </div>

      {/* Floor shadow */}
      <div style={{
        height: 18, marginTop: 4,
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.10) 0%, transparent 70%)',
      }} />

      {caption && (
        <figcaption style={{
          marginTop: 12, fontSize: 17, color: 'var(--ink)',
          textAlign: 'center', fontWeight: 500,
          fontFamily: 'var(--font-playfair),serif',
        }}>
          {caption}
        </figcaption>
      )}
    </figure>
  )
}
