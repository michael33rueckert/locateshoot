// Share-or-copy helper. Uses the Web Share API when available (iOS,
// Android, Windows Chrome/Edge, macOS Safari) so the user gets the
// native OS share sheet — Messages, Mail, WhatsApp, AirDrop, etc.
// Falls back to clipboard for browsers that don't support it
// (notably Firefox on every platform, and Chrome on macOS/Linux
// where the share API often isn't wired to a native sheet).
//
// Returns the method that was actually used so the caller can show
// a "Link copied!" toast only when the clipboard fallback fired —
// when the share sheet opens, the sheet IS the user feedback and an
// additional toast would feel redundant.

export type ShareMethod = 'native' | 'clipboard' | 'failed'

export interface ShareInput {
  url:   string
  title?: string
  text?:  string
}

export async function shareOrCopy(input: ShareInput): Promise<{ method: ShareMethod; error?: string }> {
  const { url, title, text } = input

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    // canShare is optional in older Safari; treat undefined as "yes,
    // it can share this payload" since navigator.share itself is
    // already present.
    const canShare = typeof (navigator as any).canShare === 'function'
      ? (navigator as any).canShare({ url, title, text })
      : true
    if (canShare) {
      try {
        await navigator.share({ url, title, text })
        return { method: 'native' }
      } catch (err: any) {
        // User cancelled mid-share — treat as success (we don't fall
        // back to clipboard, otherwise we'd surprise them with a
        // copy they didn't ask for).
        if (err?.name === 'AbortError') return { method: 'native' }
        // Other errors (NotAllowedError, permission, etc.) — fall
        // through to clipboard.
      }
    }
  }

  try {
    await navigator.clipboard?.writeText(url)
    return { method: 'clipboard' }
  } catch (err: any) {
    return { method: 'failed', error: err?.message ?? 'Clipboard write failed' }
  }
}
