-- Enforce the Free-plan share link quota at the database layer so a
-- determined user can't bypass the client-side check. Free photographers
-- get the auto "Entire Portfolio" guide (always free, doesn't count
-- toward the limit) plus one custom guide. Pro photographers are
-- unlimited.

create or replace function enforce_share_link_quota()
returns trigger
language plpgsql
as $$
declare
  user_plan text;
  active_count int;
begin
  -- Pro / trialing / past_due: no limit. Pull the plan column live from
  -- profiles so the trigger always reads the latest state.
  select plan into user_plan from profiles where id = new.user_id;
  if user_plan = 'pro' or user_plan = 'Pro' then
    return new;
  end if;

  -- The auto-generated full-portfolio guide is always free — every
  -- photographer can share their entire portfolio with one auto link
  -- regardless of plan. Custom guides are what the quota gates.
  if coalesce(new.is_full_portfolio, false) = true then
    return new;
  end if;

  -- Free users: count their existing custom (non-portfolio) guides that
  -- haven't already expired. The new row hasn't been inserted yet so
  -- we don't need to exclude its own id.
  select count(*) into active_count
  from share_links
  where user_id = new.user_id
    and coalesce(is_full_portfolio, false) = false
    and (expires_at is null or expires_at > now());

  if active_count >= 1 then
    raise exception 'free_plan_link_limit'
      using hint = 'Free plan allows 1 active custom share link. Upgrade to Pro for unlimited links.',
            errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists share_links_quota_check on share_links;
create trigger share_links_quota_check
  before insert on share_links
  for each row execute function enforce_share_link_quota();
