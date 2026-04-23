-- Required for "Share entire portfolio" button + Saves counter
-- Run this in the Supabase SQL Editor.

-- 1) share_links: flag for auto-syncing full-portfolio links.
alter table public.share_links
  add column if not exists is_full_portfolio boolean not null default false;

-- 2) locations.save_count bump when a user adds/removes a portfolio location
--    tied to a source location (source_location_id).
create or replace function public.bump_location_save_count()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'INSERT' and new.source_location_id is not null then
    update public.locations
       set save_count = coalesce(save_count, 0) + 1
     where id = new.source_location_id;
  elsif tg_op = 'DELETE' and old.source_location_id is not null then
    update public.locations
       set save_count = greatest(coalesce(save_count, 0) - 1, 0)
     where id = old.source_location_id;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_portfolio_save_count on public.portfolio_locations;
create trigger trg_portfolio_save_count
after insert or delete on public.portfolio_locations
for each row execute function public.bump_location_save_count();

-- 3) Backfill save_count from the current portfolio rows.
update public.locations l
   set save_count = coalesce(sub.cnt, 0)
  from (
    select source_location_id, count(*) as cnt
      from public.portfolio_locations
     where source_location_id is not null
     group by source_location_id
  ) sub
 where l.id = sub.source_location_id;
