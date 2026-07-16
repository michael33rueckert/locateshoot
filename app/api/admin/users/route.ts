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

  // Portfolio + share-link counts join public tables. Last-sign-in
  // lives on auth.users and isn't exposed via the profiles view, so
  // we pull it from the admin auth API in the same batch. listUsers
  // returns the current page (1-based); perPage=1000 keeps this to
  // a single request as long as total users stays under the profiles
  // cap of 500 above.
  const [portfolioRes, shareLinksRes, authRes] = await Promise.all([
    admin.from('portfolio_locations').select('user_id').in('user_id', userIds),
    admin.from('share_links').select('user_id').in('user_id', userIds),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ])

  const portfolioCounts: Record<string, number> = {}
  ;(portfolioRes.data ?? []).forEach((r: any) => {
    portfolioCounts[r.user_id] = (portfolioCounts[r.user_id] ?? 0) + 1
  })
  const shareCounts: Record<string, number> = {}
  ;(shareLinksRes.data ?? []).forEach((r: any) => {
    shareCounts[r.user_id] = (shareCounts[r.user_id] ?? 0) + 1
  })
  // Map auth-user rows back to profile ids so the UI can show a
  // last-login column. Null means the account has never signed in
  // (created but not yet confirmed / never logged in).
  const lastSignInById: Record<string, string | null> = {}
  ;(authRes?.data?.users ?? []).forEach((u: any) => {
    lastSignInById[u.id] = u.last_sign_in_at ?? null
  })

  const users = (profiles ?? []).map((p: any) => ({
    ...p,
    portfolio_count:    portfolioCounts[p.id] ?? 0,
    share_link_count:   shareCounts[p.id] ?? 0,
    last_sign_in_at:    lastSignInById[p.id] ?? null,
  }))

  return NextResponse.json({ users })
}
