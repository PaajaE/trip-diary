-- Phase 4f, DB contract wave 4, final fixes for PR 69 (additive on top of
-- 20261110130000_v2_found_review_fixes.sql).
--
--  mi1 promote_found_media returned a bogus duplicate_of on rows that were not
--      duplicates: all rows without a usable hash shared one window partition.
--      Rewritten so that such rows are singletons (partition key = hash, or the
--      row id when there is no hash) and duplicate_of is set ONLY for the outcome
--      'duplicate'. Outcomes are unchanged (differential fuzz, see the PR).
--  mi2 DECISION: found rows are private to their uploader at RLS level, not only
--      in the RPCs. Status 'found' rows can be selected, updated and deleted only
--      by owner_id = auth.uid(): not by other editors, not by the journey owner,
--      not by read-only members, not by anyone else. Rows of every other status
--      keep their policies unchanged. Security definer code (journey-delete
--      cleanup, RPCs) is not subject to RLS, so it is unaffected.
--      known_source_assets filters on owner_id = auth.uid() itself, so it is
--      unaffected as well: a caller only ever sees the state of THEIR OWN rows
--      (found/kept/dismissed/uploaded). A co-uploader that imported the same
--      source_asset_id has a separate row (the unique key is per owner) that is
--      invisible to the caller; the caller never learns it exists.
--  mi4 A kept-then-duplicate promote used to leave the row marked kept. The DB
--      cannot know the state from before a separate triage call, so promote takes
--      an optional per-item flag "keep": true. An UNDECIDED row (found, not
--      reviewed, not dismissed) is then promoted AND marked reviewed in the same
--      statement; if the item ends as 'duplicate' (or fails), nothing about the
--      row changes, so the pre-promote triage state is preserved atomically. The
--      client sends keep:true instead of calling triage_found_media('keep') first.
--      Without the flag an undecided row is still 'not_kept' (unchanged).
--  mi5 DECISION: the bulk RPCs that act on a list of media (move_media,
--      create_moment_from_media, mark_media_reviewed, shift_media_time,
--      set_media_location, clear_media_location, trash_media, restore_media,
--      claim_media_purge, purge_media) silently SKIP found rows of other uploaders
--      instead of failing the whole call with P0002, and return what actually
--      changed (count, or the ids for the setof functions). A batch made only of
--      foreign found rows is a no-op (0 / no rows; create_moment_from_media says
--      "no media given"). Ids that do not exist at all still raise P0002.
--      Foreign found ids are therefore not distinguishable from "nothing to do";
--      triage_found_media and promote_found_media keep P0002 (they are about the
--      caller's own rows only).

-- ---------------------------------------------------------------------------
-- mi2: RLS
-- ---------------------------------------------------------------------------
drop policy "Owners and journey members read media" on public.media;
create policy "Owners and journey members read media" on public.media
for select to authenticated using (
  owner_id = auth.uid()
  or (
    journey_id is not null
    and public.is_journey_member(journey_id)
    and status <> 'found'
  )
);

drop policy "Owners and journey editors update media" on public.media;
create policy "Owners and journey editors update media" on public.media
for update to authenticated
using (
  (
    owner_id = auth.uid()
    or (journey_id is not null and public.can_edit_journey(journey_id))
  )
  and (status <> 'found' or owner_id = auth.uid())
)
with check (
  (
    (journey_id is null and owner_id = auth.uid())
    or (journey_id is not null and public.can_edit_journey(journey_id))
  )
  and (status <> 'found' or owner_id = auth.uid())
);

drop policy "Owners and journey owners delete media" on public.media;
create policy "Owners and journey owners delete media" on public.media
for delete to authenticated using (
  owner_id = auth.uid()
  or (journey_id is not null and public.is_journey_owner(journey_id) and status <> 'found')
);

-- ---------------------------------------------------------------------------
-- mi5: bulk helpers skip foreign found rows
-- ---------------------------------------------------------------------------
-- The ids the caller may act on: p_ids without NULLs and without found rows of
-- other uploaders. NULL stays NULL, so the callers still reject a missing list.
create or replace function public.media_actionable_ids(p_ids uuid[])
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_ids is null then null else (
    select coalesce(array_agg(x.id), '{}')
      from (select distinct u as id from unnest(p_ids) u where u is not null) x
     where not exists (
       select 1 from public.media m
        where m.id = x.id and m.status = 'found' and m.owner_id is distinct from auth.uid()
     )) end;
$$;

revoke all on function public.media_actionable_ids(uuid[]) from public, anon, authenticated;

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
  v_foreign int;
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

  select count(*)::int,
         count(*) filter (where m.status = 'found' and m.owner_id is distinct from auth.uid())::int
    into v_found, v_foreign
    from public.media m where m.id = any (v_ids);
  if v_found <> cardinality(v_ids) then
    raise exception '%: media not found', p_fn using errcode = 'P0002';
  end if;
  -- Found rows of other uploaders are skipped, as if they were not in the list.
  if v_found = v_foreign then
    return null;
  end if;
  v_ids := public.media_actionable_ids(v_ids);

  select array_agg(distinct m.journey_id) into v_journeys
    from public.media m where m.id = any (v_ids);
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

revoke all on function public.media_batch_journey(uuid[], text) from public, anon, authenticated;

-- Make the callers act only on the actionable ids. The bodies are patched in place
-- (as 4f did for the purge functions) so they cannot drift from their latest
-- definitions: the first statement of every body narrows p_media_ids.
do $$
declare
  v_fn text;
  v_def text;
  v_new text;
begin
  foreach v_fn in array array[
    'public.trash_media(uuid[])',
    'public.restore_media(uuid[])',
    'public.claim_media_purge(uuid[])',
    'public.purge_media(uuid[])',
    'public.move_media(uuid[], uuid)',
    'public.create_moment_from_media(uuid[], uuid)',
    'public.mark_media_reviewed(uuid[], boolean)',
    'public.shift_media_time(uuid[], integer)',
    'public.set_media_location(uuid[], double precision, double precision)',
    'public.clear_media_location(uuid[])'
  ] loop
    v_def := pg_get_functiondef(v_fn::regprocedure);
    v_new := regexp_replace(v_def, E'\nbegin\n',
      E'\nbegin\n  p_media_ids := public.media_actionable_ids(p_media_ids);\n');
    if v_new = v_def then
      raise exception 'actionable-ids patch did not change %', v_fn;
    end if;
    execute v_new;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- mi1 + mi4: promote_found_media
--
-- p_items: jsonb array of {id, contentHash?, keep?}; contentHash = sha-256 hex,
-- keep = boolean. CLIENT CHUNK: at most 1000 items per call (hard cap 5000).
-- One result row per distinct id:
--   'promoted'          found + kept -> pending (content_hash set if given). With
--                       keep:true an undecided row is promoted and marked kept
--                       (reviewed_at = now()) in the same statement.
--   'already_promoted'  status is not found any more (idempotent re-run)
--   'not_kept'          still found but undecided (no keep flag), dismissed or
--                       claimed for purge
--   'duplicate'         the content hash is held by another row of the owner, by
--                       an earlier id of this call, or by a promote that committed
--                       first (race); the row stays found and UNCHANGED (also not
--                       marked kept); duplicate_of names the holder
-- duplicate_of is NULL for every outcome except 'duplicate'.
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
      or ((e.v ->> 'contentHash') is not null and (e.v ->> 'contentHash') !~ '^[a-f0-9]{64}$')
      or jsonb_typeof(e.v -> 'keep') not in ('boolean', 'null');
  if v_bad is not null then
    raise exception 'promote_found_media: invalid item %: every item needs an id, a valid contentHash and a boolean keep', v_bad
      using errcode = '22023';
  end if;
  select array_agg(x.id) into v_ids from jsonb_to_recordset(p_items) as x(id uuid);

  v_journey := public.found_media_batch_journey(v_ids, 'promote_found_media');
  if v_journey is null then
    return;
  end if;

  -- Plan, set-based and linear: classify every id once. The CTEs are MATERIALIZED on
  -- purpose: inlined, the planner re-ran the de-duplicated item list for every row.
  -- Duplicate ids with different hashes / keep flags: the smallest hash wins, keep
  -- wins over not keep (deterministic). duplicate_of = the smallest id among the
  -- committed holder and the earlier ids of this call (as the first version did).
  with items as materialized (
    select distinct on (x.id) x.id, x."contentHash" as h, coalesce(x.keep, false) as keep
      from jsonb_to_recordset(p_items) as x(id uuid, "contentHash" text, keep boolean)
     order by x.id, x."contentHash" nulls last, coalesce(x.keep, false) desc
  ),
  cand as materialized (
    select m.id, m.status, coalesce(m.content_hash, i.h) as eh,
           (m.status = 'found' and (m.reviewed_at is not null or i.keep)
            and m.deleted_at is null and m.purge_claimed_at is null) as eligible
      from public.media m join items i on i.id = m.id
     where m.journey_id = v_journey
  ),
  -- One pass, no joins between CTEs (their row estimates are 1, which made the
  -- planner pick nested loops: 25M comparisons for 5000 rows). Rows without a usable
  -- hash are singletons: they never share a partition, so they can never be the
  -- "holder" of an unrelated row.
  cls as materialized (
    select c.id, c.eh, c.status,
           case when not c.eligible then null
                when c.eh is null then 'promote'
                when h.holder is not null or c.rn > 1 then 'duplicate'
                else 'promote' end as k,
           case when c.eligible and c.grp is not null
                then least(h.holder, case when c.rn > 1 then c.first_id end)
           end as holder
      from (
        select c0.*,
               row_number() over (partition by coalesce(c0.grp, c0.id::text) order by c0.id) as rn,
               first_value(c0.id) over (partition by coalesce(c0.grp, c0.id::text) order by c0.id) as first_id
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
           'd', case when k.k = 'duplicate' then k.holder end)),
         array_agg(k.id) filter (where k.k = 'promote'),
         array_agg(k.eh) filter (where k.k = 'promote')
    into v_plan, v_promote_ids, v_promote_eh
    from cls k;

  if v_promote_ids is not null then
    perform set_config('app.media_found_transition', '1', true);
    begin
      update public.media m
         set status = 'pending', content_hash = p.eh,
             reviewed_at = coalesce(m.reviewed_at, now())
        from unnest(v_promote_ids, v_promote_eh) as p(id, eh)
       where m.id = p.id;
    exception
      when unique_violation then
        -- A concurrent promote took one of the hashes after our plan. The bulk
        -- statement is rolled back; redo it per item, a taken hash = 'duplicate'
        -- (the row is left exactly as it was, kept flag included).
        for v_i in 1 .. cardinality(v_promote_ids) loop
          begin
            update public.media
               set status = 'pending', content_hash = v_promote_eh[v_i],
                   reviewed_at = coalesce(reviewed_at, now())
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
         case when r.id is not null or p.o = 'duplicate' then coalesce(r.holder, p.d) end
    from jsonb_to_recordset(v_plan) as p(id uuid, o text, d uuid)
    left join unnest(v_raced_ids, v_raced_holders) as r(id, holder) on r.id = p.id
   order by p.id;
end;
$$;

revoke all on function public.promote_found_media(jsonb) from public, anon, authenticated;
grant execute on function public.promote_found_media(jsonb) to authenticated;
