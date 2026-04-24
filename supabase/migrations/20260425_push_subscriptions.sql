-- Web Push subscriptions. One row per (photographer, browser/device) — a
-- photographer who uses the PWA on both desktop and phone ends up with two
-- rows. /api/submit-pick iterates these on every client pick so the
-- photographer gets a native push notification alongside the email.
--
-- `endpoint` is the URL the Push service hands out when the browser
-- subscribes; `p256dh` + `auth` are the encryption keys we need to sign
-- the payload when we send.

create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Photographers can read, insert, update, delete their own subscriptions.
-- The service-role client in /api/submit-pick bypasses RLS for the send step.
create policy "users manage own push_subscriptions"
  on public.push_subscriptions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
