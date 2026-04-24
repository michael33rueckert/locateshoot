import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Remove a browser's push subscription. Called from lib/push.ts after
// the browser-side unsubscribe() — drops our DB row so submit-pick
// doesn't try to push to a stale endpoint.

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : ''
  if (!endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 })

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'not signed in' }, { status: 401 })
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: { user } } = await admin.auth.getUser(authHeader.slice(7))
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { error } = await admin
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
