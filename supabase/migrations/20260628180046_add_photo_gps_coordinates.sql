alter table public.photos
  add column latitude double precision,
  add column longitude double precision,
  add constraint photos_gps_pair_check check (
    (latitude is null and longitude is null)
    or (latitude is not null and longitude is not null)
  ),
  add constraint photos_latitude_range_check check (
    latitude is null or latitude between -90 and 90
  ),
  add constraint photos_longitude_range_check check (
    longitude is null or longitude between -180 and 180
  );

revoke insert on table public.photos from authenticated;
grant insert (id, creator_id, captured_at, latitude, longitude)
  on table public.photos to authenticated;

revoke update on table public.photos from authenticated;
grant update (captured_at, latitude, longitude)
  on table public.photos to authenticated;

grant select (latitude, longitude) on table public.photos to anon, authenticated;
