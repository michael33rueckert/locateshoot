-- Client favorite-list submissions. Distinct from the existing
-- client_picks table which records final 1-3 selections — favorites
-- are a soft "I'm not sure yet, let's discuss" signal where a client
-- marks several spots they like and sends them to the photographer to
-- talk over before committing. Same email-based identity as picks (no
-- client account required); the photographer can reply directly to
-- start the conversation.
--
-- locations stores the marked-favorite list as JSONB:
--   [{ id: '<location_or_portfolio_id>', name: 'Loose Park' }, ...]
-- We keep names alongside ids so the dashboard list still reads
-- correctly even if a location is later renamed or deleted from the
-- photographer's portfolio.

create table if not exists public.client_favorite_lists (
  id                 uuid primary key default gen_random_uuid(),
  share_link_id      uuid not null references public.share_links(id) on delete cascade,
  -- Denormalized photographer id from the share link, for cheap RLS.
  -- Populated by the /api/submit-favorites endpoint via the service role.
  user_id            uuid not null references auth.users(id) on delete cascade,
  client_first_name  text,
  client_last_name   text,
  client_email       text not null,
  locations          jsonb not null default '[]'::jsonb,
  comment            text,
  created_at         timestamptz not null default now()
);

create index if not exists client_favorite_lists_user_created_idx
  on public.client_favorite_lists(user_id, created_at desc);
create index if not exists client_favorite_lists_share_idx
  on public.client_favorite_lists(share_link_id);

alter table public.client_favorite_lists enable row level security;

drop policy if exists "Photographers see their own favorite lists" on public.client_favorite_lists;
create policy "Photographers see their own favorite lists"
  on public.client_favorite_lists
  for select using (auth.uid() = user_id);
-- Inserts come from /api/submit-favorites via the service role, which
-- bypasses RLS by design. No INSERT policy needed for end users.
