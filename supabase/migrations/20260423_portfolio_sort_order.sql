-- Photographers can reorder their portfolio locations. The dashboard preview
-- and /portfolio both read by sort_order ASC, created_at ASC so the order is
-- stable even for rows that still have the default 0.
alter table public.portfolio_locations
  add column if not exists sort_order int not null default 0;

-- Same silent-failure pattern we hit on location_photos: without an explicit
-- UPDATE RLS policy the reorder writes get rejected. Owners need to update
-- their own portfolio rows (for edits AND for sort_order changes).
drop policy if exists "users update own portfolio_locations" on public.portfolio_locations;

create policy "users update own portfolio_locations"
  on public.portfolio_locations
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
