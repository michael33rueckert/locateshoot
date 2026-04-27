// Shared file-upload validation. Used by every site that calls
// supabase.storage.upload — keeps the rules consistent so we don't
// e.g. fix SVG-XSS on the logo upload but forget about the location
// photo upload.
//
// SVG is blocked outright: SVG can embed <script> tags that execute
// when the file is opened directly via getPublicUrl(). Allowing SVG
// uploads is effectively allowing stored XSS on every viewer of any
// page that links the URL.
//
// File-extension check is a backstop in case the browser sends an
// empty / generic file.type (some Android browsers do this for
// images picked from Drive, etc.).

const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
])

const ALLOWED_IMAGE_EXT = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif',
])

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB

export interface UploadValidationError {
  ok: false
  message: string
}
export interface UploadValidationOk {
  ok: true
  ext: string         // lowercased + stripped of any non-alphanum
  contentType: string // safe MIME to pass to supabase.storage.upload
}
export type UploadValidationResult = UploadValidationOk | UploadValidationError

export function validateImageUpload(file: File | null | undefined): UploadValidationResult {
  if (!file) return { ok: false, message: 'No file selected.' }

  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, message: `Image is too large (max ${MAX_IMAGE_BYTES / 1024 / 1024} MB).` }
  }

  const rawType = (file.type ?? '').toLowerCase().trim()
  const rawName = file.name ?? ''
  const ext     = (rawName.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

  // Hard reject SVG by both MIME and extension regardless of what
  // else passes — the security risk is too high.
  if (rawType.includes('svg') || ext === 'svg' || ext === 'svgz') {
    return { ok: false, message: 'SVG uploads are not supported. Please upload a JPG, PNG, or WebP.' }
  }

  // If the browser gave us a real MIME, require it be on the allowlist.
  // If the MIME is missing/empty, fall back to the extension check.
  if (rawType && !ALLOWED_IMAGE_MIME.has(rawType)) {
    return { ok: false, message: 'Unsupported file type. Please upload a JPG, PNG, WebP, or GIF.' }
  }
  if (!rawType && !ALLOWED_IMAGE_EXT.has(ext)) {
    return { ok: false, message: 'Unsupported file type. Please upload a JPG, PNG, WebP, or GIF.' }
  }

  // Default the MIME we send to Supabase — if the browser sent one,
  // it's allowlisted; if not, infer from the (allowlisted) extension.
  const contentType = rawType || (ext === 'jpg' ? 'image/jpeg' : `image/${ext}`)
  return { ok: true, ext: ext || 'jpg', contentType }
}
