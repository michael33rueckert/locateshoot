-- Per-share-link view tracking. One row per session (page load); time
-- on page accumulates via heartbeat pings every 15s while the client
-- has the share page open. Powers the "Share analytics" Pro feature
-- (views + time spent per guide) on the dashboard.

create table if not exists share_link_views (
  id                uuid primary key default gen_random_uuid(),
  share_link_id    uuid not null references share_links(id) on delete cascade,
  -- Hash of IP + user-agent + day so we can count "unique" viewers
  -- without storing PII. Same client visiting the next day counts as a
  -- new unique — fine for "how many people saw this guide" analytics.
  viewer_hash      text,
  user_agent       text,
  -- Browser-reported total seconds the page was visible. Heartbeats
  -- accumulate this server-side; tab-hidden time isn't counted.
  total_seconds    int not null default 0,
  viewed_at        timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now()
);

-- Looking up views by guide is the hot path — covers the dashboard
-- analytics panel queries.
create index if not exists share_link_views_share_link_id_idx
  on share_link_views (share_link_id, viewed_at desc);

-- RLS: photographers see only their own guides' views.
alter table share_link_views enable row level security;

create policy share_link_views_select_own on share_link_views
  for select
  using (
    share_link_id in (select id from share_links where user_id = auth.uid())
  );

-- Inserts/updates always go through the server-only API (service role),
-- so anon writes stay blocked. The select policy above is what the
-- dashboard reads through.
