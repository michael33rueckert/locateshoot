-- Per-photographer custom sender email. When a Pro photographer verifies
-- their domain in Resend (via the Profile → Custom Sending Email flow),
-- client confirmation emails go from their address (e.g. jane@studio.com)
-- instead of notifications@locateshoot.com — making the white-label
-- branding consistent through to the client's inbox.

alter table profiles
  add column if not exists sender_email     text,
  add column if not exists sender_resend_id text,
  add column if not exists sender_verified  boolean default false,
  add column if not exists sender_added_at  timestamptz;

-- One-photographer-per-domain at the app level. Resend itself enforces
-- one-domain-per-account globally, but this gives a clearer error before
-- we round-trip to Resend.
create unique index if not exists profiles_sender_email_unique
  on profiles (lower(sender_email))
  where sender_email is not null;
