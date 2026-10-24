-- Phase 4e (D3): read-only progress summary per journey (dashboard, sorting badge).
--
-- * Only journeys the caller is a member of are returned; others are silently
--   omitted (no error, no existence leak).
-- * Days = distinct local dates of moments.starts_at in the journey's home_tz
--   (UTC when unset), the same rule as day_notes in get_public_journey.
-- * days_with_note = those days that have a day_notes row.
-- * Media counts: status 'ready', not trashed.
-- * No table, no stored state.

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
           (mo.starts_at at time zone m.tz)::date as local_date
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
