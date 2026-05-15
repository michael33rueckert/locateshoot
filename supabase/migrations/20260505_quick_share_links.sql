-- Quick-share links: share_links created from the "Copy link" button on
-- a single portfolio location. They go through the same /pick/[slug]
-- renderer as any other guide, but we hide them from the photographer's
-- Location Guides list so it stays focused on curated multi-location
-- guides. quick_share=true is the filter every list query uses.
alter table share_links
  add column if not exists quick_share boolean not null default false;

-- Index — list queries filter on (user_id, quick_share) so a partial
-- index on the false subset keeps the photographer's "real guides"
-- lookup tight even as quick-shares accumulate.
create index if not exists share_links_user_non_quick
  on share_links (user_id)
  where quick_share = false;
