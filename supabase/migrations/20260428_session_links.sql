-- Session links — multiple labeled URLs per portfolio location.
-- Photographers commonly shoot the same location for multiple session
-- types (family, wedding, headshots, etc.) and want to point clients at
-- the most relevant gallery / blog post for the session they're booking.
-- pinterest_url + blog_url stay (still useful as catch-all), session
-- links live alongside as a structured array of { label, url } pairs.
--
-- JSONB rather than a separate child table because:
--   - Each location typically has 1-5 links, never thousands.
--   - Always read/written as a single unit alongside the rest of the
--     portfolio_location row — no querying individual links.
--   - Schema-on-read keeps it easy to add fields ({ icon, color, ... })
--     in the future without another migration.

alter table public.portfolio_locations
  add column if not exists session_links jsonb not null default '[]'::jsonb;
