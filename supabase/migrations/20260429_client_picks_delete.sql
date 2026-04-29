-- Let photographers dismiss client_picks rows from the dashboard's
-- Client Selections section. Mirrors the favorite-list dismiss
-- policy in 20260429_client_favorite_lists_delete.sql, but client_
-- picks doesn't carry a denormalized user_id — ownership is derived
-- via the share_link. Use an EXISTS subquery against share_links so
-- a photographer can only delete picks tied to their own guides.
--
-- The original submission email is still in the photographer's
-- inbox, so this is "I've handled this — clear it from my queue"
-- rather than information loss. Without this policy the dismiss
-- button silently no-ops under RLS.

drop policy if exists "Photographers dismiss their own picks" on public.client_picks;
create policy "Photographers dismiss their own picks"
  on public.client_picks
  for delete using (
    exists (
      select 1 from public.share_links sl
      where sl.id = client_picks.share_link_id
        and sl.user_id = auth.uid()
    )
  );
