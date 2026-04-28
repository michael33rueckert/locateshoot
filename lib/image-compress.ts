// Client-side image compression. Used before validateImageUpload so a
// photographer who picks a 30 MB raw export from their camera doesn't
// hit the 10 MB cap — we silently downscale + recompress to JPEG until
// the file fits, then hand it off to the upload pipeline.
//
// Browser-only (uses Image, canvas, URL.createObjectURL). Don't import
// from server code — it'll throw at module load.
//
// Type policy:
//   - JPEG / PNG / WebP   → decoded + recompressed to JPEG.
//   - Anything else (HEIC, AVIF, GIF, etc.) → returned unchanged so
//     validateImageUpload's normal rules apply. Canvas can't decode
//     HEIC in most browsers, and we don't want to flatten an animated
//     GIF without telling the user.

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024 // match upload-validate.ts
const DEFAULT_MAX_DIM   = 2400              // longest side, in pixels

interface CompressOptions {
  maxBytes?: number
  maxDim?:   number
}

// Resize + recompress an image until it's under maxBytes (or we run
// out of attempts). If the file is already small enough, returns it
// unchanged. If the type isn't one we can decode, returns it unchanged
// and lets validation handle it. Throws only on actual decode failure
// (corrupt file, etc.) — quota issues fall through and return the
// smallest blob we managed to produce.
export async function compressImageIfNeeded(file: File, opts: CompressOptions = {}): Promise<File> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
  const maxDim   = opts.maxDim   ?? DEFAULT_MAX_DIM

  if (file.size <= maxBytes) return file
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return file

  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload  = () => resolve(i)
      i.onerror = () => reject(new Error('Could not decode image'))
      i.src     = objectUrl
    })

    // Cap the longest side at maxDim before any quality-driven
    // shrinking. A 6000 px wide JPEG at q=0.85 is still huge — fitting
    // pixel dimensions first is what gets us under the limit fast.
    const baseScale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))

    // Try increasingly aggressive scale + quality combos. The first
    // pass is the gentlest (full base resolution, q=0.85) so we keep
    // the most detail when possible. Each subsequent pass shrinks +
    // drops quality until we fit or run out of options.
    const passes: Array<{ scale: number; quality: number }> = [
      { scale: 1.00, quality: 0.85 },
      { scale: 0.85, quality: 0.80 },
      { scale: 0.70, quality: 0.75 },
      { scale: 0.55, quality: 0.70 },
      { scale: 0.40, quality: 0.65 },
    ]

    let smallest: Blob | null = null
    for (const p of passes) {
      const w = Math.max(1, Math.round(img.naturalWidth  * baseScale * p.scale))
      const h = Math.max(1, Math.round(img.naturalHeight * baseScale * p.scale))
      const canvas = document.createElement('canvas')
      canvas.width  = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return file
      ctx.drawImage(img, 0, 0, w, h)
      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(b => resolve(b), 'image/jpeg', p.quality),
      )
      if (!blob) continue
      if (!smallest || blob.size < smallest.size) smallest = blob
      if (blob.size <= maxBytes) {
        return new File([blob], renameToJpg(file.name), { type: 'image/jpeg', lastModified: Date.now() })
      }
    }

    if (smallest) {
      return new File([smallest], renameToJpg(file.name), { type: 'image/jpeg', lastModified: Date.now() })
    }
    return file
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function renameToJpg(name: string): string {
  return /\.[^.]+$/.test(name) ? name.replace(/\.[^.]+$/, '.jpg') : `${name}.jpg`
}
