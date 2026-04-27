-- Free plan no longer allows ANY custom Location Guides — only the
-- auto-generated Portfolio guide. Previously the trigger allowed
-- 1 active custom guide; tightening to 0 lines up with how we sell
-- the tiers: Free is for trying the auto-Portfolio surface, paying
-- plans unlock custom guides.
--
-- The dashboard already gates the "+ New guide" button on
-- hasStarter(), so this trigger is the server-side backstop in case
-- a client tries to bypass the UI (e.g. direct API call).
create or replace function enforce_share_link_quota()
returns trigger
language plpgsql
as $$
declare
  user_plan text;
begin
  select plan into user_plan from profiles where id = new.user_id;
  -- Starter + Pro: no limit.
  if user_plan = 'starter' or user_plan = 'pro' or user_plan = 'Pro' then
    return new;
  end if;

  -- Auto full-portfolio guide is always free of charge.
  if coalesce(new.is_full_portfolio, false) = true then
    return new;
  end if;

  -- Free users: any custom (non-portfolio) guide is blocked.
  raise exception 'free_plan_link_limit'
    using hint = 'Free plan only includes your auto-generated Portfolio guide. Upgrade to Starter or Pro to create custom Location Guides.',
          errcode = 'P0001';
end;
$$;

-- Trigger from the earlier migration is preserved (it points at this
-- function by name), no need to drop/recreate it here.
