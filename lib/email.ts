import { Resend } from 'resend'

// Centralized Resend client + sender address. Import and call sendEmail() from
// any server route/action — it no-ops with a warning if RESEND_API_KEY is missing
// so local dev without secrets doesn't crash the request.

const FROM = 'LocateShoot <notifications@locateshoot.com>'

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
}

export async function sendEmail({ to, subject, html, replyTo }: SendArgs): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const client = getClient()
  if (!client) {
    console.warn('sendEmail: RESEND_API_KEY not set — dropping message', { to, subject })
    return { ok: false, error: 'email-not-configured' }
  }
  const { data, error } = await client.emails.send({
    from: FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    ...(replyTo ? { reply_to: replyTo } : {}),
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
