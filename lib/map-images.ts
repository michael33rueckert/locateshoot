// Canvas helpers for MapLibre GL JS icons. All map images
// (category emoji pins, pill backgrounds for featured/portfolio
// labels) are rasterised via <canvas>, registered with
// `map.addImage(id, imageData, opts)`, and referenced by their
// id from data-driven `icon-image` expressions in symbol
// layers. Runs on the client only (uses OffscreenCanvas /
// document.createElement).

export interface CategoryIconImage {
  data: ImageData
  pixelRatio: number
}

// Colored circle with a centered emoji, white border, drop
// shadow. This is the equivalent of the old
// .explore-map-cat-icon-inner element from the Leaflet path
// — pre-baked into a bitmap so MapLibre can stamp it on the
// GPU instead of the compositor moving 50 DOM elements per
// frame.
export function makeCategoryIcon(color: string, emoji: string): CategoryIconImage {
  // 2x for Retina crispness. size is CSS px * pixelRatio.
  const pixelRatio = 2
  const size = 32 * pixelRatio
  const canvas = document.createElement('canvas')
  canvas.width  = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const cx = size / 2
  const cy = size / 2
  const radius = (size - 4 * pixelRatio) / 2

  // Soft drop shadow (baked in) so pins pop off the tiles.
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
  ctx.shadowBlur = 4 * pixelRatio
  ctx.shadowOffsetY = 1 * pixelRatio

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fill()

  // Reset shadow before border + emoji so they render crisply.
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2 * pixelRatio
  ctx.stroke()

  // Emoji glyph. Native emoji fonts vary per platform; the
  // stack falls back through the common ones.
  ctx.font = `${16 * pixelRatio}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji, cx, cy + 1 * pixelRatio)

  return { data: ctx.getImageData(0, 0, size, size), pixelRatio }
}

// Rounded-pill background image for MapLibre's icon-text-fit
// pattern. The returned image is wider than needed and
// annotated with stretchX / content so MapLibre stretches
// only the flat middle to fit text — corners stay perfectly
// round at any label length.
export interface PillImage {
  data: ImageData
  pixelRatio: number
  stretchX: [number, number][]
  stretchY: [number, number][]
  content: [number, number, number, number]
}

// Featured / portfolio pill with an embedded circular
// thumbnail on the left, name on the right, optional gold
// ring + camera badge + "IN YOUR PORTFOLIO" subtitle for
// portfolio pins. Composites the whole label into one canvas
// so MapLibre can render it as a single symbol icon — mirrors
// the previous Leaflet .explore-map-label-featured /
// .explore-map-label-portfolio HTML layout.
export interface LabelBadgeImage {
  data: ImageData
  pixelRatio: number
  /** Width (CSS px) — parent needs this to compute icon-offset. */
  cssWidth: number
  cssHeight: number
}
export async function makeLabelBadgeImage(opts: {
  /** If provided, drawn as a circular photo inside the pill.
   *  If missing or load fails, we fall back to a colored
   *  emoji circle from the fallback field so every
   *  featured/portfolio pin looks consistent. */
  thumbUrl?: string | null
  name: string
  variant: 'featured' | 'portfolio'
  /** Category color + emoji, used as the fallback when there's
   *  no thumb (or the thumb fetch fails). */
  fallback: { color: string; emoji: string }
}): Promise<LabelBadgeImage> {
  const { thumbUrl, name, variant, fallback } = opts
  const pixelRatio = 2

  // Try to load the thumbnail. crossOrigin needed so the
  // canvas isn't tainted — Supabase Storage + Google Places
  // both send CORS headers so this works for our URLs. When
  // the fetch fails we composite the fallback emoji circle
  // instead, so all featured/portfolio pins get the same
  // consistent pill shape.
  let img: HTMLImageElement | null = null
  if (thumbUrl) {
    try {
      img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new window.Image()
        el.crossOrigin = 'anonymous'
        el.onload  = () => resolve(el)
        el.onerror = () => reject(new Error('thumb load failed'))
        el.src = thumbUrl
      })
    } catch { /* fall through to emoji fallback */ }
  }

  const heightPx  = 52
  const thumbPx   = 44
  const padPx     = 4
  const gapPx     = 8
  const namePx    = 13
  const subPx     = 9

  // Measure text width using a throwaway canvas ctx.
  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = `600 ${namePx}px "Noto Sans", sans-serif`
  const nameW = measure.measureText(name).width
  const subW  = variant === 'portfolio'
    ? (() => { measure.font = `bold ${subPx}px "Noto Sans", sans-serif`; return measure.measureText('IN YOUR PORTFOLIO').width })()
    : 0
  const textW = Math.max(nameW, subW)

  // Right padding — leave room for the badge that sticks out
  // over the pill's right edge on portfolio pins. Featured just
  // needs standard padding.
  const rightPad = 14
  const widthPx  = padPx + thumbPx + gapPx + textW + rightPad

  const width  = widthPx  * pixelRatio
  const height = heightPx * pixelRatio
  const canvas = document.createElement('canvas')
  canvas.width  = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  // Pill background — rounded rectangle with a soft shadow
  // baked in so it floats over the map tiles.
  const cornerR = height / 2
  ctx.shadowColor   = 'rgba(0, 0, 0, 0.28)'
  ctx.shadowBlur    = 4 * pixelRatio
  ctx.shadowOffsetY = 1 * pixelRatio
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
  ctx.beginPath()
  ctx.moveTo(cornerR, 0)
  ctx.lineTo(width - cornerR, 0)
  ctx.arc(width - cornerR, cornerR, cornerR, -Math.PI / 2, Math.PI / 2)
  ctx.lineTo(cornerR, height)
  ctx.arc(cornerR, cornerR, cornerR, Math.PI / 2, -Math.PI / 2)
  ctx.closePath()
  ctx.fill()

  ctx.shadowColor   = 'transparent'
  ctx.shadowBlur    = 0
  ctx.shadowOffsetY = 0

  // Thumbnail — clipped to a circle inside the pill. If no
  // image loaded, we draw a colored emoji circle in the same
  // spot instead so pins without photos still look like the
  // rest of the featured/portfolio badges.
  const thumbCx = (padPx + thumbPx / 2) * pixelRatio
  const thumbCy = height / 2
  const thumbR  = (thumbPx / 2 - 2) * pixelRatio
  if (img) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(thumbCx, thumbCy, thumbR, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()
    const size = thumbR * 2
    const ratio = Math.max(size / img.naturalWidth, size / img.naturalHeight)
    const drawW = img.naturalWidth  * ratio
    const drawH = img.naturalHeight * ratio
    ctx.drawImage(img, thumbCx - drawW / 2, thumbCy - drawH / 2, drawW, drawH)
    ctx.restore()
  } else {
    // Colored emoji circle — matches the category-icon look
    // that regular dot-mode pins get at close zoom.
    ctx.fillStyle = fallback.color
    ctx.beginPath()
    ctx.arc(thumbCx, thumbCy, thumbR, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = `${18 * pixelRatio}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(fallback.emoji, thumbCx, thumbCy + pixelRatio)
  }

  // Portfolio pins get a gold ring around the thumb and a
  // small camera badge on the bottom-right of the thumb — same
  // treatment as the Leaflet .explore-map-label-portfolio look.
  if (variant === 'portfolio') {
    ctx.strokeStyle = '#c4922a'
    ctx.lineWidth   = 2 * pixelRatio
    ctx.beginPath()
    ctx.arc(thumbCx, thumbCy, thumbR + pixelRatio, 0, Math.PI * 2)
    ctx.stroke()

    // Camera badge
    const badgeR = 9 * pixelRatio
    const bx = thumbCx + thumbR - 2 * pixelRatio
    const by = thumbCy + thumbR - 2 * pixelRatio
    ctx.fillStyle = '#c4922a'
    ctx.beginPath()
    ctx.arc(bx, by, badgeR, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth   = 2 * pixelRatio
    ctx.stroke()
    ctx.fillStyle = '#1a1612'
    ctx.font = `${11 * pixelRatio}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('📷', bx, by + pixelRatio)
  }

  // Text — name + optional subtitle.
  const textX = (padPx + thumbPx + gapPx) * pixelRatio
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#1a1612'
  ctx.font = `600 ${namePx * pixelRatio}px "Noto Sans", sans-serif`

  if (variant === 'portfolio') {
    ctx.fillText(name, textX, thumbCy - 7 * pixelRatio)
    ctx.fillStyle = '#c4922a'
    ctx.font = `bold ${subPx * pixelRatio}px "Noto Sans", sans-serif`
    // Slight letter-spacing effect: draw with a small manual
    // gap by using textAlign transform. Skipped for perf;
    // reads fine at normal spacing.
    ctx.fillText('IN YOUR PORTFOLIO', textX, thumbCy + 9 * pixelRatio)
  } else {
    ctx.fillText(name, textX, thumbCy + pixelRatio)
  }

  return {
    data: ctx.getImageData(0, 0, width, height),
    pixelRatio,
    cssWidth:  widthPx,
    cssHeight: heightPx,
  }
}

export function makePillImage(
  fill: string,
  border?: { color: string; width: number },
): PillImage {
  const pixelRatio = 2
  const height = 32 * pixelRatio
  const width  = 96 * pixelRatio
  const radius = height / 2
  const canvas = document.createElement('canvas')
  canvas.width  = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  // Drop shadow (baked in) so the pill floats above the map.
  ctx.shadowColor   = 'rgba(0, 0, 0, 0.28)'
  ctx.shadowBlur    = 4 * pixelRatio
  ctx.shadowOffsetY = 1 * pixelRatio

  // Rounded rectangle path.
  ctx.beginPath()
  ctx.moveTo(radius, 0)
  ctx.lineTo(width - radius, 0)
  ctx.arc(width - radius, radius, radius, -Math.PI / 2, Math.PI / 2)
  ctx.lineTo(radius, height)
  ctx.arc(radius, radius, radius, Math.PI / 2, -Math.PI / 2)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()

  ctx.shadowColor   = 'transparent'
  ctx.shadowBlur    = 0
  ctx.shadowOffsetY = 0

  if (border) {
    ctx.strokeStyle = border.color
    ctx.lineWidth   = border.width * pixelRatio
    ctx.stroke()
  }

  return {
    data: ctx.getImageData(0, 0, width, height),
    pixelRatio,
    // Only the flat middle stretches — corners preserved so the
    // pill stays truly round.
    stretchX: [[radius, width - radius]],
    stretchY: [[0, height]],
    // Where the text can go inside the icon (padding-safe area).
    content: [radius, 0, width - radius, height],
  }
}
