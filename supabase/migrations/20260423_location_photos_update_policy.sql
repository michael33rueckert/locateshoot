-- Photographers reorder their uploaded photos from the portfolio edit modal,
-- which writes location_photos.sort_order. INSERT/SELECT/DELETE policies
-- already exist for owners; UPDATE was missing, so reorder writes were being
-- silently rejected by RLS.
--
-- Allow a user to update their own rows in location_photos.

drop policy if exists "users update own location_photos" on public.location_photos;

create policy "users update own location_photos"
  on public.location_photos
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
