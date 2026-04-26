import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { getStripe, isProActive, tierFromPriceId } from '@/lib/stripe'

// Stripe webhook — single source of truth for profiles.plan. Every
// subscription state change (created, updated, deleted, payment failed,
// trial ending, etc.) flows through here and we mirror the relevant bits
// onto the photographer's row.
//
// Configuration in Stripe dashboard:
//   - Endpoint URL: https://<your-domain>/api/webhook/stripe
//   - Events to listen to:
//       customer.subscription.created
//       customer.subscription.updated
//       customer.subscription.deleted
//       invoice.payment_failed
//       checkout.session.completed (only used to capture customer id on
//         the very first checkout — the subscription event below carries
//         the same data, but the order isn't guaranteed)
//   - Signing secret → STRIPE_WEBHOOK_SECRET env var.

export const runtime = 'nodejs' // Stripe needs the raw body, edge isn't ideal here.

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function findUserId(db: ReturnType<typeof admin>, customerId: string, fallbackUserId?: string | null): Promise<string | null> {
  if (fallbackUserId) return fallbackUserId
  const { data } = await db.from('profiles').select('id').eq('stripe_customer_id', customerId).maybeSingle()
  return data?.id ?? null
}

async function syncSubscription(db: ReturnType<typeof admin>, sub: Stripe.Subscription, fallbackUserId?: string | null) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const userId = await findUserId(db, customerId, fallbackUserId ?? (sub.metadata?.supabase_user_id ?? null))
  if (!userId) {
    console.warn('[stripe webhook] could not resolve user for subscription', { subId: sub.id, customerId })
    return
  }

  const active = isProActive(sub.status)
  // Resolve the period end. Stripe types put it on the subscription
  // root (current_period_end), but on some API versions it's only on
  // each subscription_item — fall back when the root is missing so we
  // still populate plan_renews_at.
  const periodEndUnix = (sub as any).current_period_end
    ?? sub.items?.data?.[0]?.current_period_end
    ?? null

  // "Will cancel" detection — Stripe's newer API stopped flipping the
  // cancel_at_period_end boolean for portal-initiated cancellations and
  // instead sets cancel_at to a Unix timestamp (usually = period end).
  // Treat either signal as "scheduled to cancel" so the UI shows
  // "Cancels on …" correctly. When cancel_at is set we prefer it for
  // the displayed date; otherwise we fall back to current_period_end.
  const cancelAtUnix = (sub as any).cancel_at as number | null | undefined
  const willCancel   = !!sub.cancel_at_period_end || !!cancelAtUnix
  const cancelDate   = cancelAtUnix ? new Date(cancelAtUnix * 1000).toISOString() : null
  const renewsAt     = cancelDate
    ?? (periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null)

  // Map the subscription's price ID back to one of our tiers so the
  // photographer's plan reflects what they're actually paying for.
  // tierFromPriceId returns null for prices we don't recognize (e.g.
  // a stale env-var mismatch) — in that case we leave them as the
  // safe default of 'starter' rather than blocking access on a
  // misconfigured server.
  const itemPriceId = sub.items?.data?.[0]?.price?.id ?? null
  const tier        = tierFromPriceId(itemPriceId) ?? 'starter'
  const planValue   = active ? tier : 'free'

  await db.from('profiles').update({
    plan:                       planValue,
    stripe_customer_id:         customerId,
    stripe_subscription_id:     sub.id,
    stripe_subscription_status: sub.status,
    plan_renews_at:             renewsAt,
    cancel_at_period_end:       willCancel,
  }).eq('id', userId)
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    console.error('[stripe webhook] STRIPE_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'misconfigured' }, { status: 500 })
  }

  const sig = request.headers.get('stripe-signature') ?? ''
  const raw = await request.text()

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, secret)
  } catch (e: any) {
    console.error('[stripe webhook] signature verification failed', e?.message)
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  const db = admin()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        // Captured early so we have the customer id linked to the user
        // even before the subscription.created event hits.
        const session = event.data.object as Stripe.Checkout.Session
        const userId  = (session.client_reference_id ?? session.metadata?.supabase_user_id) ?? null
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null
        if (userId && customerId) {
          await db.from('profiles').update({ stripe_customer_id: customerId }).eq('id', userId)
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await syncSubscription(db, sub)
        break
      }
      case 'invoice.payment_failed': {
        // Stripe retries on its own — we just downgrade if the
        // subscription has gone past_due/unpaid. The subsequent
        // subscription.updated event will normally carry the status, but
        // sync directly here as well in case of out-of-order delivery.
        const invoice = event.data.object as Stripe.Invoice
        const subId = (invoice as any).subscription as string | null
        if (subId) {
          const sub = await getStripe().subscriptions.retrieve(subId)
          await syncSubscription(db, sub)
        }
        break
      }
      default:
        // Many events (charge.*, customer.created, etc.) flow through
        // and we just ack them. Logging would be noisy.
        break
    }
  } catch (e: any) {
    console.error('[stripe webhook] handler threw', { type: event.type, error: e?.message })
    // Return 200 anyway — Stripe will retry on 5xx, and a flapping
    // handler would create webhook backlog. We've logged the error.
    return NextResponse.json({ received: true, handled: false })
  }

  return NextResponse.json({ received: true })
}
