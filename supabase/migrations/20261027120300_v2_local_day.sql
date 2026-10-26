-- Phase 4f (ZS-D4): one definition of "which day does a moment belong to".
--
-- Rules (shared with packages/core summarizeZonedDays):
--   * The day starts at 04:00 local time: 00:40 belongs to the previous day,
--     03:59 is still the previous day, 04:00 starts the new one.
--   * The time zone of a day is the zone of the majority of that day's photos
--     (media.captured_tz, home_tz for photos without one; ties go to the
--     alphabetically first zone name). Days without photos, and instants that
--     no photo day explains, use journeys.home_tz (UTC when unset).
--
-- Functions (all internal: execute is revoked from clients, callers are
-- SECURITY DEFINER functions or pgTAP running as the owner):
--   local_day(ts, tz)                      pure, stable (AT TIME ZONE depends on the tz database)
--   journey_day_zones(journey)             photo days and their majority zone
--   pick_local_day(ts, home_tz, dates, tzs) day of an instant, pure
-- Replaced (new definitions, same signatures and grants):
--   journey_progress, search_journey, get_public_journey (dayNotes).
-- No tables, no stored state.

create or replace function public.local_day(p_ts timestamptz, p_tz text)
returns date
language sql
stable
parallel safe
set search_path = ''
as $$
  select ((p_ts at time zone p_tz) - interval '4 hours')::date
$$;

-- Days that have photos and the zone each is mostly spent in. Always returns
-- exactly one row; both arrays are in the same (date) order, empty when the
-- journey has no dated photos. A photo's own day is computed in its own zone.
create or replace function public.journey_day_zones(p_journey_id uuid)
returns table (dates date[], tzs text[])
language sql
stable
security definer
set search_path = ''
as $$
  with home as (
    select coalesce(j.home_tz, 'UTC') as tz
      from public.journeys j
     where j.id = p_journey_id
  ),
  votes as (
    select public.local_day(md.captured_at, coalesce(md.captured_tz, h.tz)) as d,
           coalesce(md.captured_tz, h.tz) as tz,
           count(*) as n
      from public.media md
      cross join home h
     where md.journey_id = p_journey_id
       and md.captured_at is not null
       and md.deleted_at is null
       and md.status = 'ready'
     group by 1, 2
  ),
  best as (
    select distinct on (v.d) v.d, v.tz
      from votes v
     order by v.d, v.n desc, v.tz
  )
  select coalesce(array_agg(b.d order by b.d), '{}'::date[]),
         coalesce(array_agg(b.tz order by b.d), '{}'::text[])
    from best b
$$;

-- Day of an instant: the earliest photo day whose zone puts p_ts on that day,
-- otherwise the day in the home zone. NULL for a NULL instant.
create or replace function public.pick_local_day(
  p_ts timestamptz,
  p_home_tz text,
  p_dates date[],
  p_tzs text[]
)
returns date
language sql
stable
parallel safe
set search_path = ''
as $$
  select case
    when p_ts is null then null
    else coalesce(
      (select min(z.d)
         from unnest(p_dates, p_tzs) as z(d, tz)
        where public.local_day(p_ts, z.tz) = z.d),
      public.local_day(p_ts, coalesce(p_home_tz, 'UTC'))
    )
  end
$$;

