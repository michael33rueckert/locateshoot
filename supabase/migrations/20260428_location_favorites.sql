-- Location favorites — a lightweight bookmark separate from portfolio.
-- A photographer who sees an interesting spot on the Explore map but
-- hasn't shot there yet can star it for later, without committing to
-- adding the row to their portfolio. Favorites surface in a dashboard
-- panel + bump the location's sort weight inside near-search results
-- so the most-bookmarked spots rise to the top of the metro view.
--
-- Distinct from portfolio_locations (which counts toward `save_count`):
-- favorites are intent-to-shoot bookmarks. Adding the same location
-- to the portfolio later doesn't create a duplicate favorite, and
-- removing the favorite doesn't touch the portfolio.

create table if not exists public.location_favorites (
  user_id     uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, location_id)
);

create index if not exists location_favorites_location_idx on public.location_favorites(location_id);
create index if not exists location_favorites_user_created_idx on public.location_favorites(user_id, created_at desc);

alter table public.location_favorites enable row level security;

drop policy if exists "Users manage own favorites" on public.location_favorites;
create policy "Users manage own favorites" on public.location_favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Cached aggregate on the location row so Explore's sort can rank by
-- favorite_count without joining + counting on every render. Trigger
-- below keeps it in sync with insert / delete on location_favorites.
alter table public.locations
  add column if not exists favorite_count int not null default 0;

create or replace function public.bump_location_favorite_count()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.locations
       set favorite_count = coalesce(favorite_count, 0) + 1
     where id = new.location_id;
  elsif tg_op = 'DELETE' then
    update public.locations
       set favorite_count = greatest(coalesce(favorite_count, 0) - 1, 0)
     where id = old.location_id;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_location_favorite_count on public.location_favorites;
create trigger trg_location_favorite_count
  after insert or delete on public.location_favorites
  for each row execute function public.bump_location_favorite_count();
