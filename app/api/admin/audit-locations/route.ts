import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminEmail } from '@/lib/admin'

// Quality audit for the public locations table. Two complementary
// passes:
//
//   1. Duplicates — purely local fuzzy match on (normalized name,
//      same city, < 0.5 mile apart). No AI cost, no rate-limit
//      concerns. Mirrors the dedup logic the scan-locations endpoint
//      uses on inserts.
//
//   2. Suspicious entries — Claude eyeballs batches of rows and
//      flags ones that look wrong: name doesn't match the city,
//      coordinates suspiciously far from the city, low-quality
//      description, generic / unverifiable name, etc. Web search is
//      enabled so it can sanity-check that a place actually exists
//      where the row claims it does.
//
// Returns { duplicates, incorrect } where each entry carries enough
// info for the dashboard to render the row + offer Edit/Delete
// without a second round-trip.

export const maxDuration = 60

interface AuditLocation {
  id: string
  name: string
  city: string | null
  state: string | null
  latitude: number | null
  longitude: number | null
  description: string | null
  category: string | null
}

interface DuplicateFlag {
  type: 'duplicate'
  reason: string
  primary: AuditLocation       // older row — the one to KEEP by default
  duplicate: AuditLocation     // newer row — the one to remove by default
  distanceMiles: number
}

interface IncorrectFlag {
  type: 'incorrect'
  reason: string
  location: AuditLocation
}

// ── Fuzzy dedup (mirrors scan-locations) ─────────────────────────────────────

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(the|a|an|of|at|in|on|and|park|trail|area|lake|river|creek|garden|grove|historic|district)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function nameSimilarity(a: string, b: string): { match: boolean; reason: string } {
  const n1 = normalizeName(a)
  const n2 = normalizeName(b)
  if (!n1 || !n2) return { match: false, reason: '' }
  if (n1 === n2) return { match: true, reason: 'identical normalized names' }
  if (n1.length > 8 && n2.length > 8 && (n1.includes(n2) || n2.includes(n1))) {
    return { match: true, reason: 'one name contains the other' }
  }
  const w1 = n1.split(' ').filter(w => w.length > 3)
  const w2 = n2.split(' ').filter(w => w.length > 3)
  if (w1.length >= 2 && w2.length >= 2) {
    const common = w1.filter(w => w2.includes(w))
    const ratio = common.length / Math.min(w1.length, w2.length)
    if (ratio >= 0.75) return { match: true, reason: `${Math.round(ratio * 100)}% of significant words shared` }
  }
  return { match: false, reason: '' }
}

function distanceMiles(a: AuditLocation, b: AuditLocation): number {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return Infinity
  const R = 3958.7613
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)))
}

function findDuplicates(locs: AuditLocation[]): DuplicateFlag[] {
  // Bucket by normalized first city token to avoid O(n²) over
  // thousands of rows. Only compare rows in the same city.
  const buckets = new Map<string, AuditLocation[]>()
  for (const l of locs) {
    const cityKey = (l.city ?? '').toLowerCase().split(',')[0].trim()
    if (!cityKey) continue
    const list = buckets.get(cityKey) ?? []
    list.push(l)
    buckets.set(cityKey, list)
  }
  const flags: DuplicateFlag[] = []
  for (const list of buckets.values()) {
    if (list.length < 2) continue
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j]
        const sim = nameSimilarity(a.name, b.name)
        if (!sim.match) continue
        const dist = distanceMiles(a, b)
        // Names alone aren't enough — two different parks can share
        // a generic name. Require either matching coords (< 0.5 mi)
        // or one row missing coords entirely.
        const closeEnough = dist < 0.5 || !isFinite(dist)
        if (!closeEnough) continue
        // Older row is "primary" so the dashboard suggests removing
        // the newer duplicate by default.
        const [primary, duplicate] = a.id < b.id ? [a, b] : [b, a]
        flags.push({
          type: 'duplicate',
          reason: `${sim.reason}${isFinite(dist) ? ` · ${dist.toFixed(2)}mi apart` : ' · one row missing coords'}`,
          primary,
          duplicate,
          distanceMiles: isFinite(dist) ? dist : 0,
        })
      }
    }
  }
  return flags
}

// ── AI suspicious-entry detection ────────────────────────────────────────────

