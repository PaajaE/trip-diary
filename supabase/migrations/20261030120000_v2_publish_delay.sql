-- Delayed publication ("zpozdene zverejneni"): a journey can tell the public
-- read model to show only what is at least publish_delay_days old. Additive.
--
-- Rule (publish_delay_days > 0): the cutoff is now() - delay. Anonymous readers
-- (get_public_journey, get_public_engagement, list_public_journey_paths and the
-- anon/guest RLS through is_interactable_target) only see
--   * moments with starts_at <= cutoff,
--   * media captured at or before the cutoff (media without captured_at fall
--     back to their moment's starts_at; unassigned media without a time are
--     hidden), and with them their variants,
--   * segments with starts_at <= cutoff (ends_at is hidden while it lies after
--     the cutoff); tracks only of segments that already ended before the cutoff,
--   * cover ids, segment overrides, places and day notes only as far as they
--     refer to visible rows; the journey ends_at/starts_at only when past.
-- Delay 0 keeps the previous behaviour exactly. Members (RLS, search_journey,
-- journey_progress) are not affected.
-- KNOWN GAP (decision pending): the legacy v1 tables (entries, photos,
-- journey_stages, journey_stops, ...) are still anon-readable by journey
-- visibility and do not honour the delay; they are frozen until v1 is dropped.
-- Segment title/body of a stage that has started are public as a whole. There is no server-side "hide home
-- location" switch: the public model never exposes a home location.

alter table public.journeys
  add column publish_delay_days integer not null default 0,
  add constraint journeys_publish_delay_days_check
    check (publish_delay_days between 0 and 365);

