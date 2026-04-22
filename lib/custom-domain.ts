export const VERCEL_CNAME_TARGET = 'cname.vercel-dns.com'

export function getApexDomain(): string {
  return process.env.NEXT_PUBLIC_APEX_DOMAIN ?? 'locateshoot.com'
}

const HOST_RE = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i

export function validateCustomDomain(raw: string): { ok: true; domain: string } | { ok: false; error: string } {
  const trimmed = (raw ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^\./, '')
  if (!trimmed) return { ok: false, error: 'Enter a domain.' }
  if (trimmed.length > 253) return { ok: false, error: 'Domain is too long.' }
  if (!HOST_RE.test(trimmed)) return { ok: false, error: 'Not a valid hostname. Use a format like locations.yoursite.com' }
  const apex = getApexDomain().toLowerCase()
  if (trimmed === apex || trimmed.endsWith('.' + apex)) return { ok: false, error: `Use your own domain, not a subdomain of ${apex}.` }
  if (trimmed.endsWith('.vercel.app')) return { ok: false, error: 'Vercel preview domains can\'t be used as a custom domain.' }
  // Require a subdomain (no apex) — apex requires A records which we don't guide through yet.
  const parts = trimmed.split('.')
  if (parts.length < 3) return { ok: false, error: 'Use a subdomain like locations.yoursite.com (not the root yoursite.com).' }
  return { ok: true, domain: trimmed }
}

/** Build a public share-link URL, using the photographer's verified custom domain when present. */
export function buildShareUrl(slug: string, opts: { customDomain?: string | null; customDomainVerified?: boolean | null; origin?: string }): string {
  if (opts.customDomain && opts.customDomainVerified) {
    return `https://${opts.customDomain}/pick/${slug}`
  }
  const origin = opts.origin ?? (typeof window !== 'undefined' ? window.location.origin : `https://${getApexDomain()}`)
  return `${origin}/pick/${slug}`
}
