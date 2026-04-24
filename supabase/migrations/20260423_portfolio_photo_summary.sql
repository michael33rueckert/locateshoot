-- Single-query aggregate used by the Dashboard portfolio section and the
-- /portfolio page instead of fetching every location_photos row just to count
-- them and pull one URL for the thumbnail. Avoids pulling N rows per location
-- as photographers upload more photos.
--
-- Returns one row per portfolio_location_id passed in:
--   portfolio_location_id: uuid
--   cnt:                   bigint  (count of the photographer's non-private uploads)
--   first_url:             text    (photo with lowest sort_order / created_at)

create or replace function public.portfolio_photo_summary(pids uuid[])
returns table(portfolio_location_id uuid, cnt bigint, first_url text)
language sql stable
as $$
  with first_photos as (
    select distinct on (portfolio_location_id)
      portfolio_location_id,
      url
    from public.location_photos
    where portfolio_location_id = any(pids)
      and is_private = false
    order by portfolio_location_id, sort_order nulls last, created_at
  ),
  counts as (
    select portfolio_location_id, count(*) as cnt
    from public.location_photos
    where portfolio_location_id = any(pids)
      and is_private = false
    group by portfolio_location_id
  )
  select c.portfolio_location_id, c.cnt, f.url
  from counts c
  left join first_photos f on f.portfolio_location_id = c.portfolio_location_id;
$$;

grant execute on function public.portfolio_photo_summary(uuid[]) to authenticated, anon;
