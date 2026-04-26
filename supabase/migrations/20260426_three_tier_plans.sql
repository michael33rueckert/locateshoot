-- Three-tier pricing rollout: 'free' | 'starter' | 'pro'.
--
-- profiles.plan was already a free-form text column with values 'free'
-- and 'pro'. The Stripe webhook now also writes 'starter' for users on
-- the entry paid tier. No data migration needed — anyone already on
-- 'pro' stays Pro (which under the new feature split is a strict
-- superset of Starter, so no one loses access).

-- Customizable Pick page template (Pro feature). JSON shape:
--   {
--     "layout":     "vertical-hero" | "magazine-grid" | "minimalist-list" | "map-first",
--     "font":       "Playfair Display" | "Inter" | ...,
--     "colors":     { "background": "#hex", "text": "#hex", "accent": "#hex", "accentText": "#hex" },
--     "header":     { "logoPlacement": "left" | "center", "showHeadshot": boolean, "intro": "..." },
--     "background": { "type": "none" | "solid" | "image", "imageUrl": "..." }
--   }
-- All fields optional — pick page renders with sensible defaults when
-- a key is missing.
alter table profiles
  add column if not exists pick_template jsonb;

-- Free-tier 5-location cap. Photographers on 'free' can save up to
-- FREE_PORTFOLIO_CAP portfolio locations. Beyond that they need to
-- upgrade. Pro/starter are unlimited. Enforced at the DB layer so a
-- determined caller can't bypass the client-side check.
create or replace function enforce_free_portfolio_cap()
returns trigger
language plpgsql
as $$
declare
  user_plan text;
  cur_count int;
  free_cap  constant int := 5;
begin
  select plan into user_plan from profiles where id = new.user_id;
  -- Anyone on a paid plan (starter or pro) is unlimited.
  if user_plan = 'starter' or user_plan = 'pro' or user_plan = 'Pro' then
    return new;
  end if;

  select count(*) into cur_count
  from portfolio_locations
  where user_id = new.user_id;

  if cur_count >= free_cap then
    raise exception 'free_plan_location_cap'
      using hint = format('Free plan allows %s portfolio locations. Upgrade to Starter for unlimited locations.', free_cap),
            errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists portfolio_locations_free_cap on portfolio_locations;
create trigger portfolio_locations_free_cap
  before insert on portfolio_locations
  for each row execute function enforce_free_portfolio_cap();

-- Update the share-link quota trigger to recognize 'starter' as also
-- unlimited. The existing function only checked for 'pro' / 'Pro'.
create or replace function enforce_share_link_quota()
returns trigger
language plpgsql
as $$
declare
  user_plan text;
  active_count int;
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

  -- Free users: count existing custom (non-portfolio) guides that
  -- haven't already expired.
  select count(*) into active_count
  from share_links
  where user_id = new.user_id
    and coalesce(is_full_portfolio, false) = false
    and (expires_at is null or expires_at > now());

  if active_count >= 1 then
    raise exception 'free_plan_link_limit'
      using hint = 'Free plan allows 1 active custom Location Guide. Upgrade to Starter for unlimited guides.',
            errcode = 'P0001';
  end if;

  return new;
end;
$$;
