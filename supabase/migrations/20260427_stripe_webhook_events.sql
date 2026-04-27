-- Idempotency dedup table for the Stripe webhook handler. Stripe
-- retries on any non-2xx response (and occasionally even on 2xx
-- responses if it didn't see them in time), so the same event id
-- can arrive multiple times.
--
-- Today our handler is mostly idempotent because every operation is
-- a state-replacement UPDATE keyed on user_id — re-applying it is a
-- no-op. But the moment we add a side effect that isn't idempotent
-- (sending a "subscription started" email, incrementing a counter,
-- etc.) we'd silently double-fire. This table is the cheap insurance.
--
-- Insert event_id at the top of the handler with `on conflict do
-- nothing returning id`. If no row comes back, we've seen the event
-- before and should skip processing.
create table if not exists public.stripe_webhook_events (
  event_id      text primary key,
  event_type    text not null,
  processed_at  timestamptz not null default now()
);

-- Old events are useful for diagnostics but the table will grow
-- forever otherwise. Keep ~30 days of history; cron-style cleanup
-- can be added later if needed.
comment on table public.stripe_webhook_events is
  'Stripe event-id dedup. Insert with on-conflict-do-nothing-returning-id at the top of the webhook handler — empty result means we already processed this event.';

-- Service-role only. The webhook handler runs as service role; no
-- user JWT should ever read or write this table.
alter table public.stripe_webhook_events enable row level security;
-- (Intentionally no policies → all authenticated/anon access is denied.
-- Service role bypasses RLS, so the webhook still works.)