async function flagSuspiciousBatch(batch: AuditLocation[]): Promise<IncorrectFlag[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return []

  const items = batch.map(l => ({
    id:          l.id,
    name:        l.name,
    city:        l.city,
    state:       l.state,
    latitude:    l.latitude,
    longitude:   l.longitude,
    category:    l.category,
    description: l.description?.slice(0, 200) ?? null,
  }))

  const prompt = `You are auditing a database of real-world photoshoot locations for quality issues.

For each location below, decide if anything looks WRONG. Flag a location ONLY when you have a high-confidence concern. Examples of things to flag:
- The latitude/longitude clearly does not match the city/state given (e.g. coords land hundreds of miles from the named city).
- The name suggests a place that does not exist or is not a real location open for photography.
- The name is generic / placeholder-ish ("Park 1", "Some River").
- The description contains obvious factual errors or makes no sense for the named place.
- The category does not match what the name describes.

Do NOT flag locations just because they're sparse or the description is short — only flag concrete, defensible problems. Use web search to verify when uncertain.

Return STRICT JSON in this shape and nothing else:
{
  "flags": [
    { "id": "<uuid>", "reason": "<short, specific reason — one sentence>" }
  ]
}

If nothing is wrong, return: { "flags": [] }

Locations to audit:
${JSON.stringify(items)}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 4000,
      tools:      [{ type: 'web_search_20250305', name: 'web_search' }],
      messages:   [{ role: 'user', content: prompt }],
    }),
  })
  if (!response.ok) {
    console.error('audit-locations: claude error', response.status, await response.text().catch(() => ''))
    return []
  }
  const data = await response.json()
  // Concatenate all text blocks — the JSON we want lives in one of
  // them, possibly after some web-search tool blocks.
  const text = (data.content ?? [])
    .filter((c: any) => c.type === 'text')
    .map((c: any) => c.text)
    .join('\n')
  // Tolerate the model wrapping the JSON in prose / fences. Find the
  // first object that parses as { flags: [...] }.
  const match = text.match(/\{[\s\S]*"flags"\s*:\s*\[[\s\S]*?\]\s*\}/)
  if (!match) return []
  let parsed: any
  try { parsed = JSON.parse(match[0]) } catch { return [] }
  if (!parsed?.flags || !Array.isArray(parsed.flags)) return []
  const byId = new Map(batch.map(l => [l.id, l]))
  return parsed.flags
    .map((f: any) => {
      const loc = byId.get(f?.id)
      if (!loc || typeof f?.reason !== 'string') return null
      return { type: 'incorrect' as const, reason: f.reason.slice(0, 280), location: loc }
    })
    .filter(Boolean) as IncorrectFlag[]
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // Bearer auth + admin-email gate, same shape as scan-locations.
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: u } = await admin.auth.getUser(token)
  if (!u?.user?.email || !isAdminEmail(u.user.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Optional ?batch= controls which AI batch to process. Lets the
  // client step through the table 50 rows at a time without blowing
  // the 60s function timeout. Duplicate detection is local and fast,
  // so it always runs on the full list and is returned on batch=0.
  const url = new URL(request.url)
  const batchIndex = Math.max(0, parseInt(url.searchParams.get('batch') ?? '0', 10) || 0)
  const BATCH_SIZE = 50

  const { data: rows, error } = await admin
    .from('locations')
    .select('id,name,city,state,latitude,longitude,description,category')
    .eq('status', 'published')
    .order('created_at', { ascending: true })
    .limit(2000)
  if (error) return NextResponse.json({ error: 'query_failed', message: error.message }, { status: 500 })

  const all: AuditLocation[] = (rows ?? []) as AuditLocation[]
  const totalBatches = Math.max(1, Math.ceil(all.length / BATCH_SIZE))

  // Local duplicates: only computed on batch=0 and shipped once,
  // since they're cheap and depend on the FULL set, not a slice.
  const duplicates = batchIndex === 0 ? findDuplicates(all) : []

  // AI flags: just this slice.
  const start = batchIndex * BATCH_SIZE
  const slice = all.slice(start, start + BATCH_SIZE)
  const incorrect = slice.length > 0 ? await flagSuspiciousBatch(slice) : []

  return NextResponse.json({
    batchIndex,
    totalBatches,
    totalLocations: all.length,
    batchSize: slice.length,
    duplicates,
    incorrect,
  })
}
