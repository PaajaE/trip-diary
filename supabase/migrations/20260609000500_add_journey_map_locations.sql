alter table public.journey_stops
  add column map_latitude double precision,
  add column map_longitude double precision,
  add constraint journey_stops_map_coordinates_pair_check check (
    (map_latitude is null and map_longitude is null)
    or (map_latitude is not null and map_longitude is not null)
  ),
  add constraint journey_stops_map_latitude_range_check check (
    map_latitude is null or map_latitude between -90 and 90
  ),
  add constraint journey_stops_map_longitude_range_check check (
    map_longitude is null or map_longitude between -180 and 180
  );

grant select (map_latitude, map_longitude) on public.journey_stops to anon, authenticated;

create or replace function public.set_journey_stop_location(
  p_stop_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_map_latitude double precision,
  p_map_longitude double precision
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.journey_stops
  set
    latitude = p_latitude,
    longitude = p_longitude,
    map_latitude = p_map_latitude,
    map_longitude = p_map_longitude
  where id = p_stop_id and creator_id = auth.uid();

  if not found then
    raise exception using errcode = '42501', message = 'stop is unavailable or not owned by current user';
  end if;
end $$;

revoke all on function public.set_journey_stop_location(
  uuid, double precision, double precision, double precision, double precision
) from public, anon, authenticated;
grant execute on function public.set_journey_stop_location(
  uuid, double precision, double precision, double precision, double precision
) to authenticated;
