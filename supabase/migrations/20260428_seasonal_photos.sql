-- Per-photo season tagging for portfolio locations.
-- Photographers shoot the same spot in different seasons (snowy
-- October cabin → blooming spring trees → autumn-color river bend)
-- and want to show clients all of those alongside each other,
-- organized by season. Adds:
--
--   • portfolio_locations.show_seasons boolean — opt-in toggle. When
--     on, the edit modal renders four upload sections (Spring/Summer/
--     Fall/Winter) and the Pick page detail panel renders a tab strip
--     above the photo gallery. Off keeps the existing flat uploader +
--     gallery so locations that don't need seasonal organization stay
--     simple.
--   • location_photos.season text — the season tag. Nullable; null =
--     "year-round" / unspecified. Constrained to known values.

alter table public.portfolio_locations
  add column if not exists show_seasons boolean not null default false;

alter table public.location_photos
  add column if not exists season text;

-- Constrain season to a known set so a typo in the upload form can't
-- silently land a photo no client tab will ever surface.
alter table public.location_photos
  drop constraint if exists location_photos_season_check;
alter table public.location_photos
  add  constraint location_photos_season_check
       check (season is null or season in ('spring', 'summer', 'fall', 'winter'));

-- Helps the per-season fetch in the Pick page detail panel + the
-- per-season grouping in the portfolio edit modal.
create index if not exists location_photos_portfolio_season_idx
  on public.location_photos(portfolio_location_id, season);
