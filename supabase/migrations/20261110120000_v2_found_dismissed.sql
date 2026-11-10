-- Phase 4f, DB contract wave 4 (follow-up): a photo dismissed before upload is
-- remembered, never re-offered, restorable. Product decision 2026-11-10.
--
-- Additive on top of 20261031120100_v2_media_found.sql:
--   1. Found rows are never hard-deleted by the Trash flow. claim_media_purge and
--      purge_media skip status = 'found', so "empty the Trash" can no longer make a
--      dismissed asset "new" again (a found row has no file to delete anyway).
--      Rows still go away with their journey / account (FK cascade).
--   2. triage_found_media gets the decisions of the product vocabulary:
--        keep, star, unstar, dismiss, restore, undecided (and 'drop' = 'dismiss',
--        kept for the already proposed contract). Dismissed = status 'found' +
--        deleted_at set; restore undoes it.
--   3. known_source_assets: read RPC "which of these source_asset_ids do we know",
--      so "since last import" and the picker can skip known assets without
--      downloading thousands of rows.
-- create_found_media is unchanged: its insert is "on conflict do nothing" on
-- (owner_id, source_asset_id), so a dismissed row is reported 'existing' and never
-- turns back into 'found' (tested in v2_media_found_dismissed.test.sql).

-- ---------------------------------------------------------------------------
-- 1. Purge must not delete found rows (patch existing definitions in place)
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn text;
  v_def text;
  v_new text;
begin
  foreach v_fn in array array['public.claim_media_purge(uuid[])', 'public.purge_media(uuid[])'] loop
    v_def := pg_get_functiondef(v_fn::regprocedure);
    v_new := replace(v_def,
      'journey_id = v_journey and deleted_at is not null',
      'journey_id = v_journey and deleted_at is not null and status <> ''found''');
    if v_new = v_def then
      raise exception 'purge patch did not change %', v_fn;
    end if;
    execute v_new;
  end loop;
end
$$;

revoke all on function public.claim_media_purge(uuid[]) from public, anon, authenticated;
revoke all on function public.purge_media(uuid[]) from public, anon, authenticated;
grant execute on function public.claim_media_purge(uuid[]) to authenticated;
grant execute on function public.purge_media(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. triage_found_media with the full decision set
--   'keep'      kept (reviewed_at = now() if unset); also brings a dismissed row back
--   'star'      keep + starred = true ("best")
--   'unstar'    starred = false (kept state unchanged)
--   'dismiss'   dismissed before upload (deleted_at = now() if unset); remembered
--   'drop'      alias of 'dismiss'
--   'restore'   undo dismiss: back to kept or undecided, whatever it was
--   'undecided' undo everything: reviewed_at, deleted_at cleared (starred kept)
-- Only status 'found' rows change; rows claimed for purge are skipped. Returns the
-- number of rows actually changed (a second identical call returns 0).
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
  if p_decision is null
     or p_decision not in ('keep', 'star', 'unstar', 'dismiss', 'drop', 'restore', 'undecided') then
    raise exception 'triage_found_media: decision must be keep, star, unstar, dismiss, restore or undecided'
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
  elsif p_decision = 'star' then
    update public.media
       set reviewed_at = coalesce(reviewed_at, now()), deleted_at = null, starred = true
     where id = any (p_media_ids) and journey_id = v_journey and status = 'found'
       and purge_claimed_at is null
       and (reviewed_at is null or deleted_at is not null or not starred);
  elsif p_decision = 'unstar' then
    update public.media set starred = false
     where id = any (p_media_ids) and journey_id = v_journey and status = 'found'
       and starred;
  elsif p_decision in ('dismiss', 'drop') then
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

revoke all on function public.triage_found_media(uuid[], text) from public, anon, authenticated;
grant execute on function public.triage_found_media(uuid[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. known_source_assets: which of these assets does the caller already have?
-- Rows are the caller's own (the unique key is per owner), whatever journey they
-- are in; in_journey_id says where. Requires membership of p_journey_id (editor or
-- read-only member; P0002 otherwise, no existence leak). At most 1000 ids per call
-- (22023). Ids without a row are simply absent. state:
--   'found'      found, not yet decided
--   'kept'       found, kept (reviewed_at set)
--   'dismissed'  found, dismissed before upload (do not offer again)
--   'uploaded'   any other status (pending, uploading, ready, failed)
-- ---------------------------------------------------------------------------
create or replace function public.known_source_assets(p_journey_id uuid, p_source_asset_ids text[])
returns table (source_asset_id text, media_id uuid, state text, in_journey_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_journey_id is null or p_source_asset_ids is null then
    raise exception 'known_source_assets: journey and ids are required' using errcode = '22023';
  end if;
  if cardinality(p_source_asset_ids) > 1000 then
    raise exception 'known_source_assets: at most 1000 ids at once' using errcode = '22023';
  end if;
  if not public.is_journey_member(p_journey_id) then
    raise exception 'known_source_assets: journey not found' using errcode = 'P0002';
  end if;
  return query
    select m.source_asset_id, m.id,
           case when m.status <> 'found' then 'uploaded'
                when m.deleted_at is not null then 'dismissed'
                when m.reviewed_at is not null then 'kept'
                else 'found' end,
           m.journey_id
      from public.media m
     where m.owner_id = auth.uid()
       and m.source_asset_id = any (p_source_asset_ids)
     order by m.source_asset_id;
end;
$$;

revoke all on function public.known_source_assets(uuid, text[]) from public, anon, authenticated;
grant execute on function public.known_source_assets(uuid, text[]) to authenticated;
