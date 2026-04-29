-- Let photographers dismiss client-favorite-list submissions from
-- their dashboard. The original migration (20260428_client_favorite_
-- lists.sql) only granted SELECT under RLS — DELETE was missing, so
-- the dashboard "Dismiss" button would silently no-op against RLS
-- without this policy.
--
-- Same auth.uid() = user_id rule as the SELECT policy: photographers
-- can only delete rows that belong to them. Inserts still come via
-- the service role, so no INSERT policy is needed.

drop policy if exists "Photographers dismiss their own favorite lists" on public.client_favorite_lists;
create policy "Photographers dismiss their own favorite lists"
  on public.client_favorite_lists
  for delete using (auth.uid() = user_id);
