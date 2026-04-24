import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Store a browser's push subscription so /api/submit-pick can send a
// native notification when a client picks a location. Authenticates via
// the Supabase access token in the Authorization header (matching the
// rest of the app's API routes) and then uses the service role to
// upsert the row.

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  const endpoint  = typeof body.endpoint === 'string' ? body.endpoint : ''
  const p256dh    = body.keys?.p256dh
  const auth      = body.keys?.auth
  const userAgent = typeof body.userAgent === 'string' ? body.userAgent.slice(0, 500) : null
  if (!endpoint || typeof p256dh !== 'string' || typeof auth !== 'string') {
    return NextResponse.json({ error: 'missing endpoint or keys' }, { status: 400 })
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'not signed in' }, { status: 401 })
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: { user } } = await admin.auth.getUser(authHeader.slice(7))
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  // Upsert — a second subscribe from the same browser should refresh the
  // row (user_agent may have changed, bump last_used_at) rather than
  // error on the unique constraint.
  const { error } = await admin.from('push_subscriptions').upsert({
    user_id:      user.id,
    endpoint,
    p256dh,
    auth,
    user_agent:   userAgent,
    last_used_at: new Date().toISOString(),
  }, { onConflict: 'user_id,endpoint' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
