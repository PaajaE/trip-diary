create or replace function public.upsert_journey_moment_assignment(
  p_entry_id uuid,
  p_journey_id uuid,
  p_stage_id uuid default null,
  p_stop_id uuid default null,
  p_location_title text default null,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry public.entries;
  v_existing_stop public.journey_stops;
  v_stop_id uuid;
  v_stop_title text;
  v_has_location boolean;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select *
  into v_entry
  from public.entries
  where id = p_entry_id
    and creator_id = v_user_id
  for update;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'entry is unavailable or not owned by the current user';
  end if;

  perform 1
  from public.journeys
  where id = p_journey_id
  for update;

  if not found or not public.is_journey_member(p_journey_id) then
    raise exception using errcode = '42501', message = 'journey membership required';
  end if;

  if v_entry.space_id is distinct from (
    select space_id
    from public.journeys
    where id = p_journey_id
  ) then
    raise exception using errcode = '23514', message = 'entry and journey must share publishing space';
  end if;

  if p_stage_id is not null and not exists (
    select 1
    from public.journey_stages
    where id = p_stage_id
      and journey_id = p_journey_id
  ) then
    raise exception using errcode = '23503', message = 'stage does not belong to journey';
  end if;

  if (p_latitude is null) <> (p_longitude is null) then
    raise exception using errcode = '22023', message = 'exact coordinates must be provided together';
  end if;

  v_has_location := p_latitude is not null;

  if v_has_location and (
    not p_latitude between -90 and 90
    or not p_longitude between -180 and 180
  ) then
    raise exception using errcode = '22023', message = 'invalid exact coordinates';
  end if;

  if v_has_location and p_stop_id is null then
    raise exception using errcode = '22023', message = 'location requires client-generated stop id';
  end if;

  v_stop_id := p_stop_id;

  if v_stop_id is not null then
    select *
    into v_existing_stop
    from public.journey_stops
    where id = v_stop_id
    for update;

    if found then
      if v_existing_stop.journey_id <> p_journey_id then
        raise exception using errcode = '23503', message = 'stop does not belong to journey';
      end if;

      if v_existing_stop.stage_id is distinct from p_stage_id then
        raise exception using errcode = '23503', message = 'stop does not belong to stage';
      end if;

      update public.journey_stops
      set
        status = 'visited',
        latitude = case when v_has_location then p_latitude else latitude end,
        longitude = case when v_has_location then p_longitude else longitude end,
        map_latitude = case when v_has_location then round(p_latitude::numeric, 2)::double precision else map_latitude end,
        map_longitude = case when v_has_location then round(p_longitude::numeric, 2)::double precision else map_longitude end,
        visited_at = coalesce(v_entry.event_at, visited_at, statement_timestamp())
      where id = v_stop_id;
    elsif v_has_location then
      v_stop_title := coalesce(
        nullif(btrim(p_location_title), ''),
        nullif(btrim(v_entry.title), ''),
        'Moment'
      );

      insert into public.journey_stops (
        id,
        journey_id,
        stage_id,
        creator_id,
        title,
        status,
        position,
        latitude,
        longitude,
        map_latitude,
        map_longitude,
        visited_at
      )
      select
        v_stop_id,
        p_journey_id,
        p_stage_id,
        v_user_id,
        v_stop_title,
        'visited',
        coalesce(max(position) + 1, 0),
        p_latitude,
        p_longitude,
        round(p_latitude::numeric, 2)::double precision,
        round(p_longitude::numeric, 2)::double precision,
        coalesce(v_entry.event_at, statement_timestamp())
      from public.journey_stops
      where journey_id = p_journey_id;
    else
      raise exception using errcode = '23503', message = 'stop does not exist';
    end if;
  end if;

  insert into public.entry_journey_links (
    entry_id,
    journey_id,
    stage_id,
    stop_id,
    creator_id
  )
  values (
    p_entry_id,
    p_journey_id,
    p_stage_id,
    v_stop_id,
    v_user_id
  )
  on conflict (entry_id) do update
  set
    journey_id = excluded.journey_id,
    stage_id = excluded.stage_id,
    stop_id = excluded.stop_id,
    creator_id = excluded.creator_id;

  return v_stop_id;
end;
$$;

revoke all on function public.upsert_journey_moment_assignment(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  double precision,
  double precision
) from public, anon, authenticated;

grant execute on function public.upsert_journey_moment_assignment(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  double precision,
  double precision
) to authenticated;
