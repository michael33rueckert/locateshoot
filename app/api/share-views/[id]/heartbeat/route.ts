import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// POST /api/share-views/[id]/heartbeat — increments total_seconds on a
// view session and bumps last_heartbeat_at. The client pings every ~15s
// while the page is visible; we accumulate the delta on the server so a
// dropped/delayed beacon doesn't double-count.

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const MAX_BEAT_SECONDS = 30 // cap each heartbeat so a long-paused tab doesn't dump 30 minutes in one ping

export async function POST(request: Request, context: any) {
  const { id } = await context.params
  if (typeof id !== 'string') return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const rawSeconds = Number(body?.seconds)
  if (!Number.isFinite(rawSeconds) || rawSeconds <= 0) {
    return NextResponse.json({ error: 'invalid seconds' }, { status: 400 })
  }
  const seconds = Math.min(MAX_BEAT_SECONDS, Math.round(rawSeconds))

  const db = admin()
  const { data: row } = await db.from('share_link_views').select('total_seconds').eq('id', id).single()
  if (!row) return NextResponse.json({ ok: false }, { status: 404 })

  await db.from('share_link_views').update({
    total_seconds:    (row.total_seconds ?? 0) + seconds,
    last_heartbeat_at: new Date().toISOString(),
  }).eq('id', id)

  return NextResponse.json({ ok: true })
}
