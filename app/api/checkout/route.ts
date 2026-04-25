import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe, getPriceId, type Cadence } from '@/lib/stripe'

// Create a Stripe Checkout Session for the Pro upgrade and return its URL.
// The client redirects the user to that URL; success/cancel both come
// back to /profile#billing.
//
// Customer reuse: if the photographer already has a stripe_customer_id
// on file (from a previous subscription that was canceled, or a
// half-finished checkout), we reuse it so they don't end up with
// duplicate customers in Stripe.

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_BASE_PRICE_ID || !process.env.STRIPE_PREMIUM_PRICE_ID) {
    return NextResponse.json({ error: 'server_misconfigured', message: 'Stripe is not fully configured. Contact support.' }, { status: 500 })
  }

  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(auth.slice(7))
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const cadence: Cadence = body?.cadence === 'yearly' ? 'yearly' : 'monthly'

  const { data: profile } = await db
    .from('profiles')
    .select('plan,stripe_customer_id,email,full_name')
    .eq('id', user.id)
    .single()

  // Already on Pro — kick to billing portal instead so they manage the
  // existing subscription rather than starting a duplicate.
  if ((profile?.plan === 'pro' || profile?.plan === 'Pro') && profile?.stripe_customer_id) {
    return NextResponse.json({ alreadyPro: true })
  }

  const stripe = getStripe()
  const appOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? new URL(request.url).origin
  const returnUrl = `${appOrigin}/profile#billing`

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    // Reuse an existing customer when we have one (e.g. they canceled
    // before, now upgrading again). Otherwise let Stripe create one based
    // on the email and we'll save the id when the webhook fires.
    ...(profile?.stripe_customer_id
      ? { customer: profile.stripe_customer_id }
      : { customer_email: user.email ?? profile?.email ?? undefined }),
    line_items: [{ price: getPriceId(cadence), quantity: 1 }],
    // Embed the Supabase user id so the webhook can map back to a row
    // even if the customer was created mid-checkout.
    client_reference_id: user.id,
    metadata: { supabase_user_id: user.id, cadence },
    subscription_data: {
      metadata: { supabase_user_id: user.id, cadence },
    },
    success_url: `${returnUrl}?checkout=success`,
    cancel_url:  `${returnUrl}?checkout=cancel`,
    allow_promotion_codes: true,
    // Tax handling stays Stripe's call by default — flip on once the
    // photographer has Tax configured in their Stripe account.
  })

  if (!session.url) {
    return NextResponse.json({ error: 'no_checkout_url' }, { status: 502 })
  }
  return NextResponse.json({ url: session.url })
}
