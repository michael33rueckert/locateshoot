-- Stripe subscription linkage on profiles. Lets the webhook sync plan
-- state (active / past_due / canceled) automatically and lets the Billing
-- portal route find the right customer to manage.

alter table profiles
  add column if not exists stripe_customer_id        text,
  add column if not exists stripe_subscription_id    text,
  -- Mirrors Stripe's subscription.status — 'active', 'trialing',
  -- 'past_due', 'canceled', 'incomplete', etc.
  add column if not exists stripe_subscription_status text,
  -- current_period_end on the subscription. Used to display "renews
  -- on …" / "expires on …" in the billing tab.
  add column if not exists plan_renews_at timestamptz,
  -- True when the subscription is set to cancel at period end. Lets the
  -- billing tab show "Pro until <date>, won't renew" without relying on
  -- the status field (which stays 'active' until the period actually ends).
  add column if not exists cancel_at_period_end boolean default false;

create unique index if not exists profiles_stripe_customer_id_unique
  on profiles (stripe_customer_id)
  where stripe_customer_id is not null;
