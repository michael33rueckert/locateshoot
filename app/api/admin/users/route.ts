import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminEmail } from '@/lib/admin'

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: { user } } = await admin.auth.getUser(auth.slice(7))
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id,email,full_name,plan,created_at')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userIds = (profiles ?? []).map((p: any) => p.id)

  const [portfolioRes, shareLinksRes] = await Promise.all([
    admin.from('portfolio_locations').select('user_id').in('user_id', userIds),
    admin.from('share_links').select('user_id').in('user_id', userIds),
  ])

  const portfolioCounts: Record<string, number> = {}
  ;(portfolioRes.data ?? []).forEach((r: any) => {
    portfolioCounts[r.user_id] = (portfolioCounts[r.user_id] ?? 0) + 1
  })
  const shareCounts: Record<string, number> = {}
  ;(shareLinksRes.data ?? []).forEach((r: any) => {
    shareCounts[r.user_id] = (shareCounts[r.user_id] ?? 0) + 1
  })

  const users = (profiles ?? []).map((p: any) => ({
    ...p,
    portfolio_count:   portfolioCounts[p.id] ?? 0,
    share_link_count:  shareCounts[p.id] ?? 0,
  }))

  return NextResponse.json({ users })
}
