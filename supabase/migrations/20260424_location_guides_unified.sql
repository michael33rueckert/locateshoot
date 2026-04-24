-- Unified Location Guides: merges the old "permanent links" and "one-off share
-- links" under a single concept. Every row in share_links is now a Location
-- Guide; photographers pick one of three expiration modes at creation:
--   1. Never   — is_permanent = true,  expires_at = null, expire_on_submit = false
--   2. On date — is_permanent = false, expires_at = <date>
--   3. On first client selection — expire_on_submit = true
--
-- expire_on_submit is enforced at both /api/submit-pick (blocks duplicate
-- submissions) and /api/pick-data (returns 410 once a pick exists).

alter table public.share_links
  add column if not exists expire_on_submit boolean not null default false;
