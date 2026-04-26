-- Multiple named Location Guide templates per photographer.
--
-- profiles.pick_template (single template column from migration
-- 20260426_three_tier_plans) becomes legacy — kept for now so any
-- already-saved data isn't lost, but the editor + Pick page now read
-- from this new pick_templates table instead. The migration is
-- forward-compatible: the photographer's existing single-template
-- config (if any) gets seeded as their first row in pick_templates,
-- marked as default.

create table if not exists pick_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  config      jsonb not null default '{}'::jsonb,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Speed up "list this user's templates" + "find default for user".
create index if not exists pick_templates_user_id_idx on pick_templates (user_id);

-- Only one default per user. Partial unique index lets a user have
-- many non-default templates plus exactly one default; trying to
-- mark a second one default raises a clear constraint error the
-- editor can catch.
create unique index if not exists pick_templates_one_default_per_user
  on pick_templates (user_id) where is_default;

-- RLS: photographers see + edit only their own templates.
alter table pick_templates enable row level security;

drop policy if exists pick_templates_select_own on pick_templates;
create policy pick_templates_select_own on pick_templates
  for select using (auth.uid() = user_id);

drop policy if exists pick_templates_insert_own on pick_templates;
create policy pick_templates_insert_own on pick_templates
  for insert with check (auth.uid() = user_id);

drop policy if exists pick_templates_update_own on pick_templates;
create policy pick_templates_update_own on pick_templates
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists pick_templates_delete_own on pick_templates;
create policy pick_templates_delete_own on pick_templates
  for delete using (auth.uid() = user_id);

-- Seed the photographer's existing single-template config as their
-- first named template (called "My template" — they can rename).
-- Skips users who already have a row in pick_templates.
insert into pick_templates (user_id, name, config, is_default)
select id, 'My template', pick_template, true
  from profiles
 where pick_template is not null
   and not exists (select 1 from pick_templates pt where pt.user_id = profiles.id);

-- Per-guide template selection. nullable: when null, the Pick page
-- falls back to the photographer's default template (if any), and
-- ultimately to the unbranded default render.
alter table share_links
  add column if not exists pick_template_id uuid references pick_templates(id) on delete set null;

-- Touch updated_at on row update so the editor knows when the user
-- last saved a given template (useful for "Last edited X ago" hints).
create or replace function pick_templates_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pick_templates_touch_updated_at on pick_templates;
create trigger pick_templates_touch_updated_at
  before update on pick_templates
  for each row execute function pick_templates_touch_updated_at();
