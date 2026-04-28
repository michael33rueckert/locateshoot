-- Fix profiles_protect_tier_columns: the previous version was SECURITY
-- DEFINER, which rewrites current_user inside the function body to the
-- function owner ('postgres'). The trigger's `current_user = 'service_role'`
-- bypass check was therefore ALWAYS false — so admin plan updates from
-- /api/admin/users/plan (and any other service-role-keyed mutation of
-- profiles.plan) silently reverted alongside genuine user-JWT updates.
--
-- Symptom in production: an admin "promote to Pro" returned 200 OK,
-- profiles.plan was overwritten back to its old value by the trigger,
-- and the photographer remained gated as Free.
--
-- Fix: drop SECURITY DEFINER. The trigger only needs to read OLD and
-- write NEW on the row being updated; no elevated privileges required.
-- Without SECURITY DEFINER, current_user reflects the actual connecting
-- role ('service_role' for admin/webhook, 'authenticated' for users)
-- and the existing bypass check works as intended.

create or replace function public.profiles_protect_tier_columns()
returns trigger
language plpgsql
as $$
begin
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
