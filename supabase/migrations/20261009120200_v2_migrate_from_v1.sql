-- One-off data migration v1 -> v2 (docs/plan-v2.md, chapter 4.3 and phase 1).
--
-- These functions are only DEFINED here. They run manually at the switchover
-- (service role / postgres), never automatically on deploy:
--
--   select public.v2_migrate_from_v1();          -- idempotent, returns counts
--   select * from public.v2_verify_migration();  -- every row must be ok
--
-- Mapping:
--   journey_stages              -> segments (kind = stage)
--   entries linked to a journey -> moments (same id), media grouped by moment
--   entries outside journeys    -> posts (tip -> tip, others -> article)
--   journey_guide_sections      -> posts (tip, linked to the journey)
--   photos / photo_variants     -> media / media_variants (same ids, same keys)
--   stops used by entries   -> places (same id)
--   journey_photo_tags          -> tags (free) + taggings on media
-- Not migrated (frozen, see plan chapter 9): stops without entries, checklists,
-- translations, nature observations; hearts/comments move in phase 5.

create or replace function public.v2_map_variant_kind(p_variant text)
returns public.media_variant_kind
language sql
immutable
set search_path = ''
as $$
  select case p_variant
    when 'thumb' then 'thumb'::public.media_variant_kind
    when 'small' then 'small'::public.media_variant_kind
    -- v1 'preview' holds the full-resolution upload (same bytes as 'full').
    when 'preview' then 'large'::public.media_variant_kind
    when 'medium' then 'medium'::public.media_variant_kind
    when 'full' then 'large'::public.media_variant_kind
    when 'large' then 'large'::public.media_variant_kind
    when 'video' then 'video'::public.media_variant_kind
  end
$$;

