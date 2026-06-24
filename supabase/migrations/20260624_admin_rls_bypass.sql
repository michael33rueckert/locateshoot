-- Admin "manage as user" support. Lets an admin (rows in the admins
-- table) write to any photographer's portfolio_locations, location_
-- photos, share_links rows, and upload/delete files anywhere in the
-- location-photos storage bucket. Drives the /admin/users/[id]
-- management page where staff can offer to set up portfolios + guides
-- on a photographer's behalf as a white-glove onboarding service.
--
-- The existing photographer-side policies are PRESERVED — those scope
-- writes to the owner. The new "admin: all" policies are additive
-- (Postgres RLS is permissive OR), so admins inherit a bypass without
-- weakening anything for normal users.
--
-- Membership in admins is managed manually via SQL. The single email
-- gate (lib/admin.ts → NEXT_PUBLIC_ADMIN_EMAIL) governs the UI; this
-- table governs the DB. Insert your own admin id once:
--   insert into admins (id) values ('<your-auth-uid>');

create table if not exists admins (
  id          uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- Helper — referenced from every policy below. Marked stable so the
-- planner caches the EXISTS lookup per statement.
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (select 1 from public.admins where id = auth.uid())
$$;

-- ── portfolio_locations: admins can read/write any row ─────────────
drop policy if exists "admin: all portfolio_locations" on portfolio_locations;
create policy "admin: all portfolio_locations"
on portfolio_locations for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ── location_photos: admins can read/write any row ──────────────────
drop policy if exists "admin: all location_photos" on location_photos;
create policy "admin: all location_photos"
on location_photos for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ── share_links: admins can read/write any row ──────────────────────
drop policy if exists "admin: all share_links" on share_links;
create policy "admin: all share_links"
on share_links for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ── location-photos storage bucket: admins can upload/update/delete
--    anywhere in the bucket regardless of the folder prefix. Public
--    SELECT remains open via the existing policy in
--    20260427_storage_location_photos_policies.sql. ──────────────────
drop policy if exists "location-photos: admin all" on storage.objects;
create policy "location-photos: admin all"
on storage.objects for all
to authenticated
using ( bucket_id = 'location-photos' and public.is_admin() )
with check ( bucket_id = 'location-photos' and public.is_admin() );

-- Note: enforce_free_portfolio_cap + enforce_share_link_quota
-- triggers still fire for admin-initiated inserts. That's intentional
-- — admins setting up a portfolio for a paying user are fine, and
-- admins setting up for a Free user should respect the same caps the
-- photographer themselves would hit. Override via plan promotion if
-- the admin needs to load up data beyond the cap.
