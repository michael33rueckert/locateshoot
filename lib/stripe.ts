import Stripe from 'stripe'

// Centralized Stripe client. Lazy-initialized so a missing key in local
// dev doesn't crash module import. The two price IDs in env are the
// monthly and yearly Pro tiers — see the home-page PricingToggle for
// the public-facing copy.

let stripeClient: Stripe | null = null
export function getStripe(): Stripe {
  if (stripeClient) return stripeClient
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not set')
  stripeClient = new Stripe(key)
  return stripeClient
}

export type Cadence = 'monthly' | 'yearly'

export function getPriceId(cadence: Cadence): string {
  // Monthly = $12/mo, Yearly = $120/yr ($10/mo equivalent). The env names
  // ("base"/"premium") predate the new naming — base is monthly here.
  const monthly = process.env.STRIPE_BASE_PRICE_ID
  const yearly  = process.env.STRIPE_PREMIUM_PRICE_ID
  const id = cadence === 'yearly' ? yearly : monthly
  if (!id) throw new Error(`Stripe price id missing for cadence=${cadence}`)
  return id
}

export function isProActive(status: string | null | undefined): boolean {
  // 'trialing' counts as Pro for feature-access purposes — Stripe trial
  // users get the full plan during the trial. 'past_due' also still has
  // access by default; we only revoke once the subscription is actually
  // canceled or unpaid past the grace period.
  return status === 'active' || status === 'trialing' || status === 'past_due'
}
