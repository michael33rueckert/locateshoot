-- Multi-location share links.
-- share_links: how many locations a client can pick + optional proximity cap.
alter table public.share_links
  add column if not exists max_picks                int     not null default 1,
  add column if not exists max_pick_distance_miles numeric null;

-- client_picks: store the full list of picked locations. location_name stays
-- populated with the first pick for backwards compatibility with older queries
-- and email templates.
alter table public.client_picks
  add column if not exists location_names text[],
  add column if not exists location_ids   uuid[];
