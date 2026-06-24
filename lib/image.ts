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
    // resize only governs how the image fills a W×H box. With a single
    // dimension Supabase already preserves the natural aspect ratio,
    // and passing resize=cover anyway can confuse the render endpoint
    // into cropping to a default aspect (which was making heroUrl
    // arrive 4:3-cropped despite asking for width-only).
    if (opts.width != null && opts.height != null) {
      u.searchParams.set('resize', opts.resize ?? 'cover')
    }
    u.searchParams.set('quality', String(opts.quality ?? 75))
    return u.toString()
  } catch {
    return url
  }
}

// Preset sizes tuned for the surfaces that use them. The W×H+cover
// presets are intentional — list-card and dashboard tiles want a
// crisp 4:3 / 1:1 thumbnail with the server doing the crop, so the
// bytes shipped match the displayed shape and the photo's "centered"
// composition fills the tile. The hero (below) is the exception.
export const thumbUrl  = (url: string | null | undefined) => optimizedImage(url, { width: 480,  height: 360 })
export const tileUrl   = (url: string | null | undefined) => optimizedImage(url, { width: 120,  height: 120 })
export const mediumUrl = (url: string | null | undefined) => optimizedImage(url, { width: 1200, height: 900 })
// Pick page detail panel hero: bounded render with resize=contain so
// portraits letterbox instead of being cropped, while still capping
// the byte size. The earlier implementation served the ORIGINAL upload
// (5–8 MB per photo, 4:3-cropped problems with width-only) — switching
// to contain inside a 1400×1400 box keeps aspect AND ships ~200–500 KB
// JPEGs, which is what the client experience needs.
//
// The hero's <img> already has an onError fallback to the original
// URL, so if Supabase's render endpoint chokes on any specific photo,
// the hero gracefully degrades to the original instead of a broken
// image.
export const heroUrl = (url: string | null | undefined) => optimizedImage(url, { width: 1400, height: 1400, resize: 'contain', quality: 80 })
