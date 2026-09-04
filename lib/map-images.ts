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
