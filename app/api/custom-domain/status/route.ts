import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkDomainStatus } from '@/lib/vercel'
import { VERCEL_CNAME_TARGET } from '@/lib/custom-domain'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(auth.slice(7))
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('custom_domain,custom_domain_verified').eq('id', user.id).single()
  if (!profile?.custom_domain) {
    return NextResponse.json({ domain: null, state: 'none', cname_target: VERCEL_CNAME_TARGET })
  }

  const status = await checkDomainStatus(profile.custom_domain)
  const verified = status.state === 'verified'
  if (verified !== profile.custom_domain_verified) {
    await db.from('profiles').update({ custom_domain_verified: verified }).eq('id', user.id)
  }
  return NextResponse.json({
    domain: profile.custom_domain,
    state: status.state,
    detail: status.detail ?? null,
    cname_target: VERCEL_CNAME_TARGET,
    verified,
  })
}
