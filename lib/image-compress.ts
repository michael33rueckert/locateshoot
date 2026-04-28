// Client-side image compression. Used before validateImageUpload so a
// photographer who picks a 30 MB raw export from their camera doesn't
// hit the 10 MB cap — we silently downscale + recompress to JPEG until
// the file fits, then hand it off to the upload pipeline.
//
// Browser-only (uses Image, canvas, URL.createObjectURL). Don't import
// from server code — it'll throw at module load.
//
// Type policy:
//   - File ≤ maxBytes                       → returned unchanged.
//   - File > maxBytes, browser can decode   → recompressed to JPEG.
//   - File > maxBytes, browser can't decode → throws with a useful
//     message (most often a HEIC/HEIF photo from an iPhone — Chrome
//     and Firefox can't render it, so we can't shrink it client-side).
//
// Don't pre-filter by file.type — some browsers report `image/jpg`
// instead of `image/jpeg`, drag-drop sometimes loses the MIME entirely,
// and modern Safari can decode HEIC. Cheaper to just hand the bytes
// to <img> and let the browser say no.

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

  const objectUrl = URL.createObjectURL(file)
  let img: HTMLImageElement
  try {
    img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload  = () => resolve(i)
      i.onerror = () => reject(new Error('decode_failed'))
      i.src     = objectUrl
    })
  } catch {
    URL.revokeObjectURL(objectUrl)
    // Most common cause: an iPhone HEIC/HEIF photo on a non-Safari
    // browser. Chrome/Firefox can't decode HEIC, so we can't shrink
    // it from JS. Tell the user how to recover.
    const ext = (file.name.split('.').pop() ?? '').toLowerCase()
    const isHeic = ext === 'heic' || ext === 'heif' || /heic|heif/i.test(file.type)
    const cap = `${Math.round(maxBytes / 1024 / 1024)}MB`
    throw new Error(isHeic
      ? `${file.name} is a HEIC/HEIF photo over ${cap}. Please export it as JPEG (in Photos: File → Export → Export Unmodified Original → choose "Most Compatible").`
      : `${file.name} is over ${cap} and we couldn't auto-resize it. Please save it as a JPEG and try again.`,
    )
  }
  try {

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
