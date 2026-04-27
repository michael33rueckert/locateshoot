// Lightweight in-memory rate limiter for public API routes.
//
// Why in-memory and not Redis/KV:
// - Beta scale (≤ a few hundred users) doesn't justify the dependency.
// - Vercel serverless functions reuse the same process for warm
//   invocations within a region, so this gives meaningful throttling
//   for ~80–95% of requests in practice. A determined attacker can
//   bypass by hitting different regions, but they'd need many cold
//   invocations to do real damage and the limits are small enough
//   that Vercel's own DDoS protection picks up before this becomes
//   the real defense.
// - Easy to swap for Vercel KV later — same `check(key, opts)` API.
//
// The buckets map is module-level, so it persists across requests in
// a warm Lambda. We periodically prune expired entries to stop the
// map growing unboundedly under sustained traffic.

interface Bucket {
  count: number
  resetAt: number   // epoch ms when count resets to 0
}

const BUCKETS = new Map<string, Bucket>()
const PRUNE_EVERY = 1000   // entries
const PRUNE_HEADROOM = 5000

function pruneIfBig(now: number) {
  if (BUCKETS.size < PRUNE_HEADROOM) return
  let pruned = 0
  for (const [key, bucket] of BUCKETS) {
    if (bucket.resetAt <= now) { BUCKETS.delete(key); pruned++ }
    if (pruned >= PRUNE_EVERY) break
  }
}

export interface RateLimitOptions {
  windowMs: number    // bucket window length in ms
  max:      number    // max requests per window per key
}

export interface RateLimitResult {
  ok:        boolean
  remaining: number
  resetAt:   number
}

// `check` is the only public API. Returns ok=false when the caller
// should be rejected. Callers convert the result into a 429 response
// themselves.
export function check(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  pruneIfBig(now)

  const existing = BUCKETS.get(key)
  if (!existing || existing.resetAt <= now) {
    const fresh: Bucket = { count: 1, resetAt: now + opts.windowMs }
    BUCKETS.set(key, fresh)
    return { ok: true, remaining: opts.max - 1, resetAt: fresh.resetAt }
  }

  if (existing.count >= opts.max) {
    return { ok: false, remaining: 0, resetAt: existing.resetAt }
  }

  existing.count++
  return { ok: true, remaining: opts.max - existing.count, resetAt: existing.resetAt }
}

// Best-effort client IP extraction. Vercel sets x-forwarded-for; we
// take the first hop. Falls back to a constant so behind-proxy
// callers are throttled together (better than no throttling, worse
// than per-IP — fine for beta).
export function clientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for') ?? ''
  const first = xff.split(',')[0]?.trim()
  if (first) return first
  return headers.get('x-real-ip') ?? 'unknown'
}
