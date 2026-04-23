-- Collect client first + last name when they pick a location. Both nullable
-- to stay compatible with existing rows and with share links that don't yet
-- prompt for name.
alter table public.client_picks
  add column if not exists client_first_name text,
  add column if not exists client_last_name  text;
