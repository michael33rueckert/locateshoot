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
    .select('plan,stripe_customer_id,stripe_subscription_id,email,full_name')
    .eq('id', user.id)
    .single()

  let priceId: string
  try { priceId = getPriceId(tier, cadence) }
  catch (e: any) {
    return NextResponse.json({ error: 'price_misconfigured', message: e?.message ?? 'Price not configured.' }, { status: 500 })
  }

  const stripe = getStripe()
  const appOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? new URL(request.url).origin

  // Already on a paid tier with an active subscription — Stripe forbids
  // a second checkout on the same customer, so route them into the
  // Customer Portal with a subscription_update_confirm flow that jumps
  // straight to the "confirm plan change" screen. One tap on their end
  // (Confirm) instead of the 4-click "Manage → Change plan → pick →
  // Update" walk through the generic portal.
  if ((hasStarter(profile?.plan) || hasPro(profile?.plan)) && profile?.stripe_customer_id && profile?.stripe_subscription_id) {
    try {
      const sub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id)
      const item = sub.items?.data?.[0]
      if (!item) throw new Error('subscription has no items')

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: profile.stripe_customer_id,
        return_url: `${appOrigin}/profile?checkout=success#billing`,
        flow_data: {
          type: 'subscription_update_confirm',
          subscription_update_confirm: {
            subscription: profile.stripe_subscription_id,
            items: [{ id: item.id, price: priceId, quantity: 1 }],
          },
          after_completion: {
            type: 'redirect',
            redirect: { return_url: `${appOrigin}/profile?checkout=success#billing` },
          },
        },
      })
      return NextResponse.json({ url: portalSession.url })
    } catch (e: any) {
      // Portal flow can fail if the subscription is canceled / past_due /
      // in a state Stripe can't update. Fall back to a plain portal
      // session so the user can still self-serve; we surface the fallback
      // rather than a 500 so the UI doesn't dead-end.
      console.warn('[checkout] portal flow failed, falling back to generic portal:', e?.message)
      try {
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: profile.stripe_customer_id,
          return_url: `${appOrigin}/profile?checkout=success#billing`,
        })
        return NextResponse.json({ url: portalSession.url })
      } catch (e2: any) {
        return NextResponse.json({ error: 'portal_failed', message: e2?.message ?? 'Could not open the billing portal.' }, { status: 500 })
      }
    }
  }

  // Paid tier flagged but subscription id missing (rare — mid-checkout
  // state, or a webhook race). Fall back to the alreadyPaid signal so
  // the client can open a plain portal via /api/billing-portal.
  if ((hasStarter(profile?.plan) || hasPro(profile?.plan)) && profile?.stripe_customer_id) {
    return NextResponse.json({ alreadyPaid: true })
  }
  // Success returns to /profile#billing so the fresh plan lands where
  // the user was managing it. Cancel returns to /dashboard — bailing
  // out of checkout means they're not committing to an upgrade, so
  // dropping them back at the Profile page reads as "you can try
  // again"; the dashboard is the natural home base instead.
  const successUrl = `${appOrigin}/profile?checkout=success#billing`
  const cancelUrl  = `${appOrigin}/dashboard?checkout=cancel`

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
    success_url: successUrl,
    cancel_url:  cancelUrl,
    allow_promotion_codes: true,
    // Tax handling stays Stripe's call by default — flip on once the
    // photographer has Tax configured in their Stripe account.
  })

  if (!session.url) {
    return NextResponse.json({ error: 'no_checkout_url' }, { status: 502 })
  }
  return NextResponse.json({ url: session.url })
}
