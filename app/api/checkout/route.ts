import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe, getPriceId, type Cadence, type Tier } from '@/lib/stripe'
import { hasPro, hasStarter } from '@/lib/plan'

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
  // Required env vars across the four (tier, cadence) combos. Legacy
  // STRIPE_BASE_/PREMIUM_PRICE_ID names are honored as Starter monthly
  // and yearly fallbacks via getPriceId, so check by attempting the
  // resolution rather than hard-coding env-name knowledge here.
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'server_misconfigured', message: 'Stripe is not fully configured. Contact support.' }, { status: 500 })
  }

  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(auth.slice(7))
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const tier: Tier       = body?.tier    === 'pro'    ? 'pro'    : 'starter'
  const cadence: Cadence = body?.cadence === 'yearly' ? 'yearly' : 'monthly'

  const { data: profile } = await db
    .from('profiles')
    .select('plan,stripe_customer_id,email,full_name')
    .eq('id', user.id)
    .single()

  // Already on a paid tier — kick to billing portal instead so they
  // manage the existing subscription rather than starting a duplicate.
  // (Switching tiers happens through the portal's "switch plan" flow.)
  if ((hasStarter(profile?.plan) || hasPro(profile?.plan)) && profile?.stripe_customer_id) {
    return NextResponse.json({ alreadyPaid: true })
  }

  let priceId: string
  try { priceId = getPriceId(tier, cadence) }
  catch (e: any) {
    return NextResponse.json({ error: 'price_misconfigured', message: e?.message ?? 'Price not configured.' }, { status: 500 })
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
    line_items: [{ price: priceId, quantity: 1 }],
    // Embed the Supabase user id so the webhook can map back to a row
    // even if the customer was created mid-checkout. Tier + cadence are
    // also embedded for diagnostic visibility in Stripe dashboards.
    client_reference_id: user.id,
    metadata: { supabase_user_id: user.id, tier, cadence },
    subscription_data: {
      metadata: { supabase_user_id: user.id, tier, cadence },
      // Pro tier gets a 14-day free trial; Starter does not (it's the
      // entry paid tier and Free already exists for trial-style usage).
      // The card is collected at checkout but no charge happens until
      // day 15 (or never if the user cancels in time).
      ...(tier === 'pro' ? { trial_period_days: 14 } : {}),
    },
    // Card required up front even for the Pro trial — Stripe will
    // honor trial_period_days but still collect payment details now.
    payment_method_collection: 'always',
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
