-- Photographer-overridable permit fields on portfolio_locations.
--
-- Up to now, only `permit_required` and `permit_notes` were stored
-- on the photographer's portfolio copy — `permit_fee` and
-- `permit_website` came straight from the curated public locations
-- table and couldn't be edited per-photographer. That meant a
-- photographer who'd actually been to a venue and knew the current
-- fee or where to buy a permit had no way to surface that to their
-- clients.
--
-- Add both columns. Free-form text on fee (so '$25', '25', '$0',
-- 'free', 'donation' all work) and a URL on website. The pick-data
-- API already does the preferOwn dance for permit_required +
-- permit_notes; this migration just makes the underlying columns
-- exist so the API can extend that to fee + website.
alter table public.portfolio_locations
  add column if not exists permit_fee     text,
  add column if not exists permit_website text;