revoke all on function public.local_day(timestamptz, text) from public, anon, authenticated;
revoke all on function public.journey_day_zones(uuid) from public, anon, authenticated;
revoke all on function public.pick_local_day(timestamptz, text, date[], text[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- journey_progress: days by the shared rule
-- ---------------------------------------------------------------------------
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
           public.pick_local_day(mo.starts_at, m.tz, z.dates, z.tzs) as local_date
      from mine m
      cross join lateral public.journey_day_zones(m.id) z
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

-- ---------------------------------------------------------------------------
-- get_public_journey: dayNotes by the shared rule (patched in place, as the
-- day_notes migration did, so the rest of the function stays untouched)
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_new text;
  v_sig text := 'public.get_public_journey(text, text)';
  v_old text := '(vm.starts_at at time zone coalesce(j.home_tz, ''UTC''))::date = dn.local_date';
  v_repl text := $r$public.pick_local_day(
          vm.starts_at,
          coalesce(j.home_tz, 'UTC'),
          z.dates,
          z.tzs
        ) = dn.local_date$r$;
  -- the zones are computed once per day note, not once per visible moment
  v_join_old text := 'join journey j on j.id = dn.journey_id';
  v_join_new text := E'join journey j on j.id = dn.journey_id\n      cross join lateral public.journey_day_zones(j.id) z';
begin
  v_def := pg_get_functiondef(v_sig::regprocedure);
  if position(v_old in v_def) = 0 or position(v_join_old in v_def) = 0 then
    raise exception 'anchor not found in %', v_sig;
  end if;
  v_new := replace(replace(v_def, v_old, v_repl), v_join_old, v_join_new);
  if v_new = v_def or v_new not like '%pick_local_day%'
     or v_new not like '%journey_day_zones%' then
    raise exception 'local day patch did not apply to %', v_sig;
  end if;
  execute v_new;
end
$$;

-- ---------------------------------------------------------------------------
-- search_journey: days by the shared rule (same body as 20261026120100, only the
-- local_date derivation of moments and media changed).
create or replace function public.search_journey(
  p_journey_id uuid,
  p_query text,
  p_limit int default 30
)
returns table (
  kind text,
  id uuid,
  local_date date,
  title text,
  snippet text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_q text;
  v_nq text;
  v_pat text;
  v_limit int;
  v_tz text;
  v_dates date[];
  v_tzs text[];
begin
  v_q := regexp_replace(coalesce(p_query, ''), '^\s+|\s+$', '', 'g');
  if char_length(v_q) < 2 or char_length(v_q) > 100 then
    raise exception 'search_journey: query must have 2 to 100 characters'
      using errcode = '22023';
  end if;
  v_limit := least(greatest(coalesce(p_limit, 30), 1), 50);

  if p_journey_id is null or not public.is_journey_member(p_journey_id) then
    return;
  end if;
  select coalesce(j.home_tz, 'UTC') into v_tz
    from public.journeys j where j.id = p_journey_id;
  select z.dates, z.tzs into v_dates, v_tzs
    from public.journey_day_zones(p_journey_id) z;

  v_nq := public.search_normalize(v_q);
  v_pat := '%'
    || replace(replace(replace(v_nq, '\', '\\'), '%', '\%'), '_', '\_')
    || '%';

  return query
  select r.kind, r.id, r.local_date, r.title, r.snippet
    from (
      select 'moment'::text as kind,
             mo.id as id,
             public.pick_local_day(mo.starts_at, v_tz, v_dates, v_tzs) as local_date,
             coalesce(mo.title, pl.name) as title,
             public.search_snippet(
               case
                 when public.search_normalize(mo.body) like v_pat escape '\' then mo.body
                 when public.search_normalize(mo.title) like v_pat escape '\' then mo.title
                 else pl.name
               end,
               v_nq
             ) as snippet,
             1 as prio
        from public.moments mo
        left join public.places pl on pl.id = mo.place_id
       where mo.journey_id = p_journey_id
         and (public.search_normalize(mo.body) like v_pat escape '\'
              or public.search_normalize(mo.title) like v_pat escape '\'
              or public.search_normalize(pl.name) like v_pat escape '\')
      union all
      select 'day'::text,
             dn.id,
             dn.local_date,
             null::text,
             public.search_snippet(dn.body, v_nq),
             2
        from public.day_notes dn
       where dn.journey_id = p_journey_id
         and public.search_normalize(dn.body) like v_pat escape '\'
      union all
      select 'media'::text,
             md.id,
             public.pick_local_day(md.captured_at, v_tz, v_dates, v_tzs),
             null::text,
             public.search_snippet(md.caption, v_nq),
             3
        from public.media md
       where md.journey_id = p_journey_id
         and md.status = 'ready'
         and md.deleted_at is null
         and public.search_normalize(md.caption) like v_pat escape '\'
    ) r
   order by r.prio, r.local_date, r.id
   limit v_limit;
end;
$$;

revoke all on function public.search_journey(uuid, text, int) from public, anon, authenticated;
grant execute on function public.search_journey(uuid, text, int) to authenticated;
