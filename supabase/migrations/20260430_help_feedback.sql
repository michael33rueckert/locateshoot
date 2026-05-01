-- Help-center "was this helpful?" votes. One row per submission;
-- a single user can vote on the same article multiple times (we
-- want signal on whether they came back later and the article
-- actually helped, not just the first impression). user_id is
-- nullable since anonymous visitors may also rate articles.
--
-- The article slug is just a string (matches the markdown filename
-- in /content/help/), so this stays useful even when articles are
-- renamed — we keep the historical signal under the old slug.

create table if not exists public.help_feedback (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,
  vote        text not null check (vote in ('up', 'down')),
  user_id     uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists help_feedback_slug_idx
  on public.help_feedback(slug, created_at desc);

alter table public.help_feedback enable row level security;

-- Inserts come through the API route via the service role, which
-- bypasses RLS, so no INSERT policy is needed. SELECT is admin-only
-- (we don't want random users querying aggregate vote counts).
drop policy if exists "Admins read help feedback" on public.help_feedback;
create policy "Admins read help feedback"
  on public.help_feedback
  for select using (false);
