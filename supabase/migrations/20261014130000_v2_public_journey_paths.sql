-- Minimal public listing for build-time prerender and sitemap. Exposes only
-- handle, slug and updated_at of public journeys.
create or replace function public.list_public_journey_paths()
returns table (space_handle text, journey_slug text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.handle, j.slug, j.updated_at
  from public.journeys j
  join public.spaces s on s.id = j.space_id
  where j.visibility = 'public' and j.slug is not null
  order by s.handle, j.slug;
$$;

revoke all on function public.list_public_journey_paths() from public;
grant execute on function public.list_public_journey_paths() to anon, authenticated;
