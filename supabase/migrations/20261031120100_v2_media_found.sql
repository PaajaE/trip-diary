-- Phase 4f, DB contract wave 4 (part 2 of 2): "found" media, triaged before upload.
-- Decision record: docs/plan-v2.md, Phase 4f "DB kontrakt wave 4".
--
-- A media row with status 'found' exists from metadata alone (captured_at,
-- captured_tz, GPS, dimensions, phash, quality, device); no file, no variants.
-- The journey can be organised (moments, days, move_media, ...) and triaged
-- before anything is uploaded.
--
-- Triage state reuses existing columns, no new column:
--   undecided  status = 'found', reviewed_at IS NULL,     deleted_at IS NULL
--   kept       status = 'found', reviewed_at IS NOT NULL, deleted_at IS NULL
--   best       kept + starred (the existing column, set as before)
--   dropped    status = 'found', deleted_at IS NOT NULL   (= in the Trash)
-- A dropped row keeps its (owner_id, source_asset_id) slot in the existing
-- unique index, so the next import of the same asset is deduplicated and the
-- item is not offered again; restore brings it back. Emptying the Trash
-- (purge_media) deletes the row, which makes the asset "new" again - this is
-- the one way to forget a dropped item.
-- Uploading: promote_found_media moves kept rows 'found' -> 'pending'; from
-- there the existing upload flow (uploading -> ready | failed) applies.
--
-- Invariants (all enforced here, tested in v2_media_found.test.sql):
--   * Public RPCs already select only status = 'ready', so found rows never
--     reach anon (checked, not changed).
--   * journey_progress counts only status = 'ready'; unchanged on purpose:
--     "to sort" there means uploaded and not yet reviewed. Found items have
--     their own triage state; the client counts them with a plain select.
--   * No storage quota is computed in the database (media_variants.byte_size
--     is never summed); found rows have no variants, so they weigh nothing.
--   * A found row cannot get variants (trigger) and cannot be a cover
--     (cover trigger), so nothing imageless can surface as a cover.
--   * Status moves only found -> pending (trigger); nothing may become
--     'found' by UPDATE, nothing may skip the upload steps.
--   * RLS: found rows are visible to their owner and to journey editors, NOT
--     to read-only members (untriaged items may be dropped and must not leak).
--
-- Errors as in the curation RPCs: P0002 not found / not visible, 42501 not an
-- editor, 22023 invalid argument. Writes require owner_id = caller AND editor.
-- Batch size: up to 5000 items per call (the older helper caps at 500). The
-- client should send chunks of 1000-2000 (one call is one statement, well under
-- the API statement timeout at that size).

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index media_found_idx on public.media (journey_id, captured_at)
  where status = 'found' and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Row guards
-- ---------------------------------------------------------------------------
create or replace function public.enforce_media_found_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'found' and old.status <> 'found' then
    raise exception 'media cannot become found again' using errcode = '23514';
  end if;
  if old.status = 'found' and new.status not in ('found', 'pending') then
    raise exception 'found media can only move to pending' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger media_found_transition
before update of status on public.media
for each row when (old.status is distinct from new.status)
execute function public.enforce_media_found_transition();

create or replace function public.enforce_variant_not_for_found()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.media where id = new.media_id and status = 'found') then
    raise exception 'found media cannot have variants' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger media_variants_not_for_found
before insert on public.media_variants
for each row execute function public.enforce_variant_not_for_found();

-- Cover guard: patch the existing definition in place (as 4b did) so it
-- cannot drift: a cover must not be a found row.
do $$
declare
  v_def text := pg_get_functiondef('public.enforce_cover_media_journey()'::regprocedure);
  v_new text;
begin
  v_new := replace(v_def,
    'journey_id = v_journey_id and deleted_at is null',
    'journey_id = v_journey_id and deleted_at is null and status <> ''found''');
  if v_new = v_def then
    raise exception 'cover guard patch did not change enforce_cover_media_journey';
  end if;
  execute v_new;
end
$$;

revoke all on function public.enforce_media_found_transition() from public, anon, authenticated;
revoke all on function public.enforce_variant_not_for_found() from public, anon, authenticated;
revoke all on function public.enforce_cover_media_journey() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS: found rows are visible to owner and editors only.
-- ---------------------------------------------------------------------------
drop policy "Owners and journey members read media" on public.media;
create policy "Owners and journey members read media" on public.media
for select to authenticated using (
  owner_id = auth.uid()
  or (
    journey_id is not null
    and public.is_journey_member(journey_id)
    and (status <> 'found' or public.can_edit_journey(journey_id))
  )
);

