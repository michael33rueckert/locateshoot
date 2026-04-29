// Supabase Storage serves on-the-fly resizing at /storage/v1/render/image/public/
// instead of /storage/v1/object/public/. For every URL we hand to an <img> tag
// that renders smaller than the original (tiles, thumbnails, even the detail
// panel hero) we go through this helper so the browser pulls a ~480-1200px JPEG
// instead of a 5–8 MB original. Non-Supabase URLs (Google Places CDN, Wikipedia
// upload.wikimedia.org) are returned unchanged — those already serve appropriately
// sized renditions.

const PUBLIC_MARKER = '/storage/v1/object/public/'
const RENDER_PREFIX = '/storage/v1/render/image/public/'

export function optimizedImage(
  url: string | null | undefined,
  opts: { width?: number; height?: number; quality?: number; resize?: 'cover' | 'contain' },
): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const idx = u.pathname.indexOf(PUBLIC_MARKER)
    if (idx === -1) return url  // External (Google/Wikipedia) — leave it alone.
    u.pathname = u.pathname.slice(0, idx) + RENDER_PREFIX + u.pathname.slice(idx + PUBLIC_MARKER.length)
    if (opts.width)  u.searchParams.set('width',  String(opts.width))
    if (opts.height) u.searchParams.set('height', String(opts.height))
    u.searchParams.set('resize', opts.resize ?? 'cover')
    u.searchParams.set('quality', String(opts.quality ?? 75))
    return u.toString()
  } catch {
    return url
  }
}

// Preset sizes tuned for the surfaces that use them.
export const thumbUrl  = (url: string | null | undefined) => optimizedImage(url, { width: 480,  height: 360 })
export const tileUrl   = (url: string | null | undefined) => optimizedImage(url, { width: 120,  height: 120 })
export const mediumUrl = (url: string | null | undefined) => optimizedImage(url, { width: 1200, height: 900 })
// Aspect-preserving variant for the Pick page detail panel hero.
// Specifying ONLY width tells Supabase's render endpoint to scale
// to that width while preserving the photo's natural aspect — no
// server-side crop, so portrait shots arrive in the browser tall
// instead of pre-cropped to 4:3 (which made objectFit:contain
// pointless on the client side).
export const heroUrl   = (url: string | null | undefined) => optimizedImage(url, { width: 1200 })
