import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  validateSenderEmail,
  createSenderDomain,
  removeSenderDomain,
  getSenderDomain,
} from '@/lib/sender-domain'

// POST: register the photographer's email (the address they want to send
// from). We register the *domain* portion at Resend — once verified, the
// photographer can send from any address on that domain. The full email
// is what we use as the From header on outgoing client confirmations.
//
// DELETE: tear down — removes the Resend domain registration and clears
// the profile columns. After this the photographer's emails fall back to
// notifications@locateshoot.com.

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
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({
      error: 'server_misconfigured',
      message: 'Server missing RESEND_API_KEY. Contact support.',
    }, { status: 500 })
  }

  const user = await authUser(request)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: 'Sign in expired — refresh the page and try again.' }, { status: 401 })

  const db = admin()
  const { data: profile } = await db.from('profiles').select('plan,sender_email,sender_resend_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'profile_not_found', message: 'Profile record not found.' }, { status: 404 })
  if (profile.plan !== 'pro' && profile.plan !== 'Pro') {
    return NextResponse.json({ error: 'pro_required', message: 'Custom sending email is a Pro-plan feature.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const validation = validateSenderEmail(String(body?.email ?? ''))
  if (!validation.ok) return NextResponse.json({ error: 'invalid_email', message: validation.error }, { status: 400 })
  const { email, domain } = validation

  if (profile.sender_email && profile.sender_email.toLowerCase() !== email) {
    return NextResponse.json({ error: 'already_configured', message: 'Remove your existing sending email first.' }, { status: 409 })
  }

  // Soft-clash check at the app layer for a clearer error message before
  // round-tripping to Resend (which would also reject duplicates).
  const { data: clash } = await db.from('profiles').select('id').ilike('sender_email', email).neq('id', user.id).maybeSingle()
  if (clash) return NextResponse.json({ error: 'email_taken', message: 'That email is already in use by another account.' }, { status: 409 })

  // If the user already has the same address registered (re-clicking Save),
  // just refresh the records — don't try to re-create at Resend (it'd 409).
  if (profile.sender_email?.toLowerCase() === email && profile.sender_resend_id) {
    const status = await getSenderDomain(profile.sender_resend_id)
    if (!status.ok) return NextResponse.json({ error: 'resend_error', message: status.error }, { status: 502 })
    return NextResponse.json({ email, domain, id: status.id, state: status.status, records: status.records, verified: status.status === 'verified' })
  }

  const created = await createSenderDomain(domain)
  if (!created.ok) {
    return NextResponse.json({ error: 'resend_error', message: created.error }, { status: 502 })
  }

  await db.from('profiles').update({
    sender_email:     email,
    sender_resend_id: created.id,
    sender_verified:  created.status === 'verified',
    sender_added_at:  new Date().toISOString(),
  }).eq('id', user.id)

  return NextResponse.json({
    email,
    domain,
    id:       created.id,
    state:    created.status,
    records:  created.records,
    verified: created.status === 'verified',
  })
}

export async function DELETE(request: Request) {
  const user = await authUser(request)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const db = admin()
  const { data: profile } = await db.from('profiles').select('sender_resend_id').eq('id', user.id).single()
  if (profile?.sender_resend_id) {
    await removeSenderDomain(profile.sender_resend_id) // ignore errors — clear DB regardless
  }
  await db.from('profiles').update({
    sender_email:     null,
    sender_resend_id: null,
    sender_verified:  false,
    sender_added_at:  null,
  }).eq('id', user.id)
  return NextResponse.json({ ok: true })
}
