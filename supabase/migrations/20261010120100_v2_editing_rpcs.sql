-- Phase 4 editing, part 2: segments may be 'rejected' + atomic editing RPCs.
--
-- All RPCs are SECURITY INVOKER: RLS still applies on top of the explicit
-- can_edit_journey check. Row locks (FOR UPDATE) serialize concurrent edits.
-- Error codes: P0002 row not found/not visible, 42501 not an editor,
-- 22023 invalid argument (cross-journey, bad range, not adjacent, ...).

alter table public.segments drop constraint segments_origin_check;
alter table public.segments add constraint segments_origin_check
  check (origin in ('manual', 'suggested', 'accepted', 'rejected'));

-- ---------------------------------------------------------------------------
-- merge_moments: fold p_source into p_target, return p_target.
-- Media move to the target, the time range becomes the union, the target keeps
-- title/body, takes the source coordinates only when it has none. The result
-- is locked and manual so automation leaves it alone.
-- ---------------------------------------------------------------------------
create or replace function public.merge_moments(p_target uuid, p_source uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_target public.moments;
  v_source public.moments;
begin
  if p_target is null or p_source is null or p_target = p_source then
    raise exception 'merge_moments: target and source must be two different moments'
      using errcode = '22023';
  end if;

  -- Lock in id order to avoid deadlocks between concurrent merges.
  perform 1 from public.moments
    where id in (p_target, p_source) order by id for update;

  select * into v_target from public.moments where id = p_target;
  if not found then
    raise exception 'merge_moments: target moment not found' using errcode = 'P0002';
  end if;
  select * into v_source from public.moments where id = p_source;
  if not found then
    raise exception 'merge_moments: source moment not found' using errcode = 'P0002';
  end if;
  if v_target.journey_id <> v_source.journey_id then
    raise exception 'merge_moments: moments belong to different journeys'
      using errcode = '22023';
  end if;
  if not public.can_edit_journey(v_target.journey_id) then
    raise exception 'merge_moments: not allowed to edit this journey'
      using errcode = '42501';
  end if;

  update public.media
     set moment_id = v_target.id
   where moment_id = v_source.id
     and journey_id = v_target.journey_id;

  update public.moments
     set starts_at = least(v_target.starts_at, v_source.starts_at),
         ends_at = greatest(v_target.ends_at, v_source.ends_at),
         latitude = case when v_target.latitude is null then v_source.latitude
                         else v_target.latitude end,
         longitude = case when v_target.latitude is null then v_source.longitude
                          else v_target.longitude end,
         locked = true,
         origin = 'manual'
   where id = v_target.id;

  delete from public.moments where id = v_source.id;

  return v_target.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- split_moment: cut p_moment at p_at, return the new moment p_new_id.
-- Requires starts_at < p_at <= ends_at. Range rule: the original becomes
-- [starts_at, p_at], the new moment [p_at, old ends_at]. Both satisfy
-- moments_range_check (ends_at >= starts_at); the shared instant p_at belongs
-- to the new moment (media with captured_at >= p_at move there). Media without
-- captured_at stay. Title/body/coordinates stay with the original; the new
-- moment starts untitled with no coordinates. Either side may end up with no
-- media (allowed). Both are locked and manual.
-- ---------------------------------------------------------------------------
create or replace function public.split_moment(
  p_moment uuid,
  p_at timestamptz,
  p_new_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_moment public.moments;
  v_old_end timestamptz;
begin
  if p_moment is null or p_at is null or p_new_id is null then
    raise exception 'split_moment: all arguments are required' using errcode = '22023';
  end if;

  -- Read (RLS-visible) and authorize before locking: FOR UPDATE would hide
  -- rows from read-only members and turn 42501 into P0002.
  select * into v_moment from public.moments where id = p_moment;
  if not found then
    raise exception 'split_moment: moment not found' using errcode = 'P0002';
  end if;
  if not public.can_edit_journey(v_moment.journey_id) then
    raise exception 'split_moment: not allowed to edit this journey'
      using errcode = '42501';
  end if;
  select * into v_moment from public.moments where id = p_moment for update;
  if not found then
    raise exception 'split_moment: moment not found' using errcode = 'P0002';
  end if;
  if not (p_at > v_moment.starts_at and p_at <= v_moment.ends_at) then
    raise exception 'split_moment: split time must be after the start and not after the end'
      using errcode = '22023';
  end if;

  v_old_end := v_moment.ends_at;

  insert into public.moments (
    id, journey_id, starts_at, ends_at, published, origin, locked, created_by
  ) values (
    p_new_id, v_moment.journey_id, p_at, v_old_end, v_moment.published,
    'manual', true, auth.uid()
  );

  update public.media
     set moment_id = p_new_id
   where moment_id = v_moment.id
     and journey_id = v_moment.journey_id
     and captured_at >= p_at;

  update public.moments
     set ends_at = p_at, locked = true, origin = 'manual'
   where id = v_moment.id;

  return p_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- move_segment_boundary: shift the shared edge of two adjacent segments.
-- Same journey, same kind, p_before.ends_at = p_after.starts_at exactly, and
-- p_before.starts_at < p_at < p_after.ends_at.
-- ---------------------------------------------------------------------------
create or replace function public.move_segment_boundary(
  p_before uuid,
  p_after uuid,
  p_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before public.segments;
  v_after public.segments;
begin
  if p_before is null or p_after is null or p_at is null or p_before = p_after then
    raise exception 'move_segment_boundary: two different segments and a time are required'
      using errcode = '22023';
  end if;

  perform 1 from public.segments
    where id in (p_before, p_after) order by id for update;

  select * into v_before from public.segments where id = p_before;
  if not found then
    raise exception 'move_segment_boundary: first segment not found' using errcode = 'P0002';
  end if;
  select * into v_after from public.segments where id = p_after;
  if not found then
    raise exception 'move_segment_boundary: second segment not found' using errcode = 'P0002';
  end if;
  if v_before.journey_id <> v_after.journey_id then
    raise exception 'move_segment_boundary: segments belong to different journeys'
      using errcode = '22023';
  end if;
  if not public.can_edit_journey(v_before.journey_id) then
    raise exception 'move_segment_boundary: not allowed to edit this journey'
      using errcode = '42501';
  end if;
  if v_before.kind <> v_after.kind then
    raise exception 'move_segment_boundary: segments must be of the same kind'
      using errcode = '22023';
  end if;
  if v_before.ends_at <> v_after.starts_at then
    raise exception 'move_segment_boundary: segments are not adjacent'
      using errcode = '22023';
  end if;
  if not (p_at > v_before.starts_at and p_at < v_after.ends_at) then
    raise exception 'move_segment_boundary: new boundary must lie strictly inside both segments'
      using errcode = '22023';
  end if;

  update public.segments
     set ends_at = case when id = p_before then p_at else ends_at end,
         starts_at = case when id = p_after then p_at else starts_at end
   where id in (p_before, p_after);
end;
$$;

revoke all on function public.merge_moments(uuid, uuid) from public, anon, authenticated;
revoke all on function public.split_moment(uuid, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.move_segment_boundary(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.merge_moments(uuid, uuid) to authenticated;
grant execute on function public.split_moment(uuid, timestamptz, uuid) to authenticated;
grant execute on function public.move_segment_boundary(uuid, uuid, timestamptz) to authenticated;
