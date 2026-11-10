-- Phase 4f, DB contract wave 4, review fixes for PR 69 (additive on top of
-- 20261031120100_v2_media_found.sql and 20261110120000_v2_found_dismissed.sql).
--
--  M1  A found row leaves 'found' only through promote_found_media. The status
--      trigger now rejects every other change of status into or out of 'found'
--      with 42501: it needs the transaction-local flag app.media_found_transition
--      = '1', set (and cleared again) only inside promote_found_media, AND a
--      caller that is not authenticated/anon (a security definer owner), so a
--      client cannot set the flag itself.
--  M2  Deleting a journey deletes its found rows (they have no storage object).
--      CORRECTION of the header of 20261110120000_v2_found_dismissed.sql, which
--      says found rows "go away with their journey (FK cascade)": that was wrong.
--      The existing detach trigger set journey_id = null and left orphan rows
--      that no RPC could reach. detach_media_before_journey_delete now deletes the
--      journey's found rows (of every uploader) first and detaches the rest as
--      before. Their (owner_id, source_asset_id) slots are freed, so the same
--      assets can be found again in a new journey.
--  m1  promote_found_media: concurrent promotes of one content hash end in a
--      per-item 'duplicate', never a raw 23505 (unique_violation is caught per
--      item).
--  m2  Found rows are private to their uploader. media_batch_journey (used by
--      move_media, create_moment_from_media, mark_media_reviewed, shift_media_time,
--      set_media_location, clear_media_location, trash_media, restore_media,
--      claim_media_purge, purge_media) now raises P0002 "media not found" when
--      the batch contains a found row of another uploader. P0002 is what the
--      sibling found RPCs (triage_found_media, promote_found_media) already
--      raise for foreign rows, and it does not reveal that the row exists.
--  m3  Malformed items of create_found_media / promote_found_media raise 22023
--      with the 0-based item index (message capped at 300 characters) instead of
--      a bare 23514.
--  m4  promote_found_media was quadratic when hashes repeat inside one call (a
--      self-join of the candidate set per hash plus a correlated scan of the
--      duplicate set for every row). Rewritten set-based: window functions for
--      in-call duplicates, one index lookup per row on (owner_id, content_hash)
--      for existing holders. No new index needed: media_owner_content_hash_unique_idx
--      and media_owner_source_asset_unique_idx already cover the lookups.
--      Documented client chunk: 1000 items per call (hard cap stays 5000).
--  m5  Found rows are not part of the Trash: media_trash_rows (trash_media and
--      delete_moment 'trash_media'), restore_media, claim_media_purge and
--      purge_media ignore them entirely. Dismissed found rows change only through
--      triage_found_media (dismiss / restore). Contract for the app: a trash
--      listing must filter status <> 'found'.

-- ---------------------------------------------------------------------------
-- M1: status trigger
-- ---------------------------------------------------------------------------
create or replace function public.enforce_media_found_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (old.status = 'found') is distinct from (new.status = 'found') then
    if current_setting('app.media_found_transition', true) is distinct from '1'
       or current_user in ('authenticated', 'anon') then
      raise exception 'found media changes status only through promote_found_media'
        using errcode = '42501';
    end if;
    if new.status = 'found' then
      raise exception 'media cannot become found again' using errcode = '23514';
    end if;
    if new.status <> 'pending' then
      raise exception 'found media can only move to pending' using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;

revoke all on function public.enforce_media_found_transition() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- M2: journey delete removes found rows
-- ---------------------------------------------------------------------------
create or replace function public.detach_media_before_journey_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.media where journey_id = old.id and status = 'found';
  update public.media
  set journey_id = null, moment_id = null, segment_override_id = null
  where journey_id = old.id;
  return old;
end
$$;

