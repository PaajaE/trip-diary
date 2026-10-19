-- Phase 4b: owner workspace as a sorting desk (docs/plan-v2.md, decision 8).
--
-- * media.deleted_at: soft delete ("trash"). Trashed media keep moment_id and
--   segment_override_id so a restore puts them back. deleted_at is NOT in any
--   client column grant: only the RPCs below change it. The unique indexes on
--   (owner_id, source_asset_id) and (owner_id, content_hash) deliberately keep
--   covering trashed rows, so a re-import cannot resurrect or duplicate them.
-- * Public read paths hide trashed media and never expose a trashed cover.
-- * RPCs (SECURITY DEFINER with explicit checks, because a journey editor may
--   have to touch rows RLS would not let them update, e.g. the journey cover):
--   trash_media, restore_media, claim_media_purge, purge_media, move_media,
--   create_moment_from_media, delete_moment.
-- * Purge is two-step to avoid a race with restore: claim_media_purge marks
--   trashed rows (purge_claimed_at, no client grant) and returns exactly the ids
--   whose R2 objects the client may delete; restore_media skips claimed rows
--   (their files may already be gone); purge_media deletes only trashed AND
--   claimed rows. Claiming is idempotent; unpurged claimed rows stay in trash.
-- * Privacy of moving media: public RPCs show media of published moments AND
--   media without a moment. So unassigning media of an unpublished moment would
--   publish them. delete_moment('keep_media') therefore moves media only to the
--   nearest moment with the same published flag (time only, segment is not
--   considered). No such neighbour: unpublished source -> 22023
--   'delete_moment: no neighbour with the same visibility' (use trash_media);
--   published source -> media become unassigned (still public, no leak).
--   move_media rejects a null target (22023).
-- Error codes as in the editing RPCs: P0002 not found / not visible,
-- 42501 not an editor, 22023 invalid argument (cross-journey, too many ids...).

alter table public.media add column deleted_at timestamptz;
alter table public.media add column purge_claimed_at timestamptz;

create index media_trashed_idx on public.media (journey_id, deleted_at)
  where deleted_at is not null;

-- ---------------------------------------------------------------------------
-- Public read paths: patch the existing definitions in place so they cannot
-- drift from the originals.
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_new text;
  v_sig text;
