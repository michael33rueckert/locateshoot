import Stripe from 'stripe'

// Centralized Stripe client. Lazy-initialized so a missing key in local
// dev doesn't crash module import.

let stripeClient: Stripe | null = null
export function getStripe(): Stripe {
  if (stripeClient) return stripeClient
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not set')
  stripeClient = new Stripe(key)
  return stripeClient
}

// Three plan tiers. 'free' is the unpaid baseline; the others map to
// distinct Stripe products + prices.
export type Tier    = 'starter' | 'pro'
export type Cadence = 'monthly'  | 'yearly'

// Price-id resolution per (tier, cadence). Each combo has its own Stripe
// price. Env vars:
//   STRIPE_STARTER_MONTHLY_PRICE_ID  ($12/mo)
//   STRIPE_STARTER_YEARLY_PRICE_ID   ($120/yr)
//   STRIPE_PRO_MONTHLY_PRICE_ID      ($25/mo)
//   STRIPE_PRO_YEARLY_PRICE_ID       ($250/yr)
//
// Backwards-compat: the old STRIPE_BASE_PRICE_ID / STRIPE_PREMIUM_PRICE_ID
// (used while we only had one paid tier) fall through as Starter monthly
// + yearly so existing Vercel envs keep working until they're renamed.
export function getPriceId(tier: Tier, cadence: Cadence): string {
  const key = `STRIPE_${tier.toUpperCase()}_${cadence.toUpperCase()}_PRICE_ID`
  const id  = process.env[key]
    ?? (tier === 'starter' && cadence === 'monthly' ? process.env.STRIPE_BASE_PRICE_ID    : undefined)
    ?? (tier === 'starter' && cadence === 'yearly'  ? process.env.STRIPE_PREMIUM_PRICE_ID : undefined)
  if (!id) throw new Error(`Stripe price id missing: ${key}`)
  return id
}

// Reverse lookup — given a price ID from a webhook event, figure out
// which tier the photographer is now on. Used by the Stripe webhook to
// set profiles.plan correctly when subscriptions are created or
// switched between tiers via the Customer Portal.
export function tierFromPriceId(priceId: string | null | undefined): Tier | null {
  if (!priceId) return null
  if (priceId === process.env.STRIPE_PRO_MONTHLY_PRICE_ID)     return 'pro'
  if (priceId === process.env.STRIPE_PRO_YEARLY_PRICE_ID)      return 'pro'
  if (priceId === process.env.STRIPE_STARTER_MONTHLY_PRICE_ID) return 'starter'
  if (priceId === process.env.STRIPE_STARTER_YEARLY_PRICE_ID)  return 'starter'
  // Legacy env var support — see getPriceId above.
  if (priceId === process.env.STRIPE_BASE_PRICE_ID)    return 'starter'
  if (priceId === process.env.STRIPE_PREMIUM_PRICE_ID) return 'starter'
  return null
}

export function isProActive(status: string | null | undefined): boolean {
  // 'trialing' counts as paid for feature-access purposes — trial users
  // get the full plan during the trial. 'past_due' also still has access
  // by default; we only revoke once the subscription is actually
  // canceled or unpaid past the grace period.
  return status === 'active' || status === 'trialing' || status === 'past_due'
}