revoke all on function public.detach_media_before_journey_delete() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- m2: foreign found rows are off limits for the batch helper
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
  -- Found rows are private to their uploader (as in triage_found_media).
  if exists (
    select 1 from public.media m
     where m.id = any (v_ids) and m.status = 'found'
       and m.owner_id is distinct from auth.uid()
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

revoke all on function public.media_batch_journey(uuid[], text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- m5: Trash RPCs ignore found rows
-- ---------------------------------------------------------------------------
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
   where id = any (p_ids) and journey_id = p_journey and deleted_at is null
     and status <> 'found';
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

revoke all on function public.media_trash_rows(uuid, uuid[]) from public, anon, authenticated;

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
     and purge_claimed_at is null and status <> 'found';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.restore_media(uuid[]) from public, anon, authenticated;
grant execute on function public.restore_media(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- m3: create_found_media with item index in errors.
-- The insert lives in an internal helper so the error path can replay it one
-- item at a time (each in its own subtransaction, rolled back) to find the
-- first bad item.
-- ---------------------------------------------------------------------------
create or replace function public.found_media_insert(p_journey_id uuid, p_items jsonb)
returns text[]
language plpgsql
set search_path = ''
as $$
declare
  v_inserted text[];
begin
  with src as (
    select distinct on (x."sourceAssetId") x.*
      from jsonb_to_recordset(p_items) as x(
        id uuid, "sourceAssetId" text, kind public.media_kind,
        "capturedAt" timestamptz, "capturedTz" text,
        latitude double precision, longitude double precision,
        altitude double precision, width integer, height integer,
        "durationMs" integer, device text, "capturedAtSource" text,
        "locationSource" text, phash bigint, quality jsonb
      )
     order by x."sourceAssetId", x.id
  ),
  ins as (
    insert into public.media (
      id, owner_id, journey_id, kind, status, captured_at, captured_tz,
      latitude, longitude, altitude, width, height, duration_ms,
      source_asset_id, device, captured_at_source, location_source,
      phash, quality
    )
    select s.id, auth.uid(), p_journey_id, coalesce(s.kind, 'photo'), 'found',
           s."capturedAt", s."capturedTz", s.latitude, s.longitude,
           s.altitude, s.width, s.height, s."durationMs",
           s."sourceAssetId", s.device, s."capturedAtSource",
           s."locationSource", s.phash, s.quality
      from src s
    on conflict do nothing
    returning source_asset_id
  )
  select coalesce(array_agg(i.source_asset_id), '{}') into v_inserted from ins i;
  return v_inserted;
end;
$$;

revoke all on function public.found_media_insert(uuid, jsonb) from public, anon, authenticated;

-- Items: id (uuid) and sourceAssetId (text 1..255) are required; the other keys
-- are as before. Any invalid item raises 22023 "create_found_media: invalid item
-- <index>: <reason>" (0-based index, message capped).
create or replace function public.create_found_media(p_journey_id uuid, p_items jsonb)
returns table (
  asset_id text,
  media_id uuid,
  outcome text,
  in_journey_id uuid,
  current_status public.media_status,
  kept boolean,
  dropped boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inserted text[];
  v_bad int;
  v_i int;
  v_reason text;
begin
  if p_journey_id is null then
    raise exception 'create_found_media: journey is required' using errcode = '22023';
  end if;
  if not public.is_journey_member(p_journey_id) then
    raise exception 'create_found_media: journey not found' using errcode = 'P0002';
  end if;
  if not public.can_edit_journey(p_journey_id) then
    raise exception 'create_found_media: not allowed to edit this journey' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'create_found_media: items must be a json array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 5000 then
    raise exception 'create_found_media: at most 5000 items at once' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) = 0 then
    return;
  end if;

  -- Cheap structural checks first (no casts, so nothing can throw here).
  select min(e.ord - 1)::int into v_bad
    from jsonb_array_elements(p_items) with ordinality e(v, ord)
   where jsonb_typeof(e.v) <> 'object'
      or (e.v ->> 'id') is null
      or (e.v ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (e.v ->> 'sourceAssetId') is null
      or char_length(e.v ->> 'sourceAssetId') not between 1 and 255;
  if v_bad is not null then
    raise exception 'create_found_media: invalid item %: id and sourceAssetId (1..255 characters) are required', v_bad
      using errcode = '22023';
  end if;

  begin
    v_inserted := public.found_media_insert(p_journey_id, p_items);
  exception
    when others then
      -- Replay item by item (each attempt rolled back) to name the first bad one.
      for v_i in 0 .. jsonb_array_length(p_items) - 1 loop
        begin
          perform public.found_media_insert(p_journey_id, jsonb_build_array(p_items -> v_i));
          raise exception using errcode = 'P9999', message = 'probe';
        exception
          when sqlstate 'P9999' then
            null;
          when others then
            get stacked diagnostics v_reason = message_text;
            raise exception 'create_found_media: invalid item %: %', v_i, left(v_reason, 200)
              using errcode = '22023';
        end;
      end loop;
      -- Not caused by a single item (for example a lock timeout): re-raise as is.
      raise;
  end;

  return query
    select s.sid, m.id,
           case when m.id is null then 'id_conflict'
                when s.sid = any (v_inserted) then 'inserted'
                else 'existing' end,
           m.journey_id, m.status,
           (m.reviewed_at is not null), (m.deleted_at is not null)
      from (select distinct x."sourceAssetId" as sid
              from jsonb_to_recordset(p_items) as x("sourceAssetId" text)) s
      left join public.media m
        on m.owner_id = v_uid and m.source_asset_id = s.sid
     order by s.sid;
end;
$$;

revoke all on function public.create_found_media(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_found_media(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- m1, m3, m4: promote_found_media
--
-- p_items: jsonb array of {id, contentHash?}; contentHash = sha-256 hex.
-- CLIENT CHUNK: send at most 1000 items per call (hard cap 5000, 22023 above).
-- One result row per distinct id:
--   'promoted'          found + kept -> pending (content_hash set if given)
--   'already_promoted'  status is not found any more (idempotent re-run)
--   'not_kept'          still found but undecided, dismissed or claimed for purge
--   'duplicate'         the content hash is held by another row of the owner, by an
--                       earlier id of this call, or by a promote that committed
--                       first (race); the row stays found, duplicate_of names the
--                       holder
-- A contentHash is ignored for a row that already stores one. Only the uploader
-- may promote (P0002 otherwise). Invalid items raise 22023 with the item index.
-- ---------------------------------------------------------------------------
create or replace function public.promote_found_media(p_items jsonb)
returns table (media_id uuid, outcome text, duplicate_of uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_journey uuid;
  v_ids uuid[];
  v_bad int;
  v_plan jsonb;
  v_promote_ids uuid[];
  v_promote_eh text[];
  v_raced_ids uuid[] := '{}';
  v_raced_holders uuid[] := '{}';
  v_i int;
  v_holder uuid;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'promote_found_media: items must be a json array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 5000 then
    raise exception 'promote_found_media: at most 5000 items at once' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) = 0 then
    return;
  end if;

  select min(e.ord - 1)::int into v_bad
    from jsonb_array_elements(p_items) with ordinality e(v, ord)
   where jsonb_typeof(e.v) <> 'object'
      or (e.v ->> 'id') is null
      or (e.v ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or ((e.v ->> 'contentHash') is not null and (e.v ->> 'contentHash') !~ '^[a-f0-9]{64}$');
  if v_bad is not null then
    raise exception 'promote_found_media: invalid item %: every item needs an id and a valid contentHash', v_bad
      using errcode = '22023';
  end if;
  select array_agg(x.id) into v_ids from jsonb_to_recordset(p_items) as x(id uuid);

  v_journey := public.found_media_batch_journey(v_ids, 'promote_found_media');
  if v_journey is null then
    return;
  end if;

  -- Plan, set-based and linear: classify every id once. The CTEs are MATERIALIZED on
  -- purpose: inlined, the planner re-ran the de-duplicated item list for every row.
  with items as materialized (
    select distinct on (x.id) x.id, x."contentHash" as h
      from jsonb_to_recordset(p_items) as x(id uuid, "contentHash" text)
     order by x.id
  ),
  cand as materialized (
    select m.id, m.status, coalesce(m.content_hash, i.h) as eh,
           (m.status = 'found' and m.reviewed_at is not null
            and m.deleted_at is null and m.purge_claimed_at is null) as eligible
      from public.media m join items i on i.id = m.id
     where m.journey_id = v_journey
  ),
  -- One pass, no joins between CTEs (their row estimates are 1, which made the
  -- planner pick nested loops: 25M comparisons for 5000 rows).
  cls as materialized (
    select c.id, c.eh, c.status,
           case when not c.eligible then null
                when c.eh is null then 'promote'
                when h.holder is not null or c.rn > 1 then 'duplicate'
                else 'promote' end as k,
           coalesce(h.holder, case when c.rn > 1 then c.first_id end) as holder
      from (
        select c0.*,
               row_number() over (partition by c0.grp order by c0.id) as rn,
               first_value(c0.id) over (partition by c0.grp order by c0.id) as first_id
          from (select cand.*,
                       case when cand.eligible and cand.eh is not null then cand.eh end as grp
                  from cand) c0
      ) c
      left join lateral (
        select d.id as holder from public.media d
         where c.grp is not null and d.owner_id = v_uid
           and d.content_hash = c.grp and d.id <> c.id
         limit 1
      ) h on true
  )
  select jsonb_agg(jsonb_build_object(
           'id', k.id,
           'o', case k.k when 'promote' then 'promoted'
                         when 'duplicate' then 'duplicate'
                         else case when k.status <> 'found' then 'already_promoted'
                                   else 'not_kept' end end,
           'd', k.holder)),
         array_agg(k.id) filter (where k.k = 'promote'),
         array_agg(k.eh) filter (where k.k = 'promote')
    into v_plan, v_promote_ids, v_promote_eh
    from cls k;

  if v_promote_ids is not null then
    perform set_config('app.media_found_transition', '1', true);
    begin
      update public.media m
         set status = 'pending', content_hash = p.eh
        from unnest(v_promote_ids, v_promote_eh) as p(id, eh)
       where m.id = p.id;
    exception
      when unique_violation then
        -- A concurrent promote took one of the hashes after our plan. The bulk
        -- statement is rolled back; redo it per item, a taken hash = 'duplicate'.
        for v_i in 1 .. cardinality(v_promote_ids) loop
          begin
            update public.media set status = 'pending', content_hash = v_promote_eh[v_i]
             where id = v_promote_ids[v_i];
          exception
            when unique_violation then
              select d.id into v_holder from public.media d
               where d.owner_id = v_uid and d.content_hash = v_promote_eh[v_i]
                 and d.id <> v_promote_ids[v_i] limit 1;
              v_raced_ids := v_raced_ids || v_promote_ids[v_i];
              v_raced_holders := v_raced_holders || v_holder;
          end;
        end loop;
    end;
    perform set_config('app.media_found_transition', '', true);
  end if;

  return query
  select p.id,
         case when r.id is not null then 'duplicate' else p.o end,
         coalesce(r.holder, p.d)
    from jsonb_to_recordset(v_plan) as p(id uuid, o text, d uuid)
    left join unnest(v_raced_ids, v_raced_holders) as r(id, holder) on r.id = p.id
   order by p.id;
end;
$$;

revoke all on function public.promote_found_media(jsonb) from public, anon, authenticated;
grant execute on function public.promote_found_media(jsonb) to authenticated;
