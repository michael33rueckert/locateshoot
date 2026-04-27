import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminEmail } from '@/lib/admin'

const ALLOWED_PLANS = ['free', 'starter', 'pro'] as const

export async function POST(request: Request) {
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

  const body = await request.json().catch(() => ({}))
  const userId = String(body?.userId ?? '')
  const plan   = String(body?.plan ?? '')
  if (!userId)                                  return NextResponse.json({ error: 'userId_required' }, { status: 400 })
  if (!ALLOWED_PLANS.includes(plan as any))     return NextResponse.json({ error: 'invalid_plan', message: `Plan must be one of: ${ALLOWED_PLANS.join(', ')}` }, { status: 400 })

  const { error } = await admin.from('profiles').update({ plan }).eq('id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, userId, plan })
}
