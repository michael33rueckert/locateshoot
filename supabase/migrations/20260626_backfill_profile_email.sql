-- Backfill profiles.email from auth.users.email for every row where it
-- isn't already populated. The schema has no handle_new_user trigger to
-- copy the email on signup, so historically every account has had
-- profiles.email = NULL — which silently skipped the photographer pick
-- notification (the `if (profile?.email)` guard in /api/submit-pick).
--
-- The runtime fallback to auth.users.email in submit-pick is still the
-- canonical source going forward (no trigger added here — keep that
-- decision separate to avoid coupling email lookup to signup flow).
-- This migration just fixes the column for display purposes (admin
-- user table, dashboard "your email" field) on existing accounts.

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and (p.email is null or p.email = '');
