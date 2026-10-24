-- Phase 4e (D2): undo for set_media_location.
--
-- clear_media_location removes the location of the given media again
-- (latitude, longitude and location_source become NULL). hide_location is
-- untouched. Same contract as set_media_location: editors only
-- (media_batch_journey), trashed rows ignored, returns the number of rows
-- actually changed (rows without a location are not counted, so a second call
-- returns 0). Errors P0002 (not found / not a member), 42501 (not an editor),
-- 22023 (bad argument).

create or replace function public.clear_media_location(p_media_ids uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_journey uuid;
  v_count int;
begin
  v_journey := public.media_batch_journey(p_media_ids, 'clear_media_location');
  if v_journey is null then
    return 0;
  end if;

  update public.media
     set latitude = null,
         longitude = null,
         location_source = null
   where id = any (p_media_ids) and journey_id = v_journey
     and deleted_at is null
     and (latitude is not null or longitude is not null);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.clear_media_location(uuid[]) from public, anon, authenticated;
grant execute on function public.clear_media_location(uuid[]) to authenticated;
