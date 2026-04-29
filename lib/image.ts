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
// Pick page detail panel hero: serve the ORIGINAL upload, not a
// /render/image/ transform. Empirically Supabase's render endpoint
// was still arriving 4:3-cropped at the browser even when called
// with width-only and no resize parameter — the only reliable way
// to make portraits NOT crop is to skip the transform pipeline.
// Acceptable here because the hero shows one photo at a time and
// the others are lazy-loaded; we already cap upload size at ~10MB
// in the photographer's edit modal so this isn't unbounded.
export const heroUrl = (url: string | null | undefined) => url ?? null
