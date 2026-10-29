-- Phase 4f (D3): the local day of a moment, stored.
--
-- The day is decided by the author's night (the day changes in the middle of
-- the longest sleep gap) and read on the clock of the zone where the moment
-- was shot. That rule lives in ONE place, the TypeScript resolver in
-- packages/core (createNightDayResolver); the client computes the day and
-- stores it here, so SQL only counts. No second implementation to drift.
--
-- * moments.local_day is NULL until the client has stored it. Readers that
--   need a day fall back to the calendar date of starts_at in the zone of the
--   moment's first photo (media.captured_tz), then the journey home_tz, then
--   UTC. Never the viewer's zone.
-- * No UPDATE grant on the column: it is written only through
--   set_moment_local_days (editors), which cannot touch any other column.
--   Direct moment inserts leave it NULL.
-- * journey_progress (D3 of phase 4e) now counts days from local_day with that
--   fallback instead of home_tz midnight. day_notes.local_date keeps being the
--   label of the day (the date of waking up).
-- * Errors as the other editing RPCs: P0002 (journey not found / not a
--   member), 42501 (not an editor), 22023 (bad argument).

alter table public.moments add column local_day date;

create or replace function public.set_moment_local_days(
  p_journey_id uuid,
  p_moment_ids uuid[],
  p_days date[]
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if p_journey_id is null or p_moment_ids is null or p_days is null
     or cardinality(p_moment_ids) <> cardinality(p_days)
     or cardinality(p_moment_ids) > 5000 then
    raise exception 'set_moment_local_days: ids and days must be equal-length arrays of at most 5000'
      using errcode = '22023';
  end if;
  if not public.is_journey_member(p_journey_id) then
    raise exception 'set_moment_local_days: journey not found'
      using errcode = 'P0002';
  end if;
  if not public.can_edit_journey(p_journey_id) then
    raise exception 'set_moment_local_days: not allowed'
      using errcode = '42501';
  end if;

  update public.moments mo
     set local_day = v.day
    from unnest(p_moment_ids, p_days) as v(id, day)
   where mo.id = v.id
     and mo.journey_id = p_journey_id
     and mo.local_day is distinct from v.day;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.set_moment_local_days(uuid, uuid[], date[])
  from public, anon, authenticated;
grant execute on function public.set_moment_local_days(uuid, uuid[], date[])
  to authenticated;

create or replace function public.journey_progress(p_journey_ids uuid[])
returns table (
  journey_id uuid,
  days_total int,
  days_with_note int,
  media_total int,
  media_unreviewed int,
  starred int,
  cover_media_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select j.id, coalesce(j.home_tz, 'UTC') as tz, j.cover_media_id
      from public.journeys j
     where j.id = any (p_journey_ids)
       and public.is_journey_member(j.id)
  ),
  days as (
    select distinct mo.journey_id,
           coalesce(
             mo.local_day,
             (mo.starts_at at time zone coalesce(
               (select md.captured_tz
                  from public.media md
                 where md.moment_id = mo.id
                   and md.captured_tz is not null
                   and md.deleted_at is null
                 order by md.captured_at nulls last, md.id
                 limit 1),
               m.tz
             ))::date
           ) as local_date
      from mine m
      join public.moments mo on mo.journey_id = m.id
  ),
  day_counts as (
    select d.journey_id,
           count(*)::int as days_total,
           count(dn.id)::int as days_with_note
      from days d
      left join public.day_notes dn
        on dn.journey_id = d.journey_id and dn.local_date = d.local_date
     group by d.journey_id
  ),
  media_counts as (
    select md.journey_id,
           count(*)::int as media_total,
           (count(*) filter (where md.reviewed_at is null))::int as media_unreviewed,
           (count(*) filter (where md.starred))::int as starred
      from mine m
      join public.media md on md.journey_id = m.id
     where md.deleted_at is null and md.status = 'ready'
     group by md.journey_id
  )
  select m.id,
         coalesce(dc.days_total, 0),
         coalesce(dc.days_with_note, 0),
         coalesce(mc.media_total, 0),
         coalesce(mc.media_unreviewed, 0),
         coalesce(mc.starred, 0),
         m.cover_media_id
    from mine m
    left join day_counts dc on dc.journey_id = m.id
    left join media_counts mc on mc.journey_id = m.id
   order by m.id
$$;

revoke all on function public.journey_progress(uuid[]) from public, anon, authenticated;
grant execute on function public.journey_progress(uuid[]) to authenticated;
