-- Per-guide cover photo. Photographers pick one photo from the locations they
-- include in a Location Guide; that URL is used as (1) the card thumbnail on
-- /dashboard and /location-guides, and (2) the OG image served by /pick/[slug]
-- so the link renders with a rich preview in text/email/social.

alter table public.share_links
  add column if not exists cover_photo_url text;
