import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { check, clientIp } from '@/lib/rate-limit'

// POST /api/share-views — start a view session. Called once per page load
// on /pick/[slug]. Returns { viewId } which the client uses for heartbeat
// pings (see /api/share-views/[id]/heartbeat).
//
// Anonymous endpoint — no auth required. The viewer is the photographer's
// client, who's never signed in. We use the service role to write since
// RLS blocks anon writes to share_link_views.

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body.shareLinkId !== 'string') {
    return NextResponse.json({ error: 'shareLinkId required' }, { status: 400 })
  }

  // Cap per-IP-per-link views at 30/hour. A real client opens the
  // pick page a few times at most; anything more is either curl
  // looping or a bug. Throttling prevents trivial inflation of the
  // analytics counts on any photographer's guide.
  const ip = clientIp(request.headers)
  const rl = check(`share-views:${ip}:${body.shareLinkId}`, { windowMs: 60 * 60 * 1000, max: 30 })
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const db = admin()
  // Verify the share link exists. Cheap guard against a malicious client
  // flooding the table with bogus shareLinkIds.
  const { data: link } = await db.from('share_links').select('id').eq('id', body.shareLinkId).single()
  if (!link) return NextResponse.json({ error: 'share link not found' }, { status: 404 })

  // "Unique viewer" hash — IP + user-agent + day. Lets the dashboard
  // count distinct visitors without storing the IP itself. Same client
  // tomorrow becomes a new unique visit which is a reasonable approximation.
  const ua = request.headers.get('user-agent') ?? ''
  const day = new Date().toISOString().slice(0, 10)
  const viewerHash = createHash('sha256').update(`${ip}|${ua}|${day}`).digest('hex')

  const { data: inserted, error } = await db.from('share_link_views').insert({
    share_link_id: body.shareLinkId,
    viewer_hash:   viewerHash,
    user_agent:    ua.slice(0, 500),
  }).select('id').single()

  if (error || !inserted) {
    console.error('[share-views] insert failed', error)
    // Non-fatal — return ok=false so the client doesn't retry forever
    // but doesn't surface an error to the viewer either.
    return NextResponse.json({ ok: false })
  }

  return NextResponse.json({ ok: true, viewId: inserted.id })
}