begin
  foreach v_sig in array array[
    'public.get_public_journey(text, text)',
    'public.get_public_engagement(text, text)',
    'public.is_interactable_target(public.content_target_type, uuid)',
    'public.enforce_cover_media_journey()'
  ] loop
    v_def := pg_get_functiondef(v_sig::regprocedure);
    v_new := v_def;

    if v_sig like 'public.enforce_cover_media_journey%' then
      v_new := replace(v_new, 'where id = new.cover_media_id and journey_id = v_journey_id',
        'where id = new.cover_media_id and journey_id = v_journey_id and deleted_at is null');
    else
      v_new := replace(v_new, 'm.status = ''ready''',
        'm.status = ''ready'' and m.deleted_at is null');
    end if;

    if v_sig like 'public.get_public_journey%' then
      v_new := replace(v_new, '''coverMediaId'', j.cover_media_id',
        '''coverMediaId'', (select cm.id from public.media cm where cm.id = j.cover_media_id and cm.deleted_at is null)');
      v_new := replace(v_new, '''coverMediaId'', sg.cover_media_id',
        '''coverMediaId'', (select cm.id from public.media cm where cm.id = sg.cover_media_id and cm.deleted_at is null)');
      v_new := replace(v_new, '''coverMediaId'', vm.cover_media_id',
        '''coverMediaId'', (select cm.id from public.media cm where cm.id = vm.cover_media_id and cm.deleted_at is null)');
    end if;

    if v_new = v_def then
      raise exception 'trash patch did not change %', v_sig;
    end if;
    if v_sig like 'public.get_public_journey%'
       and (v_new like '%''coverMediaId'', j.cover_media_id%'
            or v_new like '%''coverMediaId'', sg.cover_media_id%'
            or v_new like '%''coverMediaId'', vm.cover_media_id%') then
      raise exception 'cover patch incomplete for %', v_sig;
    end if;
    execute v_new;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Internal helper: validate a batch of media ids and return their journey.
-- Caller must be a journey member (else P0002, no existence leak) and an
-- editor (else 42501); all ids must exist, share one journey. Locks the rows.
-- ---------------------------------------------------------------------------
create or replace function public.media_batch_journey(p_media_ids uuid[], p_fn text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_journeys uuid[];
  v_found int;
begin
  if p_media_ids is null then
    raise exception '%: media ids are required', p_fn using errcode = '22023';
  end if;
  if cardinality(p_media_ids) > 500 then
    raise exception '%: at most 500 media at once', p_fn using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids
    from unnest(p_media_ids) x where x is not null;
  if cardinality(v_ids) = 0 then
    return null;
  end if;

  select array_agg(distinct m.journey_id), count(*)::int
    into v_journeys, v_found
    from public.media m where m.id = any (v_ids);
  if v_found <> cardinality(v_ids) then
    raise exception '%: media not found', p_fn using errcode = 'P0002';
  end if;
  -- Membership first, so a foreign id never reveals that it exists.
  if exists (
    select 1 from unnest(v_journeys) j
    where j is null or not public.is_journey_member(j)
  ) then
    raise exception '%: media not found', p_fn using errcode = 'P0002';
  end if;
  if cardinality(v_journeys) <> 1 then
    raise exception '%: media must all belong to one journey', p_fn using errcode = '22023';
  end if;
  if not public.can_edit_journey(v_journeys[1]) then
    raise exception '%: not allowed to edit this journey', p_fn using errcode = '42501';
  end if;

  perform 1 from public.media where id = any (v_ids) order by id for update;
  return v_journeys[1];
end;
$$;

-- Trash rows + clear covers pointing at them. Caller has authorized.
create or replace function public.media_trash_rows(p_journey uuid, p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  update public.media set deleted_at = now()
   where id = any (p_ids) and journey_id = p_journey and deleted_at is null;
  get diagnostics v_count = row_count;

  update public.journeys set cover_media_id = null
   where id = p_journey and cover_media_id = any (p_ids);
  update public.segments set cover_media_id = null
   where journey_id = p_journey and cover_media_id = any (p_ids);
  update public.moments set cover_media_id = null
   where journey_id = p_journey and cover_media_id = any (p_ids);
  return v_count;
end;
$$;

revoke all on function public.media_batch_journey(uuid[], text) from public, anon, authenticated;
revoke all on function public.media_trash_rows(uuid, uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- trash_media / restore_media / purge_media
-- ---------------------------------------------------------------------------
create or replace function public.trash_media(p_media_ids uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_journey uuid := public.media_batch_journey(p_media_ids, 'trash_media');
begin
  if v_journey is null then
    return 0;
  end if;
  return public.media_trash_rows(v_journey, p_media_ids);
end;
$$;

create or replace function public.restore_media(p_media_ids uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_journey uuid := public.media_batch_journey(p_media_ids, 'restore_media');
  v_count int;
begin
  if v_journey is null then
    return 0;
  end if;
  -- moment_id was already nulled by the FK if its moment was deleted meanwhile.
  update public.media set deleted_at = null
   where id = any (p_media_ids) and journey_id = v_journey and deleted_at is not null
     and purge_claimed_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.claim_media_purge(p_media_ids uuid[])
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_journey uuid := public.media_batch_journey(p_media_ids, 'claim_media_purge');
begin
  if v_journey is null then
    return;
  end if;
  if exists (
    select 1 from public.media
     where id = any (p_media_ids) and owner_id is distinct from auth.uid()
  ) then
    raise exception 'claim_media_purge: only the uploader can purge media' using errcode = '42501';
  end if;
  return query
    update public.media set purge_claimed_at = coalesce(purge_claimed_at, now())
     where id = any (p_media_ids) and journey_id = v_journey and deleted_at is not null
    returning id;
end;
$$;

create or replace function public.purge_media(p_media_ids uuid[])
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_journey uuid := public.media_batch_journey(p_media_ids, 'purge_media');
begin
  if v_journey is null then
    return;
  end if;
  -- R2 objects live under the uploader's folder and only the uploader can
  -- delete them (delete-media), so only the uploader may purge the rows.
  if exists (
    select 1 from public.media
     where id = any (p_media_ids) and owner_id is distinct from auth.uid()
  ) then
    raise exception 'purge_media: only the uploader can purge media' using errcode = '42501';
  end if;
  return query
    delete from public.media
     where id = any (p_media_ids) and journey_id = v_journey and deleted_at is not null
       and purge_claimed_at is not null
    returning id;
end;
$$;

-- ---------------------------------------------------------------------------
-- move_media: reassign live media to p_target_moment (required).
-- Target and every source moment become manual + locked (as merge_moments);
-- the target range grows to cover the moved media; source covers that moved
-- away are cleared.
-- ---------------------------------------------------------------------------
create or replace function public.move_media(p_media_ids uuid[], p_target_moment uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_journey uuid := public.media_batch_journey(p_media_ids, 'move_media');
  v_ids uuid[];
  v_sources uuid[];
  v_count int;
begin
  if v_journey is null then
    return 0;
  end if;

  perform 1 from public.moments
    where id = p_target_moment and journey_id = v_journey for update;
  if not found then
    raise exception 'move_media: target moment not found in this journey'
      using errcode = '22023';
  end if;

  select array_agg(m.id), array_agg(distinct m.moment_id) filter (where m.moment_id is not null)
    into v_ids, v_sources
    from public.media m
   where m.id = any (p_media_ids) and m.deleted_at is null
     and m.moment_id is distinct from p_target_moment;
  if v_ids is null then
    return 0;
  end if;

  update public.moments set cover_media_id = null
   where journey_id = v_journey and id = any (coalesce(v_sources, '{}'))
     and cover_media_id = any (v_ids);

  update public.media set moment_id = p_target_moment where id = any (v_ids);
  get diagnostics v_count = row_count;

  update public.moments mo
     set starts_at = least(mo.starts_at, coalesce(r.lo, mo.starts_at)),
         ends_at = greatest(mo.ends_at, coalesce(r.hi, mo.ends_at)),
         locked = true, origin = 'manual'
    from (select min(captured_at) lo, max(captured_at) hi
            from public.media where id = any (v_ids) and deleted_at is null) r
   where mo.id = p_target_moment;
  if v_sources is not null then
    update public.moments set locked = true, origin = 'manual'
     where journey_id = v_journey and id = any (v_sources);
  end if;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_moment_from_media: new manual, locked moment spanning the live media.
-- Needs at least one live medium with captured_at. Centroid = mean of the
-- coordinates of media that are not hide_location (moment coordinates are
-- public).
-- ---------------------------------------------------------------------------
create or replace function public.create_moment_from_media(p_media_ids uuid[], p_new_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_journey uuid := public.media_batch_journey(p_media_ids, 'create_moment_from_media');
  v_ids uuid[];
  v_sources uuid[];
  v_lo timestamptz;
  v_hi timestamptz;
  v_lat double precision;
  v_lng double precision;
begin
  if p_new_id is null then
    raise exception 'create_moment_from_media: new id is required' using errcode = '22023';
  end if;
  if v_journey is null then
    raise exception 'create_moment_from_media: no media given' using errcode = '22023';
  end if;

  select array_agg(m.id), array_agg(distinct m.moment_id) filter (where m.moment_id is not null),
         min(m.captured_at), max(m.captured_at),
         avg(m.latitude) filter (where not m.hide_location),
         avg(m.longitude) filter (where not m.hide_location)
    into v_ids, v_sources, v_lo, v_hi, v_lat, v_lng
    from public.media m
   where m.id = any (p_media_ids) and m.deleted_at is null;
  if v_ids is null then
    raise exception 'create_moment_from_media: all media are in the trash'
      using errcode = '22023';
  end if;
  if v_lo is null then
    raise exception 'create_moment_from_media: media have no capture time'
      using errcode = '22023';
  end if;

  insert into public.moments (
    id, journey_id, starts_at, ends_at, latitude, longitude, origin, locked,
    created_by
  ) values (
    p_new_id, v_journey, v_lo, v_hi, v_lat, v_lng, 'manual', true, auth.uid()
  );

  update public.moments set cover_media_id = null
   where journey_id = v_journey and id = any (coalesce(v_sources, '{}'))
     and cover_media_id = any (v_ids);
  update public.media set moment_id = p_new_id where id = any (v_ids);
  if v_sources is not null then
    update public.moments set locked = true, origin = 'manual'
     where journey_id = v_journey and id = any (v_sources);
  end if;
  return p_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_moment: mode 'keep_media' moves all its media (also trashed ones) to
-- the neighbouring moment with the same published flag closest in time
-- (distance between midpoints, ties go to the earlier one). None: unpublished
-- source raises 22023, published source leaves media unassigned (see header).
-- Mode 'trash_media' trashes its live media (they lose moment_id with the FK).
-- ---------------------------------------------------------------------------
create or replace function public.delete_moment(p_moment_id uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_moment public.moments;
  v_neighbour uuid;
  v_ids uuid[];
begin
  if p_moment_id is null or p_mode is null or p_mode not in ('keep_media', 'trash_media') then
    raise exception 'delete_moment: moment and mode (keep_media | trash_media) are required'
      using errcode = '22023';
  end if;

  select * into v_moment from public.moments where id = p_moment_id;
  if not found or not public.is_journey_member(v_moment.journey_id) then
    raise exception 'delete_moment: moment not found' using errcode = 'P0002';
  end if;
  if not public.can_edit_journey(v_moment.journey_id) then
    raise exception 'delete_moment: not allowed to edit this journey' using errcode = '42501';
  end if;
  select * into v_moment from public.moments where id = p_moment_id for update;
  if not found then
    raise exception 'delete_moment: moment not found' using errcode = 'P0002';
  end if;

  select array_agg(id) into v_ids from public.media where moment_id = p_moment_id;

  if v_ids is not null then
    if p_mode = 'trash_media' then
      perform public.media_trash_rows(v_moment.journey_id, v_ids);
    else
      select o.id into v_neighbour
        from public.moments o
       where o.journey_id = v_moment.journey_id and o.id <> v_moment.id
         and o.published = v_moment.published
       order by abs(extract(epoch from
                  (o.starts_at + (o.ends_at - o.starts_at) / 2)
                  - (v_moment.starts_at + (v_moment.ends_at - v_moment.starts_at) / 2))),
                o.starts_at, o.id
       limit 1;
      if v_neighbour is null and not v_moment.published then
        raise exception 'delete_moment: no neighbour with the same visibility'
          using errcode = '22023';
      end if;
      if v_neighbour is not null then
        update public.media set moment_id = v_neighbour where id = any (v_ids);
        update public.moments mo
           set starts_at = least(mo.starts_at, coalesce(r.lo, mo.starts_at)),
               ends_at = greatest(mo.ends_at, coalesce(r.hi, mo.ends_at)),
               locked = true, origin = 'manual'
          from (select min(captured_at) lo, max(captured_at) hi
                  from public.media where id = any (v_ids) and deleted_at is null) r
         where mo.id = v_neighbour;
      end if;
    end if;
  end if;

  delete from public.moments where id = p_moment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: RPCs for signed-in users only. deleted_at has no column grant.
-- ---------------------------------------------------------------------------
revoke all on function public.trash_media(uuid[]) from public, anon, authenticated;
revoke all on function public.restore_media(uuid[]) from public, anon, authenticated;
revoke all on function public.purge_media(uuid[]) from public, anon, authenticated;
revoke all on function public.claim_media_purge(uuid[]) from public, anon, authenticated;
grant execute on function public.claim_media_purge(uuid[]) to authenticated;
revoke all on function public.move_media(uuid[], uuid) from public, anon, authenticated;
revoke all on function public.create_moment_from_media(uuid[], uuid)
  from public, anon, authenticated;
revoke all on function public.delete_moment(uuid, text) from public, anon, authenticated;
grant execute on function public.trash_media(uuid[]) to authenticated;
grant execute on function public.restore_media(uuid[]) to authenticated;
grant execute on function public.purge_media(uuid[]) to authenticated;
grant execute on function public.move_media(uuid[], uuid) to authenticated;
grant execute on function public.create_moment_from_media(uuid[], uuid) to authenticated;
grant execute on function public.delete_moment(uuid, text) to authenticated;
