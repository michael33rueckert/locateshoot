import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySenderDomain } from '@/lib/sender-domain'

// Returns the current state of the photographer's sender domain at Resend
// — DNS record list (with per-record verified/pending status), overall
// state, and whether we should treat the address as verified for sending.

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(auth.slice(7))
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles')
    .select('sender_email,sender_resend_id,sender_verified')
    .eq('id', user.id)
    .single()

  if (!profile?.sender_email || !profile.sender_resend_id) {
    return NextResponse.json({ email: null, state: 'none', records: [], verified: false })
  }

  const status = await verifySenderDomain(profile.sender_resend_id)
  if (!status.ok) {
    // Don't blow up — keep the saved email visible so the user can still
    // remove it. Surface the error in `detail`.
    return NextResponse.json({
      email:    profile.sender_email,
      state:    'unknown',
      records:  [],
      verified: !!profile.sender_verified,
      detail:   status.error,
    })
  }

  const verified = status.status === 'verified'
  if (verified !== !!profile.sender_verified) {
    await db.from('profiles').update({ sender_verified: verified }).eq('id', user.id)
  }

  return NextResponse.json({
    email:    profile.sender_email,
    state:    status.status,
    records:  status.records,
    verified,
  })
}
