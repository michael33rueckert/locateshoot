import { Resend } from 'resend'

// Wrappers around Resend's domains API used by the Profile page's "Custom
// Sending Email" flow. Each photographer registers their own domain so
// emails to clients can come From: their own address with proper SPF/DKIM
// instead of notifications@locateshoot.com.

let client: Resend | null = null
function getClient(): Resend {
  if (client) return client
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY not set')
  client = new Resend(key)
  return client
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateSenderEmail(raw: string): { ok: true; email: string; domain: string } | { ok: false; error: string } {
  const trimmed = (raw ?? '').trim().toLowerCase()
  if (!trimmed) return { ok: false, error: 'Enter your email address.' }
  if (!EMAIL_RE.test(trimmed)) return { ok: false, error: 'That doesn\'t look like a valid email address.' }
  const domain = trimmed.split('@')[1]
  if (!domain) return { ok: false, error: 'Email is missing a domain.' }
  // Block sending from common provider mailboxes — they don't let you add
  // SPF/DKIM, and Resend will reject the verification anyway. Better to fail
  // fast with a clear error than after the user has read the DNS docs.
  const blocked = ['gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com']
  if (blocked.includes(domain)) {
    return { ok: false, error: `${domain} addresses can't be used as a sending domain — use an email at your own custom domain (e.g. you@yoursite.com).` }
  }
  // The LocateShoot apex itself is reserved for our own sending.
  const apex = (process.env.NEXT_PUBLIC_APEX_DOMAIN ?? 'locateshoot.com').toLowerCase()
  if (domain === apex || domain.endsWith('.' + apex)) {
    return { ok: false, error: `Use your own domain, not ${apex}.` }
  }
  return { ok: true, email: trimmed, domain }
}

export interface SenderDnsRecord {
  // Subset of Resend's record shape we care about for the UI. Resend returns
  // the full record list (SPF, DKIM, optional DMARC) with per-record status.
  record:  string         // 'SPF' | 'DKIM' | 'DMARC' | 'MX'
  type:    string         // 'TXT' | 'MX'
  name:    string         // host portion the user adds at their DNS provider
  value:   string         // the record's value
  status?: string         // 'verified' | 'pending' | 'not_started' | ...
  ttl?:    string | number
  priority?: number       // for MX
}

export interface CreateResult {
  ok: true
  id: string
  status: string
  records: SenderDnsRecord[]
}
export interface ErrResult { ok: false; error: string }

export async function createSenderDomain(domain: string): Promise<CreateResult | ErrResult> {
  try {
    const r = await getClient().domains.create({ name: domain })
    if ((r as any).error) return { ok: false, error: (r as any).error.message ?? 'Resend rejected the domain.' }
    const data: any = (r as any).data ?? r
    return {
      ok: true,
      id: data.id,
      status: data.status ?? 'pending',
      records: (data.records ?? []) as SenderDnsRecord[],
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Failed to register domain with Resend.' }
  }
}

export async function getSenderDomain(id: string): Promise<CreateResult | ErrResult> {
  try {
    const r = await getClient().domains.get(id)
    if ((r as any).error) return { ok: false, error: (r as any).error.message ?? 'Could not load domain status.' }
    const data: any = (r as any).data ?? r
    return {
      ok: true,
      id: data.id,
      status: data.status ?? 'pending',
      records: (data.records ?? []) as SenderDnsRecord[],
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Could not load domain status.' }
  }
}

export async function verifySenderDomain(id: string): Promise<CreateResult | ErrResult> {
  // Trigger a re-check at Resend, then return the latest state. Resend's
  // verify call doesn't always return the records list, so re-fetch.
  try {
    await getClient().domains.verify(id)
  } catch {
    // Non-fatal — fall through to a status fetch.
  }
  return getSenderDomain(id)
}

export async function removeSenderDomain(id: string): Promise<{ ok: true } | ErrResult> {
  try {
    await getClient().domains.remove(id)
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Could not remove domain at Resend.' }
  }
}
