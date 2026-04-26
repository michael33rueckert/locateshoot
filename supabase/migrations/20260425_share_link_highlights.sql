-- Per-share-link "highlighted" location list. The photographer can mark
-- 1-3 locations in a guide as their recommended picks for the client;
-- the client sees them with a visual badge ("⭐ Recommended") and they
-- float to the top of the location list on /pick/[slug].

alter table share_links
  add column if not exists highlighted_location_ids uuid[] default '{}'::uuid[];

-- Cap at 3 highlights per guide. Validated client-side too, but enforced
-- at the DB layer so a determined caller can't mark every location as a
-- "highlight" and break the visual hierarchy.
alter table share_links
  drop constraint if exists share_links_highlight_cap;
alter table share_links
  add constraint share_links_highlight_cap
  check (
    highlighted_location_ids is null
    or array_length(highlighted_location_ids, 1) is null
    or array_length(highlighted_location_ids, 1) <= 3
  );
