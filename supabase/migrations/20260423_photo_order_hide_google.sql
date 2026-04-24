-- location_photos.sort_order lets photographers reorder their uploaded photos
-- per location. Default 0 so existing rows stay at the top in insertion order.
alter table public.location_photos
  add column if not exists sort_order int not null default 0;

-- portfolio_locations.hide_google_photos lets photographers opt out of the
-- live Google Places photo fetch per location. Replaces the per-share-link
-- "my_photos_only" toggle on the Share page with a more granular per-location
-- setting.
alter table public.portfolio_locations
  add column if not exists hide_google_photos boolean not null default false;