-- ---------------------------------------------------------------------------
-- Internal helper: like media_batch_journey, but for the caller's OWN rows and
-- up to 5000 ids. Foreign / unknown / non-member -> P0002 (no existence leak),
-- more than one journey -> 22023, not an editor -> 42501. Locks the rows.
-- ---------------------------------------------------------------------------
create or replace function public.found_media_batch_journey(p_media_ids uuid[], p_fn text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[];
  v_journeys uuid[];
  v_found int;
  v_foreign boolean;
begin
  if p_media_ids is null then
    raise exception '%: media ids are required', p_fn using errcode = '22023';
  end if;
  if cardinality(p_media_ids) > 5000 then
    raise exception '%: at most 5000 media at once', p_fn using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids
    from unnest(p_media_ids) x where x is not null;
  if cardinality(v_ids) = 0 then
    return null;
  end if;

  select array_agg(distinct m.journey_id), count(*)::int,
         coalesce(bool_or(m.owner_id is distinct from v_uid), false)
    into v_journeys, v_found, v_foreign
    from public.media m where m.id = any (v_ids);
  if v_found <> cardinality(v_ids) or v_foreign then
    raise exception '%: media not found', p_fn using errcode = 'P0002';
  end if;
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

revoke all on function public.found_media_batch_journey(uuid[], text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_found_media: bulk, idempotent creation of found rows.
--
-- p_items is a jsonb array; per item (camelCase keys, unknown keys ignored):
--   id (uuid, required, client generated), sourceAssetId (text 1..255, required),
--   kind ('photo'|'video', default photo), capturedAt, capturedTz, latitude,
--   longitude, altitude, width, height, durationMs, device, capturedAtSource,
--   locationSource, phash, quality.
-- owner_id is always the caller, status always 'found'. content_hash is NOT
-- accepted here (the file is not read yet); it arrives with promote_found_media.
--
-- Idempotency key: (owner_id, source_asset_id), the existing unique index.
-- Rows that already exist (found, kept, dropped, or already uploaded, in this
-- or another journey) are NOT touched. One result row per distinct
-- sourceAssetId says what is there:
--   outcome 'inserted' | 'existing' | 'id_conflict' (the given id is taken by an
--   unrelated row; media_id is null - retry with a new id).
-- kept = reviewed_at is set, dropped = in the Trash. Re-running the same call
-- inserts nothing and returns 'existing' for every item.
-- ---------------------------------------------------------------------------
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

  begin
    if exists (
      select 1
        from jsonb_to_recordset(p_items) as x(id uuid, "sourceAssetId" text)
       where x.id is null or x."sourceAssetId" is null
    ) then
      raise exception 'create_found_media: id and sourceAssetId are required'
        using errcode = '22023';
    end if;

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
      select s.id, v_uid, p_journey_id, coalesce(s.kind, 'photo'), 'found',
             s."capturedAt", s."capturedTz", s.latitude, s.longitude,
             s.altitude, s.width, s.height, s."durationMs",
             s."sourceAssetId", s.device, s."capturedAtSource",
             s."locationSource", s.phash, s.quality
        from src s
      on conflict do nothing
      returning source_asset_id
    )
    select coalesce(array_agg(i.source_asset_id), '{}') into v_inserted from ins i;
  exception
    when invalid_text_representation or invalid_datetime_format
      or datetime_field_overflow or numeric_value_out_of_range
      or invalid_parameter_value or invalid_time_zone_displacement_value then
      raise exception 'create_found_media: invalid item (%)', sqlerrm
        using errcode = '22023';
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

-- ---------------------------------------------------------------------------
-- triage_found_media: decide found rows. Own rows, one journey, editor.
--   'keep'      kept (reviewed_at = now() if unset); also brings a dropped row back
--   'drop'      dropped (deleted_at = now() if unset); reviewed_at is kept
--   'restore'   undo drop: back to whatever it was (kept or undecided)
--   'undecided' undo everything: reviewed_at and deleted_at cleared
-- Only status 'found' rows change; rows claimed for purge are skipped; every
-- other row is ignored. Returns the number of rows actually changed, so a
-- second identical call returns 0. Starring stays a plain update of `starred`.
-- ---------------------------------------------------------------------------
create or replace function public.triage_found_media(p_media_ids uuid[], p_decision text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_journey uuid;
  v_count int;
begin
  if p_decision is null or p_decision not in ('keep', 'drop', 'restore', 'undecided') then
    raise exception 'triage_found_media: decision must be keep, drop, restore or undecided'
      using errcode = '22023';
  end if;
  v_journey := public.found_media_batch_journey(p_media_ids, 'triage_found_media');
  if v_journey is null then
    return 0;
  end if;

  if p_decision = 'keep' then
    update public.media
       set reviewed_at = coalesce(reviewed_at, now()), deleted_at = null
     where id = any (p_media_ids) and journey_id = v_journey and status = 'found'
       and purge_claimed_at is null
       and (reviewed_at is null or deleted_at is not null);
  elsif p_decision = 'drop' then
    update public.media set deleted_at = now()
     where id = any (p_media_ids) and journey_id = v_journey and status = 'found'
       and deleted_at is null;
  elsif p_decision = 'restore' then
    update public.media set deleted_at = null
     where id = any (p_media_ids) and journey_id = v_journey and status = 'found'
       and deleted_at is not null and purge_claimed_at is null;
  else
    update public.media set reviewed_at = null, deleted_at = null
     where id = any (p_media_ids) and journey_id = v_journey and status = 'found'
       and purge_claimed_at is null
       and (reviewed_at is not null or deleted_at is not null);
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- promote_found_media: kept found rows -> 'pending' when their upload starts.
--
-- p_items: jsonb array of {id, contentHash?}. contentHash (sha-256 hex) is
-- recorded here because content_hash has no UPDATE grant. One result row per
-- distinct id:
--   'promoted'          found + kept -> pending (content_hash set if given)
--   'already_promoted'  status is not found any more (idempotent re-run)
--   'not_kept'          still found but undecided, dropped or claimed for purge
--   'duplicate'         the content hash is already held by another row of the
--                       owner (or by an earlier item of this call); the row stays
--                       found, duplicate_of names the holder - the client drops it
-- reviewed_at stays set: a kept photo counts as sorted after upload.
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

  begin
    if exists (
      select 1 from jsonb_to_recordset(p_items) as x(id uuid, "contentHash" text)
       where x.id is null
          or (x."contentHash" is not null and x."contentHash" !~ '^[a-f0-9]{64}$')
    ) then
      raise exception 'promote_found_media: every item needs an id and a valid contentHash'
        using errcode = '22023';
    end if;
    select array_agg(x.id) into v_ids
      from jsonb_to_recordset(p_items) as x(id uuid);
  exception
    when invalid_text_representation then
      raise exception 'promote_found_media: invalid item (%)', sqlerrm using errcode = '22023';
  end;

  v_journey := public.found_media_batch_journey(v_ids, 'promote_found_media');
  if v_journey is null then
    return;
  end if;

  return query
  with items as (
    select distinct on (x.id) x.id, x."contentHash" as h
      from jsonb_to_recordset(p_items) as x(id uuid, "contentHash" text)
     order by x.id
  ),
  cand as (
    select m.id, m.status, coalesce(m.content_hash, i.h) as eh,
           (m.status = 'found' and m.reviewed_at is not null
            and m.deleted_at is null and m.purge_claimed_at is null) as eligible
      from public.media m join items i on i.id = m.id
     where m.journey_id = v_journey
  ),
  dups as (
    select c.id, d.id as holder
      from cand c
      join public.media d on d.owner_id = v_uid and d.content_hash = c.eh and d.id <> c.id
     where c.eligible and c.eh is not null
    union
    select c.id, min(c2.id::text)::uuid
      from cand c
      join cand c2 on c2.eligible and c2.eh = c.eh and c2.id < c.id
     where c.eligible and c.eh is not null
     group by c.id
  ),
  upd as (
    update public.media m
       set status = 'pending', content_hash = c.eh
      from cand c
     where m.id = c.id and c.eligible
       and not exists (select 1 from dups d where d.id = c.id)
    returning m.id
  )
  select c.id,
         case when u.id is not null then 'promoted'
              when c.status <> 'found' then 'already_promoted'
              when exists (select 1 from dups d where d.id = c.id) then 'duplicate'
              else 'not_kept' end,
         (select min(d.holder::text)::uuid from dups d where d.id = c.id)
    from cand c left join upd u on u.id = c.id
   order by c.id;
end;
$$;

revoke all on function public.create_found_media(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.triage_found_media(uuid[], text) from public, anon, authenticated;
revoke all on function public.promote_found_media(jsonb) from public, anon, authenticated;
grant execute on function public.create_found_media(uuid, jsonb) to authenticated;
grant execute on function public.triage_found_media(uuid[], text) to authenticated;
grant execute on function public.promote_found_media(jsonb) to authenticated;
