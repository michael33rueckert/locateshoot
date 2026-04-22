const API = 'https://api.vercel.com'

function teamSuffix() {
  const team = process.env.VERCEL_TEAM_ID
  return team ? `?teamId=${team}` : ''
}

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.VERCEL_API_TOKEN!}`,
    'Content-Type': 'application/json',
  }
}

function projectId() {
  return process.env.VERCEL_PROJECT_ID!
}

export async function addProjectDomain(domain: string) {
  const res = await fetch(`${API}/v10/projects/${projectId()}/domains${teamSuffix()}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name: domain }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false as const, status: res.status, error: data?.error?.message ?? data?.message ?? `Vercel error (${res.status})`, code: data?.error?.code ?? null }
  return { ok: true as const, data }
}

export async function removeProjectDomain(domain: string) {
  const res = await fetch(`${API}/v9/projects/${projectId()}/domains/${encodeURIComponent(domain)}${teamSuffix()}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => ({}))
    return { ok: false as const, error: data?.error?.message ?? `Vercel error (${res.status})` }
  }
  return { ok: true as const }
}

export async function getProjectDomain(domain: string) {
  const res = await fetch(`${API}/v9/projects/${projectId()}/domains/${encodeURIComponent(domain)}${teamSuffix()}`, {
    headers: authHeaders(),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false as const, status: res.status, error: data?.error?.message ?? `Vercel error (${res.status})` }
  return { ok: true as const, data }
}

export async function getDomainConfig(domain: string) {
  const res = await fetch(`${API}/v6/domains/${encodeURIComponent(domain)}/config${teamSuffix()}`, {
    headers: authHeaders(),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false as const, error: data?.error?.message ?? `Vercel error (${res.status})` }
  return { ok: true as const, data }
}

/** Combined: domain + config → "verified" | "pending_dns" | "misconfigured". */
export async function checkDomainStatus(domain: string): Promise<{ state: 'verified' | 'pending_dns' | 'misconfigured'; detail?: string }> {
  const [d, cfg] = await Promise.all([getProjectDomain(domain), getDomainConfig(domain)])
  if (!d.ok) {
    if (d.status === 404) return { state: 'pending_dns', detail: 'Domain not registered on project' }
    return { state: 'misconfigured', detail: d.error }
  }
  const verified = !!d.data?.verified
  const misconfigured = cfg.ok ? !!cfg.data?.misconfigured : false
  if (verified && !misconfigured) return { state: 'verified' }
  if (misconfigured) return { state: 'misconfigured', detail: 'DNS record doesn\'t point to cname.vercel-dns.com yet.' }
  return { state: 'pending_dns', detail: 'Waiting for DNS propagation + verification.' }
}
