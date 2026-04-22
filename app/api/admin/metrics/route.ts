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

  const [profilesRes, locationsRes, shareLinksRes, picksRes, portfolioRes] = await Promise.all([
    admin.from('profiles').select('id,plan,created_at'),
    admin.from('locations').select('id,status', { count: 'exact', head: false }),
    admin.from('share_links').select('id,is_permanent,created_at'),
    admin.from('client_picks').select('id'),
    admin.from('portfolio_locations').select('id,user_id'),
  ])

  const profiles = profilesRes.data ?? []
  const locations = locationsRes.data ?? []
  const shareLinks = shareLinksRes.data ?? []
  const picks = picksRes.data ?? []
  const portfolio = portfolioRes.data ?? []

  const planCounts: Record<string, number> = {}
  profiles.forEach((p: any) => {
    const plan = p.plan ?? 'free'
    planCounts[plan] = (planCounts[plan] ?? 0) + 1
  })

  const locationStatus: Record<string, number> = {}
  locations.forEach((l: any) => {
    locationStatus[l.status ?? 'unknown'] = (locationStatus[l.status ?? 'unknown'] ?? 0) + 1
  })

  const portfolioByUser: Record<string, number> = {}
  portfolio.forEach((p: any) => {
    portfolioByUser[p.user_id] = (portfolioByUser[p.user_id] ?? 0) + 1
  })

  const now = Date.now()
  const newProfiles7d = profiles.filter((p: any) => now - new Date(p.created_at).getTime() < 7 * 86400000).length
  const newShareLinks7d = shareLinks.filter((s: any) => now - new Date(s.created_at).getTime() < 7 * 86400000).length

  return NextResponse.json({
    users: {
      total: profiles.length,
      by_plan: planCounts,
      new_this_week: newProfiles7d,
    },
    locations: {
      total: locations.length,
      by_status: locationStatus,
    },
    share_links: {
      total: shareLinks.length,
      permanent: shareLinks.filter((s: any) => s.is_permanent).length,
      new_this_week: newShareLinks7d,
    },
    client_picks: {
      total: picks.length,
    },
    portfolio: {
      total_rows: portfolio.length,
      active_users: Object.keys(portfolioByUser).length,
    },
  })
}
