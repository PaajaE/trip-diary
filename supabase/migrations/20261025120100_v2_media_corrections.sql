-- Phase 4e (D2): bulk correction of capture time and location, with provenance.
--
-- * captured_at_source: exif | gps | file | manual (NULL = unknown).
-- * location_source: exif | manual (NULL = unknown / no location).
-- * Grants: INSERT only. The importer knows where the value came from and has
--   to record it together with the row (it cannot be added later without
--   UPDATE). There is no UPDATE grant, so after import the source can only
--   change through shift_media_time / set_media_location, which set 'manual'.
--   The columns are descriptive metadata, not an authorization input.
--   (Direct updates of captured_at / latitude / longitude stay possible as
--   before; the source is then not touched.)
-- * Public RPCs build explicit JSON and do not expose these columns.
-- * RPCs follow mark_media_reviewed: editors only (media_batch_journey), trashed
--   rows ignored, return the number of rows actually changed. Errors P0002
--   (not found / not a member), 42501 (not an editor), 22023 (bad argument).
-- * moment_id and captured_tz are never changed here; regrouping is done by
--   the client with the idempotent arrange step.

alter table public.media
  add column captured_at_source text,
  add column location_source text,
  add constraint media_captured_at_source_check check (
    captured_at_source is null
    or captured_at_source in ('exif', 'gps', 'file', 'manual')
  ),
  add constraint media_location_source_check check (
    location_source is null or location_source in ('exif', 'manual')
  );

grant insert (captured_at_source, location_source) on public.media to authenticated;

-- Shift capture time by p_delta_seconds (|delta| <= 366 days). Rows without
-- captured_at are skipped. Zero delta changes nothing.
create or replace function public.shift_media_time(
  p_media_ids uuid[],
  p_delta_seconds int
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_journey uuid;
  v_count int;
begin
  if p_delta_seconds is null
     or p_delta_seconds not between -31622400 and 31622400 then
    raise exception 'shift_media_time: delta must be within +-31622400 seconds'
      using errcode = '22023';
  end if;
  v_journey := public.media_batch_journey(p_media_ids, 'shift_media_time');
  if v_journey is null or p_delta_seconds = 0 then
    return 0;
  end if;

  update public.media
     set captured_at = captured_at + p_delta_seconds * interval '1 second',
         captured_at_source = 'manual'
   where id = any (p_media_ids) and journey_id = v_journey
     and deleted_at is null and captured_at is not null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Set one location for all given media. hide_location is untouched.
create or replace function public.set_media_location(
  p_media_ids uuid[],
  p_latitude double precision,
  p_longitude double precision
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_journey uuid;
  v_count int;
begin
  if p_latitude is null or p_longitude is null
     or not (p_latitude between -90 and 90)
     or not (p_longitude between -180 and 180) then
    raise exception 'set_media_location: invalid coordinates' using errcode = '22023';
  end if;
  v_journey := public.media_batch_journey(p_media_ids, 'set_media_location');
  if v_journey is null then
    return 0;
  end if;

  update public.media
     set latitude = p_latitude,
         longitude = p_longitude,
         location_source = 'manual'
   where id = any (p_media_ids) and journey_id = v_journey
     and deleted_at is null
     and (latitude is distinct from p_latitude
          or longitude is distinct from p_longitude
          or location_source is distinct from 'manual');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.shift_media_time(uuid[], int) from public, anon, authenticated;
revoke all on function public.set_media_location(uuid[], double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.shift_media_time(uuid[], int) to authenticated;
grant execute on function public.set_media_location(uuid[], double precision, double precision)
  to authenticated;
