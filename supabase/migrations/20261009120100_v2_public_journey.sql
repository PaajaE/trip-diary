-- Public read model for a journey (docs/plan-v2.md, phase 5 performance budget):
-- one call returns the whole tree. This is the only way anon reads v2 content.
--
-- Rules:
--   * only journeys with visibility = 'public' in the given space,
--   * only published moments; media inside unpublished moments are left out,
--   * only media with status = 'ready',
--   * media with hide_location = true are returned without coordinates.

create or replace function public.get_public_journey(
  p_space_handle text,
  p_journey_slug text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with journey as (
    select j.*, s.handle as space_handle, s.name as space_name
    from public.journeys j
    join public.spaces s on s.id = j.space_id
    where s.handle = lower(p_space_handle)
      and j.slug = p_journey_slug
      and j.visibility = 'public'
  ),
  visible_moments as (
    select mo.*
    from public.moments mo
    join journey j on j.id = mo.journey_id
    where mo.published
  ),
  visible_media as (
    select m.*
    from public.media m
    join journey j on j.id = m.journey_id
    where m.status = 'ready'
      and (m.moment_id is null or exists (
        select 1 from visible_moments vm where vm.id = m.moment_id
      ))
  )
  select case when not exists (select 1 from journey) then null else jsonb_build_object(
    'journey', (
      select jsonb_build_object(
        'id', j.id,
        'title', j.title,
        'summary', j.summary,
        'status', j.status,
        'startsAt', j.starts_at,
        'endsAt', j.ends_at,
        'homeTz', j.home_tz,
        'coverMediaId', j.cover_media_id,
        'space', jsonb_build_object('handle', j.space_handle, 'name', j.space_name)
      )
      from journey j
    ),
    'segments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sg.id,
        'parentId', sg.parent_id,
        'kind', sg.kind,
        'tripType', sg.trip_type,
        'title', sg.title,
        'body', sg.body,
        'startsAt', sg.starts_at,
        'endsAt', sg.ends_at,
        'tz', sg.tz,
        'coverMediaId', sg.cover_media_id,
        'position', sg.position
      ) order by sg.starts_at, sg.position)
      from public.segments sg
      join journey j on j.id = sg.journey_id
    ), '[]'::jsonb),
    'moments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', vm.id,
        'startsAt', vm.starts_at,
        'endsAt', vm.ends_at,
        'latitude', vm.latitude,
        'longitude', vm.longitude,
        'placeId', vm.place_id,
        'title', vm.title,
        'body', vm.body,
        'coverMediaId', vm.cover_media_id
      ) order by vm.starts_at)
      from visible_moments vm
    ), '[]'::jsonb),
    'media', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', vm.id,
        'kind', vm.kind,
        'capturedAt', vm.captured_at,
        'capturedTz', vm.captured_tz,
        'latitude', case when vm.hide_location then null else vm.latitude end,
        'longitude', case when vm.hide_location then null else vm.longitude end,
        'width', vm.width,
        'height', vm.height,
        'durationMs', vm.duration_ms,
        'caption', vm.caption,
        'starred', vm.starred,
        'focalX', vm.focal_x,
        'focalY', vm.focal_y,
        'momentId', vm.moment_id,
        'segmentOverrideId', vm.segment_override_id,
        'variants', coalesce((
          select jsonb_agg(jsonb_build_object(
            'kind', v.kind,
            'storageKey', v.storage_key,
            'mimeType', v.mime_type,
            'width', v.width,
            'height', v.height
          ) order by v.width)
          from public.media_variants v
          where v.media_id = vm.id
        ), '[]'::jsonb)
      ) order by vm.captured_at nulls last, vm.id)
      from visible_media vm
    ), '[]'::jsonb),
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'countryCode', p.country_code,
        'region', p.region,
        'latitude', p.latitude,
        'longitude', p.longitude
      ) order by p.name)
      from public.places p
      where p.id in (select vm.place_id from visible_moments vm where vm.place_id is not null)
    ), '[]'::jsonb),
    'tracks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'segmentId', t.segment_id,
        'source', t.source,
        'geojson', t.geojson,
        'distanceM', t.distance_m,
        'ascentM', t.ascent_m
      ))
      from public.tracks t
      join journey j on j.id = t.journey_id
    ), '[]'::jsonb)
  ) end
$$;

revoke all on function public.get_public_journey(text, text) from public, anon, authenticated;
grant execute on function public.get_public_journey(text, text) to anon, authenticated;
