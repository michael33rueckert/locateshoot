import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { check, clientIp } from '@/lib/rate-limit'

// Help-center "was this helpful?" vote receiver. Anonymous-friendly:
// signed-in visitors get their user_id attached when an Authorization
// header is present, otherwise the row is recorded with user_id null.
// Rate-limited per IP to keep someone from drowning the table in
// fake votes.

export async function POST(request: Request) {
  const ip = clientIp(request.headers)
  const rl = check(`help-feedback:${ip}`, { windowMs: 60 * 1000, max: 30 })
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const slug = typeof body.slug === 'string' ? body.slug.slice(0, 120) : ''
  const vote = body.vote === 'up' || body.vote === 'down' ? body.vote : null
  if (!slug || !vote) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Optional auth — attach user_id if the client sent a Bearer token.
  // No auth? Vote is recorded anonymously.
  let userId: string | null = null
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (token) {
    const { data: u } = await admin.auth.getUser(token)
    userId = u?.user?.id ?? null
  }

  const { error } = await admin.from('help_feedback').insert({
    slug, vote, user_id: userId,
  })
  if (error) {
    // Don't surface the SQL error to the client. Logging is enough
    // — the user already got their visual confirmation.
    console.warn('help_feedback insert failed', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
