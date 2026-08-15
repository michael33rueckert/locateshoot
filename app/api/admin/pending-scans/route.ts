import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminEmail } from '@/lib/admin'

// Service-role list of pending AI-scanner-auto rows for the admin
// swipe review. Bypasses RLS so the client doesn't have to depend on
// a policy that permits authenticated reads of non-published locations
// — the existing 'Locations are public' policy is written for
// published rows and pending scanner picks were returning empty from
// the client even when the DB had them.

async function requireAdmin(request: Request) {
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return { err: NextResponse.json({ error: 'unauthorized' }, { status: 401 }), admin: null }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: { user } } = await admin.auth.getUser(token)
  if (!user || !isAdminEmail(user.email)) {
    return { err: NextResponse.json({ error: 'forbidden' }, { status: 403 }), admin: null }
  }
  return { err: null, admin }
}

export async function GET(request: Request) {
  const { err, admin } = await requireAdmin(request)
  if (err) return err

  const url = new URL(request.url)
  const countOnly = url.searchParams.get('countOnly') === '1'

  if (countOnly) {
    const { count } = await admin!
      .from('locations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .eq('source', 'ai_scanner_auto')
    return NextResponse.json({ count: count ?? 0 })
  }

  const { data, error } = await admin!
    .from('locations')
    .select('id,name,city,state,latitude,longitude,description,category,quality_score,rating,tags,best_time,parking_info,created_at')
    .eq('status', 'pending')
    .eq('source', 'ai_scanner_auto')
    .order('created_at', { ascending: true })
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data ?? [] })
}
