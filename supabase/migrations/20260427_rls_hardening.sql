-- RLS hardening pass surfaced by the pre-beta security audit. Closes
-- four findings, in order of severity:
--
-- 1. profiles UPDATE policy was 'auth.uid() = id' on every column,
--    so any signed-in user could `update profiles set plan = 'pro'
--    where id = auth.uid()` and self-promote without ever paying.
--    Fix: BEFORE UPDATE trigger that resets billing / tier / domain
--    / sender columns to OLD values when the caller isn't service-
--    role. The Stripe webhook + the custom-domain + sender-domain
--    API routes all use the service-role key, so they pass through;
--    user-JWT calls lose their writes to those columns.
--
-- 2. secret_locations had a 'public can read secret locations'
--    policy with USING = true — every photographer's secret
--    locations were readable by anyone. Drop it. The owner can
--    still read their own (the 'Users manage own' policy covers
--    SELECT). The Pick page renders secret-location detail through
--    /api/pick-data which uses the service role, so it still works.
--
-- 3. share_links had two public-read policies (USING = true) so any
--    signed-in user could enumerate every photographer's guides.
--    Drop both. The Pick page reads share data through service-role
--    APIs; the owner reads their own through the 'Users manage own'
--    ALL policy. There is no remaining caller path that needs the
--    open-read policies.
--
-- 4. RLS was disabled on `locations` and `permit_scan_log`, leaving
--    the public locations directory open to user UPDATE / DELETE
--    (vandalism risk). Enable RLS and re-add the existing SELECT +
--    INSERT policies (they were already defined; they just weren't
--    being enforced). Lock UPDATE/DELETE to the admin role.

-- ── 1. profiles tier/billing column protection ───────────────────────
create or replace function public.profiles_protect_tier_columns()
returns trigger
language plpgsql
security definer
as $$
begin
  -- service_role connections bypass this check (the Stripe webhook,
  -- /api/checkout, /api/custom-domain, /api/sender-domain all use it).
  -- For user-JWT connections (authenticated, anon), force the
  -- billing/tier/domain/sender columns to their OLD values.
  if current_user = 'service_role' then
    return new;
  end if;

  new.plan                    := old.plan;
  new.stripe_customer_id      := old.stripe_customer_id;
  new.custom_domain           := old.custom_domain;
  new.custom_domain_verified  := old.custom_domain_verified;
  new.sender_email            := old.sender_email;
  new.sender_verified         := old.sender_verified;
  new.sender_resend_id        := old.sender_resend_id;
  return new;
end;
$$;

drop trigger if exists profiles_protect_tier on public.profiles;
create trigger profiles_protect_tier
  before update on public.profiles
  for each row execute function public.profiles_protect_tier_columns();

-- ── 2. secret_locations: drop the wide-open SELECT policy ────────────
drop policy if exists "public can read secret locations" on public.secret_locations;
-- 'Users manage own secret locations' (ALL command, auth.uid() = user_id)
-- already covers SELECT for the owner. Service role bypasses RLS.

-- ── 3. share_links: drop both wide-open SELECT policies ──────────────
drop policy if exists "Anyone can read share links by slug" on public.share_links;
drop policy if exists "public can read share links"        on public.share_links;
-- 'Users manage own share links' (ALL command) covers owner SELECT.
-- The public Pick page reads via /api/pick-data which uses service role.

-- ── 4a. locations: enable RLS + lock down writes ─────────────────────
alter table public.locations enable row level security;
-- The existing 'Locations are public' SELECT policy and 'Anyone can
-- submit locations for review' / 'Authenticated users can submit
-- locations' INSERT policies are already defined and become
-- effective the moment RLS is enabled.
--
-- Add explicit UPDATE/DELETE deny for non-admin users. Postgres
-- defaults to deny when no policy matches, so we just don't add
-- any UPDATE/DELETE policies for {public} or {authenticated}.
-- Service role bypasses RLS and the admin tools at /api/admin/* use
-- service role for moderation, so the admin path keeps working.

-- ── 4b. permit_scan_log: lock down entirely ──────────────────────────
alter table public.permit_scan_log enable row level security;
-- No policies for any role → only service role can read/write.
-- This table is internal scanner metadata; no user surface reads it.

-- ── 5. Cleanup: drop genuinely-duplicate policies ────────────────────
-- These are no-ops behavior-wise but reduce future audit confusion.
-- (Note: 'Anyone can submit locations for review' {anon} and
-- 'Authenticated users can submit locations' {authenticated} are NOT
-- duplicates — they cover different roles. Both stay.)
drop policy if exists "Anyone can submit a pick"             on public.client_picks;        -- exact duplicate of 'anyone can insert client picks'
drop policy if exists "public can read published locations"  on public.locations;           -- exact duplicate of 'Locations are public'
drop policy if exists "users update own portfolio_locations" on public.portfolio_locations; -- exact duplicate of 'portfolio_locations_update_own'
