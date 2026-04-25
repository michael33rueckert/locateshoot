import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe'

// Create a Stripe Customer Portal session so a Pro photographer can
// manage their subscription (update card, change cadence, cancel) without
// us building any of that UI ourselves. The client redirects to the
// returned URL; Stripe handles everything from there and routes back to
// /profile#billing when the user is done.

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 })
  }

  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(auth.slice(7))
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: profile } = await db
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: 'no_subscription', message: 'No active subscription to manage.' }, { status: 404 })
  }

  const appOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? new URL(request.url).origin
  const session = await getStripe().billingPortal.sessions.create({
    customer:    profile.stripe_customer_id,
    return_url:  `${appOrigin}/profile#billing`,
  })

  return NextResponse.json({ url: session.url })
}
