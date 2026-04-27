-- Storage policies for the `location-photos` bucket.
--
-- This bucket holds:
--   - Profile logos at  <userId>/logo.<ext>
--   - Template backgrounds at  <userId>/template/bg-<ts>.<ext>
--   - Portfolio photos at  <userId>/portfolio/<portfolioId>/<...>.<ext>
--
-- All paths begin with the user's UUID, so the policies scope writes
-- to "your own folder" via storage.foldername(name)[1] = auth.uid().
-- Reads are public so client-facing emails and Pick pages can render
-- the URLs without an auth header.
--
-- Idempotent: drop-if-exists then create. Safe to re-run.

-- ── INSERT: authenticated users can upload into their own folder ─────
drop policy if exists "location-photos: own-folder upload" on storage.objects;
create policy "location-photos: own-folder upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'location-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ── UPDATE: needed for `upsert: true` on the logo upload (overwrites
-- the same path on re-upload) ───────────────────────────────────────
drop policy if exists "location-photos: own-folder update" on storage.objects;
create policy "location-photos: own-folder update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'location-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'location-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ── DELETE: cleanup own files (used when a photo is removed from a
-- portfolio location) ───────────────────────────────────────────────
drop policy if exists "location-photos: own-folder delete" on storage.objects;
create policy "location-photos: own-folder delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'location-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ── SELECT: public read. Logos are served via getPublicUrl() and
-- have to be reachable from email clients + the public Pick page,
-- so we don't restrict by user. The bucket itself is configured as
-- public (Storage > location-photos > Public toggle ON). If the
-- bucket is private instead, this policy still works for the
-- service role and for authenticated users; the email/Pick path
-- would need a signed URL flow which we don't currently use. ─────
drop policy if exists "location-photos: public read" on storage.objects;
create policy "location-photos: public read"
on storage.objects for select
to anon, authenticated
using ( bucket_id = 'location-photos' );
