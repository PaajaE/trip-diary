-- Allow clients to insert/update video metadata on photos rows during sync.

revoke insert on table public.photos from authenticated;
grant insert (
  id,
  creator_id,
  captured_at,
  latitude,
  longitude,
  media_type,
  duration_ms
) on table public.photos to authenticated;

revoke update on table public.photos from authenticated;
grant update (
  captured_at,
  latitude,
  longitude,
  media_type,
  duration_ms
) on table public.photos to authenticated;
