import { Resend } from 'resend'

// Centralized Resend client + sender address. Import and call sendEmail() from
// any server route/action — it no-ops with a warning if RESEND_API_KEY is missing
// so local dev without secrets doesn't crash the request.

const SENDING_ADDRESS = 'notifications@locateshoot.com'
const DEFAULT_FROM_NAME = 'LocateShoot'

let resendClient: Resend | null = null
function getClient(): Resend | null {
  if (resendClient) return resendClient
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  resendClient = new Resend(key)
  return resendClient
}

export interface SendArgs {
  to: string | string[]
  subject: string
  html: string
  replyTo?: string
  // Override the From header's display name (e.g. "Jane Doe Photography").
  fromName?: string
  // Override the From header's address. Default is notifications@locateshoot.com
  // (the only domain in our shared Resend account). Pro photographers who
  // verified their own sending domain via the Profile page get their address
  // here so the recipient sees jane@studio.com instead.
  fromAddress?: string
}

export async function sendEmail({ to, subject, html, replyTo, fromName, fromAddress }: SendArgs): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const client = getClient()
  if (!client) {
    console.warn('sendEmail: RESEND_API_KEY not set — dropping message', { to, subject })
    return { ok: false, error: 'email-not-configured' }
  }
  // Display name → strip characters that would break the From header
  // syntax (commas/quotes), then bracket the address.
  const displayName = (fromName ?? DEFAULT_FROM_NAME).replace(/["<>,;]/g, '').trim() || DEFAULT_FROM_NAME
  const sendingAddr = (fromAddress ?? SENDING_ADDRESS).trim()
  const from = `${displayName} <${sendingAddr}>`
  const { data, error } = await client.emails.send({
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    // Resend v6+ uses replyTo (camelCase). Set both spellings to be safe
    // across transient SDK/API mismatches.
    ...(replyTo ? { replyTo, reply_to: replyTo } : {}),
  } as any)
  if (error) {
    console.error('sendEmail: resend returned error', error)
    return { ok: false, error: error.message ?? 'send-failed' }
  }
  return { ok: true, id: data?.id ?? '' }
}

// Minimal HTML-escape for user-provided strings we drop into email bodies.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