-- Lower wins when two v1 variants map to the same v2 kind.
create or replace function public.v2_variant_priority(p_variant text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_variant
    when 'full' then 0
    when 'large' then 1
    when 'preview' then 2
    else 0
  end
$$;

create or replace function public.v2_migrate_from_v1()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_counts jsonb := '{}'::jsonb;
  v_rows bigint;
begin
  -- 1. Places from stops that carry real memories (used by an entry). Bare
  --    map markers are skipped: in v2 places are derived from media.
  insert into public.places (id, name, latitude, longitude, geocode_source, created_at)
  select st.id, st.title, st.latitude, st.longitude, 'v1-stop', st.created_at
  from public.journey_stops st
  where st.latitude is not null
    and char_length(st.title) between 1 and 200
    and exists (select 1 from public.entry_journey_links l where l.stop_id = st.id)
  on conflict (id) do nothing;
  get diagnostics v_rows = row_count;
  v_counts := v_counts || jsonb_build_object('places', v_rows);

  -- 2. Media from photos. A photo used by several entries follows the first
  --    journey-linked entry; otherwise it stays outside any journey.
  insert into public.media (
    id, owner_id, journey_id, kind, status, captured_at, latitude, longitude,
    width, height, duration_ms, caption, focal_x, focal_y, created_at
  )
  select
    p.id,
    p.creator_id,
    link.journey_id,
    case when p.media_type = 'video' then 'video'::public.media_kind else 'photo'::public.media_kind end,
    case when best.width is null then 'failed'::public.media_status else 'ready'::public.media_status end,
    p.captured_at,
    p.latitude,
    p.longitude,
    best.width,
    best.height,
    case when p.media_type = 'video' then p.duration_ms end,
    left(link.caption, 2000),
    case when link.focal_x is not null and link.focal_y is not null then link.focal_x end,
    case when link.focal_x is not null and link.focal_y is not null then link.focal_y end,
    p.created_at
  from public.photos p
  left join lateral (
    select ep.entry_id, ep.caption, ep.focal_x, ep.focal_y, l.journey_id
    from public.entry_photos ep
    left join public.entry_journey_links l on l.entry_id = ep.entry_id
    where ep.photo_id = p.id
    order by (l.journey_id is null), ep.created_at, ep.entry_id
    limit 1
  ) link on true
  left join lateral (
    select pv.width, pv.height
    from public.photo_variants pv
    where pv.photo_id = p.id and pv.variant::text <> 'video'
    order by pv.width desc
    limit 1
  ) best on true
  on conflict (id) do nothing;
  get diagnostics v_rows = row_count;
  v_counts := v_counts || jsonb_build_object('media', v_rows);

  -- 3. Variants keep their storage keys (files are copied to R2 as-is).
  insert into public.media_variants (
    media_id, kind, storage_key, mime_type, width, height, byte_size, created_at
  )
  select distinct on (pv.photo_id, public.v2_map_variant_kind(pv.variant::text))
    pv.photo_id,
    public.v2_map_variant_kind(pv.variant::text),
    pv.storage_path,
    pv.mime_type,
    pv.width,
    pv.height,
    pv.byte_size,
    pv.created_at
  from public.photo_variants pv
  where public.v2_map_variant_kind(pv.variant::text) is not null
  order by pv.photo_id, public.v2_map_variant_kind(pv.variant::text),
    public.v2_variant_priority(pv.variant::text), pv.width desc
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  v_counts := v_counts || jsonb_build_object('media_variants', v_rows);

  -- 4. Moments from journey-linked entries; time comes from their photos,
  --    not from the moment the entry was written.
  insert into public.moments (
    id, journey_id, starts_at, ends_at, latitude, longitude, place_id, title,
    body, origin, locked, published, created_by, created_at
  )
  select
    e.id,
    l.journey_id,
    coalesce(span.first_at, e.event_at, e.created_at),
    greatest(
      coalesce(span.last_at, span.first_at, e.event_at, e.created_at),
      coalesce(span.first_at, e.event_at, e.created_at)
    ),
    coalesce(e.latitude, st.latitude, span.avg_lat),
    coalesce(e.longitude, st.longitude, span.avg_lng),
    pl.id,
    case when char_length(e.title) between 1 and 160 then e.title end,
    left(e.body, 100000),
    'manual',
    true,
    e.status = 'published' and e.visibility = 'public',
    e.creator_id,
    e.created_at
  from public.entries e
  join public.entry_journey_links l on l.entry_id = e.id
  left join public.journey_stops st on st.id = l.stop_id and st.latitude is not null
  left join public.places pl on pl.id = l.stop_id
  left join lateral (
    select
      min(p.captured_at) as first_at,
      max(p.captured_at) as last_at,
      avg(p.latitude) as avg_lat,
      avg(p.longitude) as avg_lng
    from public.entry_photos ep
    join public.photos p on p.id = ep.photo_id
    where ep.entry_id = e.id
  ) span on true
  on conflict (id) do nothing;
  get diagnostics v_rows = row_count;
  v_counts := v_counts || jsonb_build_object('moments', v_rows);

  update public.media m
  set moment_id = ep.entry_id
  from public.entry_photos ep
  join public.moments mo on mo.id = ep.entry_id
  where ep.photo_id = m.id
    and m.moment_id is null
    and m.journey_id = mo.journey_id;

  update public.moments mo
  set cover_media_id = ep.photo_id
  from public.entry_photos ep
  join public.media m on m.id = ep.photo_id
  where ep.entry_id = mo.id
    and ep.is_cover
    and m.journey_id = mo.journey_id
    and mo.cover_media_id is null;

  -- 5. Stages -> segments. Undated stages take the span of their moments.
  insert into public.segments (
    id, journey_id, kind, title, body, starts_at, ends_at, position, origin,
    created_by, created_at
  )
  select
    s.id,
    s.journey_id,
    'stage',
    left(s.title, 160),
    s.summary,
    range.starts_at,
    greatest(range.ends_at, range.starts_at + interval '1 second'),
    s.position,
    'manual',
    s.creator_id,
    s.created_at
  from public.journey_stages s
  join public.journeys j on j.id = s.journey_id
  cross join lateral (
    select
      coalesce(
        s.starts_at::timestamp at time zone coalesce(j.home_tz, 'UTC'),
        (select min(mo.starts_at) from public.moments mo
          join public.entry_journey_links l on l.entry_id = mo.id
          where l.stage_id = s.id),
        j.starts_at::timestamp at time zone coalesce(j.home_tz, 'UTC'),
        s.created_at
      ) as starts_at,
      coalesce(
        (s.ends_at + 1)::timestamp at time zone coalesce(j.home_tz, 'UTC'),
        (select max(mo.ends_at) + interval '1 second' from public.moments mo
          join public.entry_journey_links l on l.entry_id = mo.id
          where l.stage_id = s.id),
        coalesce(
          s.starts_at::timestamp at time zone coalesce(j.home_tz, 'UTC'),
          s.created_at
        ) + interval '1 day'
      ) as ends_at
  ) range
  where char_length(s.title) >= 1
  on conflict (id) do nothing;
  get diagnostics v_rows = row_count;
  v_counts := v_counts || jsonb_build_object('segments', v_rows);

  -- Keep explicit v1 stage assignments where time alone would place media elsewhere.
  update public.media m
  set segment_override_id = l.stage_id
  from public.entry_journey_links l
  join public.segments sg on sg.id = l.stage_id
  where m.moment_id = l.entry_id
    and m.segment_override_id is null
    and m.journey_id = sg.journey_id
    and (m.captured_at is null or m.captured_at < sg.starts_at or m.captured_at >= sg.ends_at);

  -- 6. Entries outside journeys -> posts in their (or the author's personal) space.
  insert into public.posts (
    id, author_id, space_id, kind, title, body, slug, visibility, published_at,
    created_at
  )
  select
    e.id,
    e.creator_id,
    coalesce(e.space_id, ps.id),
    case when e.type = 'tip' then 'tip'::public.post_kind else 'article'::public.post_kind end,
    coalesce(
      case when char_length(e.title) between 1 and 160 then e.title end,
      nullif(left(split_part(e.body, E'\n', 1), 160), ''),
      'Bez názvu'
    ),
    left(e.body, 100000),
    case when e.slug ~ '^[a-z0-9][a-z0-9-]{0,79}$' then e.slug end,
    case when e.visibility = 'public' and e.status = 'published'
      then 'public'::public.journey_visibility
      else 'private'::public.journey_visibility end,
    e.published_at,
    e.created_at
  from public.entries e
  left join public.spaces ps on ps.personal_owner_id = e.creator_id
  where not exists (select 1 from public.entry_journey_links l where l.entry_id = e.id)
    and coalesce(e.space_id, ps.id) is not null
  on conflict (id) do nothing;
  get diagnostics v_rows = row_count;
  v_counts := v_counts || jsonb_build_object('posts_from_entries', v_rows);

  insert into public.post_media (post_id, media_id, position)
  select ep.entry_id, ep.photo_id, ep.position
  from public.entry_photos ep
  join public.posts po on po.id = ep.entry_id
  join public.media m on m.id = ep.photo_id
  on conflict do nothing;

  -- 7. Journey guide sections -> tips linked to the journey.
  insert into public.posts (
    id, author_id, space_id, kind, title, body, visibility, journey_id,
    published_at, created_at
  )
  select
    g.id,
    g.creator_id,
    coalesce(j.space_id, ps.id),
    'tip',
    left(g.title, 160),
    left(g.body, 100000),
    j.visibility,
    j.id,
    case when j.visibility = 'public' then g.created_at end,
    g.created_at
  from public.journey_guide_sections g
  join public.journeys j on j.id = g.journey_id
  left join public.spaces ps on ps.personal_owner_id = g.creator_id
  where coalesce(j.space_id, ps.id) is not null
    and char_length(g.title) >= 1
  on conflict (id) do nothing;
  get diagnostics v_rows = row_count;
  v_counts := v_counts || jsonb_build_object('posts_from_guides', v_rows);

  -- 8. Journey photo tags -> global free tags + media taggings.
  insert into public.tags (kind, slug, label, created_at)
  select distinct on (left(t.slug, 80))
    'free', left(t.slug, 80), left(t.label, 120), t.created_at
  from public.journey_photo_tags t
  where left(t.slug, 80) ~ '^[a-z0-9][a-z0-9-]{0,79}$'
  order by left(t.slug, 80), t.created_at
  on conflict (kind, slug) do nothing;

  insert into public.taggings (tag_id, target_type, target_id, created_by, created_at)
  select tg.id, 'media', a.photo_id, a.creator_id, a.created_at
  from public.photo_tag_assignments a
  join public.journey_photo_tags t on t.id = a.tag_id
  join public.tags tg on tg.kind = 'free' and tg.slug = left(t.slug, 80)
  join public.media m on m.id = a.photo_id
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  v_counts := v_counts || jsonb_build_object('taggings', v_rows);

  -- Frozen / deferred data, reported so nothing disappears silently.
  v_counts := v_counts || jsonb_build_object(
    'skipped_stops', (
      select count(*) from public.journey_stops st
      where not exists (select 1 from public.places p where p.id = st.id)
    ),
    'frozen_checklist_items', (select count(*) from public.journey_checklist_items),
    'frozen_translations', (select count(*) from public.entry_translations),
    'frozen_nature_observations', (select count(*) from public.nature_observations),
    'deferred_hearts', (select count(*) from public.content_hearts),
    'deferred_comments', (select count(*) from public.content_comments),
    -- Same owner, capture time and position: most likely the same photo
    -- uploaded twice into different v1 entries. Kept; deduplicate in the UI.
    'possible_duplicate_media', (
      select count(*) from (
        select 1 from public.media m
        where m.captured_at is not null
        group by m.owner_id, m.captured_at, m.latitude, m.longitude
        having count(*) > 1
      ) d
    )
  );

  return v_counts;
end
$$;

create or replace function public.v2_verify_migration()
returns table (check_name text, expected bigint, actual bigint, ok boolean)
language sql
stable
set search_path = ''
as $$
  with checks (check_name, expected, actual) as (
    select 'photos -> media',
      (select count(*) from public.photos),
      (select count(*) from public.media m where exists (
        select 1 from public.photos p where p.id = m.id))
    union all
    select 'photo variants -> media variants',
      (select count(*) from (
        select distinct pv.photo_id, public.v2_map_variant_kind(pv.variant::text)
        from public.photo_variants pv
        where public.v2_map_variant_kind(pv.variant::text) is not null) x),
      (select count(*) from public.media_variants mv where exists (
        select 1 from public.photos p where p.id = mv.media_id))
    union all
    select 'journey entries -> moments',
      (select count(*) from public.entry_journey_links),
      (select count(*) from public.moments mo where exists (
        select 1 from public.entry_journey_links l where l.entry_id = mo.id))
    union all
    select 'journey entry photos grouped in moments',
      (select count(distinct ep.photo_id) from public.entry_photos ep
        join public.entry_journey_links l on l.entry_id = ep.entry_id),
      (select count(*) from public.media m where m.moment_id is not null)
    union all
    select 'standalone entries -> posts',
      (select count(*) from public.entries e
        where not exists (select 1 from public.entry_journey_links l where l.entry_id = e.id)),
      (select count(*) from public.posts po where exists (
        select 1 from public.entries e where e.id = po.id))
    union all
    select 'guide sections -> posts',
      (select count(*) from public.journey_guide_sections),
      (select count(*) from public.posts po where exists (
        select 1 from public.journey_guide_sections g where g.id = po.id))
    union all
    select 'stages -> segments',
      (select count(*) from public.journey_stages),
      (select count(*) from public.segments sg where exists (
        select 1 from public.journey_stages s where s.id = sg.id))
    union all
    select 'photo tag assignments -> taggings',
      (select count(*) from (
        select distinct left(t.slug, 80), a.photo_id
        from public.photo_tag_assignments a
        join public.journey_photo_tags t on t.id = a.tag_id) x),
      (select count(*) from public.taggings where target_type = 'media')
    union all
    select 'ready media without variants',
      0::bigint,
      (select count(*) from public.media m
        where m.status = 'ready'
          and not exists (select 1 from public.media_variants v where v.media_id = m.id))
  )
  select check_name, expected, actual, expected = actual
  from checks
$$;

revoke all on function public.v2_map_variant_kind(text) from public, anon, authenticated;
revoke all on function public.v2_variant_priority(text) from public, anon, authenticated;
revoke all on function public.v2_migrate_from_v1() from public, anon, authenticated;
revoke all on function public.v2_verify_migration() from public, anon, authenticated;
