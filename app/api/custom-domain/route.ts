import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateCustomDomain } from '@/lib/custom-domain'
import { addProjectDomain, removeProjectDomain, checkDomainStatus } from '@/lib/vercel'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function authUser(request: Request) {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const { data: { user } } = await admin().auth.getUser(auth.slice(7))
  return user
}

export async function POST(request: Request) {
  const user = await authUser(request)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const db = admin()
  const { data: profile } = await db.from('profiles').select('plan,custom_domain').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'profile_not_found' }, { status: 404 })
  if (profile.plan !== 'pro' && profile.plan !== 'Pro') {
    return NextResponse.json({ error: 'pro_required', message: 'Custom domains are a Pro-plan feature.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const validation = validateCustomDomain(String(body?.domain ?? ''))
  if (!validation.ok) return NextResponse.json({ error: 'invalid_domain', message: validation.error }, { status: 400 })
  const domain = validation.domain

  if (profile.custom_domain && profile.custom_domain.toLowerCase() !== domain) {
    return NextResponse.json({ error: 'already_configured', message: 'Remove your existing domain first.' }, { status: 409 })
  }

  // Unique index on profiles.custom_domain catches another user having it, but check early for a nicer error.
  const { data: clash } = await db.from('profiles').select('id').ilike('custom_domain', domain).neq('id', user.id).maybeSingle()
  if (clash) return NextResponse.json({ error: 'domain_taken', message: 'That domain is already in use by another account.' }, { status: 409 })

  const add = await addProjectDomain(domain)
  // Vercel returns 409 "domain_already_in_use" if domain exists on any project. Surface a clear message.
  if (!add.ok && add.code === 'domain_already_in_use') {
    return NextResponse.json({ error: 'domain_taken', message: 'That domain is already registered to another LocateShoot account or project. Contact support.' }, { status: 409 })
  }
  if (!add.ok) return NextResponse.json({ error: 'vercel_error', message: add.error }, { status: 502 })

  const status = await checkDomainStatus(domain)
  const verified = status.state === 'verified'

  await db.from('profiles').update({
    custom_domain:          domain,
    custom_domain_verified: verified,
    custom_domain_added_at: new Date().toISOString(),
  }).eq('id', user.id)

  return NextResponse.json({ domain, verified, state: status.state, detail: status.detail ?? null })
}

export async function DELETE(request: Request) {
  const user = await authUser(request)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const db = admin()
  const { data: profile } = await db.from('profiles').select('custom_domain').eq('id', user.id).single()
  const existing = profile?.custom_domain
  if (existing) {
    await removeProjectDomain(existing) // ignore errors — we still want to clear the DB
  }
  await db.from('profiles').update({
    custom_domain: null,
    custom_domain_verified: false,
    custom_domain_added_at: null,
  }).eq('id', user.id)
  return NextResponse.json({ ok: true })
}
