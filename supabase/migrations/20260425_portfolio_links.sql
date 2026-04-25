-- Pinterest board + blog post links per portfolio location.
-- Each photographer maintains their own per-spot board and blog post
-- (a wedding photographer's "Loose Park" Pinterest board ≠ another
-- photographer's), so these belong on portfolio_locations rather than
-- the public locations table.

alter table portfolio_locations
  add column if not exists pinterest_url text,
  add column if not exists blog_url text;