grant update (publish_delay_days) on public.journeys to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers (internal: only called from security definer functions)
-- ---------------------------------------------------------------------------
create or replace function public.journey_publish_cutoff(p_journey_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case when j.publish_delay_days = 0 then 'infinity'::timestamptz
         else now() - make_interval(days => j.publish_delay_days) end
  from public.journeys j
  where j.id = p_journey_id
$$;

-- true when the instant is public under the journey's delay; an unknown
-- instant is public only without a delay
create or replace function public.is_published_at(p_journey_id uuid, p_ts timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_ts, 'infinity'::timestamptz)
         <= public.journey_publish_cutoff(p_journey_id)
$$;

create or replace function public.is_media_published(
  p_journey_id uuid,
  p_captured_at timestamptz,
  p_moment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_published_at(
    p_journey_id,
    coalesce(p_captured_at, (select mo.starts_at from public.moments mo where mo.id = p_moment_id))
  )
$$;

revoke all on function public.journey_publish_cutoff(uuid) from public, anon, authenticated;
revoke all on function public.is_published_at(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.is_media_published(uuid, timestamptz, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- In-place patches (same technique as the earlier migrations): every pair must
-- match exactly the expected number of times, otherwise the migration fails.
-- ---------------------------------------------------------------------------
create function pg_temp.patch_fn(p_sig text, p_old text[], p_new text[], p_counts int[])
returns void
language plpgsql
as $$
declare
  v_def text := pg_get_functiondef(p_sig::regprocedure);
  v_n int;
  i int;
begin
  for i in 1 .. array_length(p_old, 1) loop
    v_n := (length(v_def) - length(replace(v_def, p_old[i], ''))) / length(p_old[i]);
    if v_n <> p_counts[i] then
      raise exception 'patch % of %: expected % matches, found %',
        i, p_sig, p_counts[i], v_n;
    end if;
    v_def := replace(v_def, p_old[i], p_new[i]);
  end loop;
  execute v_def;
end
$$;

select pg_temp.patch_fn(
  'public.get_public_journey(text, text)',
  array[
    '    where mo.published',
    'where m.status = ''ready'' and m.deleted_at is null',
    'cm.deleted_at is null)',
    'join journey j on j.id = sg.journey_id',
    '''endsAt'', sg.ends_at,',
    '''segmentOverrideId'', vm.segment_override_id,',
    'join journey j on j.id = t.journey_id',
    '''startsAt'', j.starts_at,',
    '''endsAt'', j.ends_at,',
    '''endsAt'', vm.ends_at,'
  ],
  array[
    '    where mo.published and public.is_published_at(j.id, mo.starts_at)',
    'where m.status = ''ready'' and m.deleted_at is null' ||
      ' and public.is_media_published(j.id, m.captured_at, m.moment_id)',
    'cm.deleted_at is null and public.is_media_published(cm.journey_id, cm.captured_at, cm.moment_id))',
    E'join journey j on j.id = sg.journey_id\n      where public.is_published_at(j.id, sg.starts_at)',
    '''endsAt'', case when public.is_published_at(j.id, sg.ends_at) then sg.ends_at end,',
    '''segmentOverrideId'', (select so.id from public.segments so where so.id = vm.segment_override_id' ||
      ' and public.is_published_at(so.journey_id, so.starts_at)),',
    E'join journey j on j.id = t.journey_id\n      where public.journey_publish_cutoff(j.id) = ''infinity''' ||
      E'\n         or exists (select 1 from public.segments ts where ts.id = t.segment_id' ||
      ' and public.is_published_at(j.id, ts.ends_at))',
    '''startsAt'', case when public.is_published_at(j.id, j.starts_at::timestamptz) then j.starts_at end,',
    '''endsAt'', case when public.is_published_at(j.id, j.ends_at::timestamptz) then j.ends_at end,',
    '''endsAt'', case when public.is_published_at(vm.journey_id, vm.ends_at) then vm.ends_at end,'
  ],
  array[1, 1, 3, 1, 1, 1, 1, 1, 1, 1]
);

select pg_temp.patch_fn(
  'public.get_public_engagement(text, text)',
  array[
    'join journey j on j.id = sg.journey_id',
    'join journey j on j.id = mo.journey_id where mo.published',
    'where m.status = ''ready'' and m.deleted_at is null',
    'mo.id = m.moment_id and mo.published'
  ],
  array[
    'join journey j on j.id = sg.journey_id where public.is_published_at(j.id, sg.starts_at)',
    'join journey j on j.id = mo.journey_id where mo.published' ||
      ' and public.is_published_at(j.id, mo.starts_at)',
    'where m.status = ''ready'' and m.deleted_at is null' ||
      ' and public.is_media_published(j.id, m.captured_at, m.moment_id)',
    'mo.id = m.moment_id and mo.published and public.is_published_at(j.id, mo.starts_at)'
  ],
  array[1, 1, 1, 1]
);

select pg_temp.patch_fn(
  'public.is_interactable_target(public.content_target_type, uuid)',
  array[
    'where sg.id = p_target_id and j.visibility = ''public''',
    'where mo.id = p_target_id and mo.published and j.visibility = ''public''',
    'and m.status = ''ready'' and m.deleted_at is null',
    'mo.id = m.moment_id and mo.published'
  ],
  array[
    'where sg.id = p_target_id and j.visibility = ''public''' ||
      ' and public.is_published_at(j.id, sg.starts_at)',
    'where mo.id = p_target_id and mo.published and j.visibility = ''public''' ||
      ' and public.is_published_at(j.id, mo.starts_at)',
    'and m.status = ''ready'' and m.deleted_at is null' ||
      ' and public.is_media_published(j.id, m.captured_at, m.moment_id)',
    'mo.id = m.moment_id and mo.published and public.is_published_at(j.id, mo.starts_at)'
  ],
  array[1, 1, 1, 1]
);

-- ---------------------------------------------------------------------------
-- Sitemap / prerender path list: a delayed journey is listed only once it has
-- a visible moment, and its updated_at never reveals newer edits.
-- ---------------------------------------------------------------------------
create or replace function public.list_public_journey_paths()
returns table (space_handle text, journey_slug text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.handle, j.slug,
         case when j.publish_delay_days = 0 then j.updated_at
              else least(j.updated_at, public.journey_publish_cutoff(j.id)) end
  from public.journeys j
  join public.spaces s on s.id = j.space_id
  where j.visibility = 'public' and j.slug is not null
    and (j.publish_delay_days = 0 or exists (
      select 1 from public.moments mo
      where mo.journey_id = j.id and mo.published
        and mo.starts_at <= public.journey_publish_cutoff(j.id)
    ))
  order by s.handle, j.slug;
$$;
