-- Trip Diary v2 core schema (docs/plan-v2.md, chapter 4).
--
-- Journey -> segments (stage | trip) -> moments -> media. Media belong to a
-- journey directly; moments and segments are time ranges above them.
-- v1 tables stay untouched until the switchover (docs/plan-v2.md, phase 4).
--
-- Access model:
--   * journey members (any role) read journey content,
--   * owners/editors (public.can_edit_journey) write it,
--   * anon has no direct table access; public pages read through
--     public.get_public_journey (separate migration).

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.segment_kind as enum ('stage', 'trip');
create type public.trip_type as enum ('trek', 'day', 'transfer', 'stay');
create type public.content_origin as enum ('manual', 'suggested', 'accepted', 'auto');
create type public.media_kind as enum ('photo', 'video');
create type public.media_status as enum ('pending', 'uploading', 'ready', 'failed');
create type public.media_variant_kind as enum (
  'thumb', 'small', 'medium', 'large', 'video', 'poster'
);
create type public.post_kind as enum ('tip', 'article');
create type public.tag_kind as enum ('category', 'free', 'species');
create type public.tagging_target as enum ('media', 'moment', 'post');

-- IANA zone names such as "America/Edmonton" or "UTC". Existence is checked by
-- clients; the database only guards the shape.
create or replace function public.is_time_zone_name(p_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is not null
    and char_length(p_value) between 1 and 64
    and p_value ~ '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+)*$'
$$;

-- ---------------------------------------------------------------------------
-- Journey access helpers
-- ---------------------------------------------------------------------------

create or replace function public.can_edit_journey(p_journey_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.journey_members
    where journey_id = p_journey_id
      and user_id = auth.uid()
      and role in ('owner'::public.journey_member_role, 'editor'::public.journey_member_role)
  )
$$;

revoke all on function public.can_edit_journey(uuid) from public, anon, authenticated;
grant execute on function public.can_edit_journey(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Journeys (extended)
-- ---------------------------------------------------------------------------

alter table public.journeys
  add column home_tz text,
  add column cover_media_id uuid,
  add constraint journeys_home_tz_check check (
    home_tz is null or public.is_time_zone_name(home_tz)
  );

-- ---------------------------------------------------------------------------
-- Places (global, shared across journeys; written by server-side geocoding)
-- ---------------------------------------------------------------------------

create table public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country_code text,
  region text,
  latitude double precision not null,
  longitude double precision not null,
  geocode_source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint places_name_length_check check (char_length(name) between 1 and 200),
  constraint places_country_code_check check (
    country_code is null or country_code ~ '^[A-Z]{2}$'
  ),
  constraint places_region_length_check check (
    region is null or char_length(region) <= 200
  ),
  constraint places_latitude_check check (latitude between -90 and 90),
  constraint places_longitude_check check (longitude between -180 and 180),
  constraint places_geocode_source_check check (char_length(geocode_source) between 1 and 40)
);

create index places_lat_lng_idx on public.places (latitude, longitude);

-- ---------------------------------------------------------------------------
-- Segments: stages (weeks/months) and trips (hours/days, may nest)
-- ---------------------------------------------------------------------------

create table public.segments (
  id uuid primary key,
  journey_id uuid not null references public.journeys (id) on delete cascade,
  parent_id uuid,
  kind public.segment_kind not null,
  trip_type public.trip_type,
  title text not null,
  body text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  tz text,
  cover_media_id uuid,
  position integer not null default 0,
  origin public.content_origin not null default 'manual',
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint segments_id_journey_unique unique (id, journey_id),
  constraint segments_parent_fk
    foreign key (parent_id, journey_id)
    references public.segments (id, journey_id)
    on delete set null (parent_id),
  constraint segments_parent_not_self_check check (parent_id is distinct from id),
  constraint segments_kind_shape_check check (
    (kind = 'stage' and trip_type is null and parent_id is null)
    or (kind = 'trip' and trip_type is not null)
  ),
  constraint segments_origin_check check (origin in ('manual', 'suggested', 'accepted')),
  constraint segments_range_check check (ends_at > starts_at),
  constraint segments_title_length_check check (char_length(title) between 1 and 160),
  constraint segments_body_length_check check (char_length(body) <= 100000),
  constraint segments_tz_check check (tz is null or public.is_time_zone_name(tz)),
  constraint segments_position_check check (position >= 0)
);

create index segments_journey_time_idx on public.segments (journey_id, starts_at);
create index segments_parent_idx on public.segments (parent_id) where parent_id is not null;

-- ---------------------------------------------------------------------------
-- Moments: automatic (or manual) clusters of media in time and space
-- ---------------------------------------------------------------------------

create table public.moments (
  id uuid primary key,
  journey_id uuid not null references public.journeys (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  latitude double precision,
  longitude double precision,
  place_id uuid references public.places (id) on delete set null,
  title text,
  body text not null default '',
  cover_media_id uuid,
  origin public.content_origin not null default 'auto',
  locked boolean not null default false,
  published boolean not null default true,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint moments_id_journey_unique unique (id, journey_id),
  constraint moments_origin_check check (origin in ('auto', 'manual')),
  constraint moments_range_check check (ends_at >= starts_at),
  constraint moments_title_length_check check (
    title is null or char_length(title) between 1 and 160
  ),
  constraint moments_body_length_check check (char_length(body) <= 100000),
  constraint moments_coordinates_pair_check check (
    (latitude is null and longitude is null)
    or (latitude is not null and longitude is not null)
  ),
  constraint moments_latitude_check check (latitude is null or latitude between -90 and 90),
  constraint moments_longitude_check check (longitude is null or longitude between -180 and 180)
);

create index moments_journey_time_idx on public.moments (journey_id, starts_at);

-- ---------------------------------------------------------------------------
-- Media: photos and videos; the primary building block
-- ---------------------------------------------------------------------------

create table public.media (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  journey_id uuid references public.journeys (id) on delete set null,
  kind public.media_kind not null default 'photo',
  status public.media_status not null default 'pending',
  captured_at timestamptz,
  captured_tz text,
  latitude double precision,
  longitude double precision,
  altitude double precision,
  hide_location boolean not null default false,
  width integer,
  height integer,
  duration_ms integer,
  source_asset_id text,
  content_hash text,
  starred boolean not null default false,
  caption text,
  focal_x double precision,
  focal_y double precision,
  moment_id uuid,
  segment_override_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint media_moment_fk
    foreign key (moment_id, journey_id)
    references public.moments (id, journey_id)
    on delete set null (moment_id),
  constraint media_segment_override_fk
    foreign key (segment_override_id, journey_id)
    references public.segments (id, journey_id)
    on delete set null (segment_override_id),
  constraint media_grouping_needs_journey_check check (
    journey_id is not null or (moment_id is null and segment_override_id is null)
  ),
  constraint media_captured_tz_check check (
    captured_tz is null or public.is_time_zone_name(captured_tz)
  ),
  constraint media_coordinates_pair_check check (
    (latitude is null and longitude is null)
    or (latitude is not null and longitude is not null)
  ),
  constraint media_latitude_check check (latitude is null or latitude between -90 and 90),
  constraint media_longitude_check check (longitude is null or longitude between -180 and 180),
  constraint media_dimensions_check check (
    (width is null and height is null) or (width > 0 and height > 0)
  ),
  constraint media_duration_check check (
    (kind = 'photo' and duration_ms is null)
    or (kind = 'video' and (duration_ms is null or duration_ms > 0))
  ),
  constraint media_caption_length_check check (caption is null or char_length(caption) <= 2000),
  constraint media_focal_check check (
    (focal_x is null and focal_y is null)
    or (focal_x between 0 and 1 and focal_y between 0 and 1)
  ),
  constraint media_source_asset_length_check check (
    source_asset_id is null or char_length(source_asset_id) between 1 and 255
  ),
  constraint media_content_hash_check check (
    content_hash is null or content_hash ~ '^[a-f0-9]{64}$'
  )
);

create index media_journey_time_idx on public.media (journey_id, captured_at)
  where journey_id is not null;
create index media_owner_time_idx on public.media (owner_id, captured_at);
create index media_moment_idx on public.media (moment_id) where moment_id is not null;
create unique index media_owner_source_asset_unique_idx
  on public.media (owner_id, source_asset_id) where source_asset_id is not null;
create unique index media_owner_content_hash_unique_idx
  on public.media (owner_id, content_hash) where content_hash is not null;

create table public.media_variants (
  media_id uuid not null references public.media (id) on delete cascade,
  kind public.media_variant_kind not null,
  storage_key text not null,
  mime_type text not null,
  width integer not null,
  height integer not null,
  byte_size bigint not null,
  created_at timestamptz not null default now(),

  primary key (media_id, kind),
  constraint media_variants_storage_key_unique unique (storage_key),
  constraint media_variants_storage_key_check check (
    char_length(storage_key) between 1 and 512 and storage_key !~ '(^/|\.\.)'
  ),
  constraint media_variants_mime_check check (
    mime_type in ('image/webp', 'image/jpeg', 'video/mp4')
  ),
  constraint media_variants_kind_mime_check check (
    (kind = 'video' and mime_type = 'video/mp4')
    or (kind <> 'video' and mime_type in ('image/webp', 'image/jpeg'))
  ),
  constraint media_variants_dimensions_check check (width > 0 and height > 0),
  constraint media_variants_byte_size_check check (byte_size > 0)
);

-- Deleting a journey keeps its media (they live in the owner's library) but
-- detaches them first. Without this the FK actions would set media.journey_id
-- to null while moment_id still points at a not-yet-deleted moment.
create or replace function public.detach_media_before_journey_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.media
  set journey_id = null, moment_id = null, segment_override_id = null
  where journey_id = old.id;
  return old;
end
$$;

revoke all on function public.detach_media_before_journey_delete() from public, anon, authenticated;

create trigger detach_media_before_journey_delete
before delete on public.journeys
for each row execute function public.detach_media_before_journey_delete();

-- Covers point at media of the same journey; enforced by FK + trigger below.
alter table public.journeys
  add constraint journeys_cover_media_fk
  foreign key (cover_media_id) references public.media (id) on delete set null;
alter table public.segments
  add constraint segments_cover_media_fk
  foreign key (cover_media_id) references public.media (id) on delete set null;
alter table public.moments
  add constraint moments_cover_media_fk
  foreign key (cover_media_id) references public.media (id) on delete set null;

create or replace function public.enforce_cover_media_journey()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_journey_id uuid;
begin
  if new.cover_media_id is null then
    return new;
  end if;

  -- journeys has no journey_id column; read it generically for the others.
  if tg_table_name = 'journeys' then
    v_journey_id := new.id;
  else
    v_journey_id := (to_jsonb(new) ->> 'journey_id')::uuid;
  end if;

  if not exists (
    select 1 from public.media
    where id = new.cover_media_id and journey_id = v_journey_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'cover media must belong to the same journey';
  end if;
  return new;
end
$$;

revoke all on function public.enforce_cover_media_journey() from public, anon, authenticated;

create trigger journeys_cover_media_journey
before insert or update of cover_media_id on public.journeys
for each row execute function public.enforce_cover_media_journey();
create trigger segments_cover_media_journey
before insert or update of cover_media_id on public.segments
for each row execute function public.enforce_cover_media_journey();
create trigger moments_cover_media_journey
before insert or update of cover_media_id on public.moments
for each row execute function public.enforce_cover_media_journey();

-- ---------------------------------------------------------------------------
-- Tracks: one route per segment (GPX import or derived from media)
-- ---------------------------------------------------------------------------

create table public.tracks (
  id uuid primary key,
  journey_id uuid not null,
  segment_id uuid not null,
  source text not null,
  geojson jsonb not null,
  distance_m integer,
  ascent_m integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tracks_segment_fk
    foreign key (segment_id, journey_id)
    references public.segments (id, journey_id)
    on delete cascade,
  constraint tracks_segment_unique unique (segment_id),
  constraint tracks_source_check check (source in ('gpx', 'derived')),
  constraint tracks_geojson_check check (
    geojson ->> 'type' = 'LineString'
    and jsonb_typeof(geojson -> 'coordinates') = 'array'
  ),
  constraint tracks_distance_check check (distance_m is null or distance_m >= 0),
  constraint tracks_ascent_check check (ascent_m is null or ascent_m >= 0)
);

-- ---------------------------------------------------------------------------
-- Posts: tips and articles, optionally linked to a journey, segment or place
-- ---------------------------------------------------------------------------

create table public.posts (
  id uuid primary key,
  author_id uuid not null references auth.users (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete restrict,
  kind public.post_kind not null default 'tip',
  title text not null,
  body text not null default '',
  slug text,
  visibility public.journey_visibility not null default 'private',
  journey_id uuid references public.journeys (id) on delete set null,
  segment_id uuid references public.segments (id) on delete set null,
  place_id uuid references public.places (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint posts_title_length_check check (char_length(title) between 1 and 160),
  constraint posts_body_length_check check (char_length(body) <= 100000),
  constraint posts_slug_check check (
    slug is null or slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'
  ),
  constraint posts_segment_needs_journey_check check (
    segment_id is null or journey_id is not null
  )
);

create unique index posts_space_slug_unique_idx on public.posts (space_id, slug)
  where slug is not null;
create index posts_space_idx on public.posts (space_id, published_at desc);
create index posts_journey_idx on public.posts (journey_id) where journey_id is not null;

create table public.post_media (
  post_id uuid not null references public.posts (id) on delete cascade,
  media_id uuid not null references public.media (id) on delete cascade,
  position integer not null,
  primary key (post_id, media_id),
  constraint post_media_position_unique unique (post_id, position),
  constraint post_media_position_check check (position >= 0)
);

-- ---------------------------------------------------------------------------
-- Tags (global) and taggings
-- ---------------------------------------------------------------------------

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  kind public.tag_kind not null,
  slug text not null,
  label text not null,
  parent_id uuid references public.tags (id) on delete set null,
  gbif_taxon_id bigint,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint tags_kind_slug_unique unique (kind, slug),
  constraint tags_slug_check check (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  constraint tags_label_length_check check (char_length(label) between 1 and 120),
  constraint tags_species_taxon_check check (
    (kind = 'species' and gbif_taxon_id is not null)
    or (kind <> 'species' and gbif_taxon_id is null)
  )
);

-- Fixed categories; UI translates them by slug.
insert into public.tags (kind, slug, label) values
  ('category', 'fauna', 'Fauna'),
  ('category', 'flora', 'Flóra'),
  ('category', 'landscape', 'Krajina'),
  ('category', 'people', 'Lidé'),
  ('category', 'food', 'Jídlo'),
  ('category', 'stay', 'Ubytování'),
  ('category', 'transport', 'Doprava');

create table public.taggings (
  tag_id uuid not null references public.tags (id) on delete cascade,
  target_type public.tagging_target not null,
  target_id uuid not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tag_id, target_type, target_id)
);

create index taggings_target_idx on public.taggings (target_type, target_id);

create or replace function public.can_read_tagging_target(
  p_target_type public.tagging_target,
  p_target_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_target_type
    when 'media' then exists (
      select 1 from public.media m
      where m.id = p_target_id
        and (m.owner_id = auth.uid()
          or (m.journey_id is not null and public.is_journey_member(m.journey_id)))
    )
    when 'moment' then exists (
      select 1 from public.moments mo
      where mo.id = p_target_id and public.is_journey_member(mo.journey_id)
    )
    when 'post' then exists (
      select 1 from public.posts p
      where p.id = p_target_id
        and (p.author_id = auth.uid() or public.is_space_member(p.space_id))
    )
  end
$$;

create or replace function public.can_edit_tagging_target(
  p_target_type public.tagging_target,
  p_target_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_target_type
    when 'media' then exists (
      select 1 from public.media m
      where m.id = p_target_id
        and (m.owner_id = auth.uid()
          or (m.journey_id is not null and public.can_edit_journey(m.journey_id)))
    )
    when 'moment' then exists (
      select 1 from public.moments mo
      where mo.id = p_target_id and public.can_edit_journey(mo.journey_id)
    )
    when 'post' then exists (
      select 1 from public.posts p
      where p.id = p_target_id and p.author_id = auth.uid()
    )
  end
$$;

revoke all on function public.can_read_tagging_target(public.tagging_target, uuid)
  from public, anon, authenticated;
revoke all on function public.can_edit_tagging_target(public.tagging_target, uuid)
  from public, anon, authenticated;
grant execute on function public.can_read_tagging_target(public.tagging_target, uuid)
  to authenticated;
grant execute on function public.can_edit_tagging_target(public.tagging_target, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger set_places_updated_at before update on public.places
for each row execute function public.set_updated_at();
create trigger set_segments_updated_at before update on public.segments
for each row execute function public.set_updated_at();
create trigger set_moments_updated_at before update on public.moments
for each row execute function public.set_updated_at();
create trigger set_media_updated_at before update on public.media
for each row execute function public.set_updated_at();
create trigger set_tracks_updated_at before update on public.tracks
for each row execute function public.set_updated_at();
create trigger set_posts_updated_at before update on public.posts
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.places enable row level security;
alter table public.segments enable row level security;
alter table public.moments enable row level security;
alter table public.media enable row level security;
alter table public.media_variants enable row level security;
alter table public.tracks enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.tags enable row level security;
alter table public.taggings enable row level security;

create policy "Signed-in users read places" on public.places
for select to authenticated using (true);

create policy "Journey members read segments" on public.segments
for select to authenticated using (public.is_journey_member(journey_id));
create policy "Journey editors insert segments" on public.segments
for insert to authenticated
with check (created_by = auth.uid() and public.can_edit_journey(journey_id));
create policy "Journey editors update segments" on public.segments
for update to authenticated
using (public.can_edit_journey(journey_id))
with check (public.can_edit_journey(journey_id));
create policy "Journey editors delete segments" on public.segments
for delete to authenticated using (public.can_edit_journey(journey_id));

create policy "Journey members read moments" on public.moments
for select to authenticated using (public.is_journey_member(journey_id));
create policy "Journey editors insert moments" on public.moments
for insert to authenticated
with check (created_by = auth.uid() and public.can_edit_journey(journey_id));
create policy "Journey editors update moments" on public.moments
for update to authenticated
using (public.can_edit_journey(journey_id))
with check (public.can_edit_journey(journey_id));
create policy "Journey editors delete moments" on public.moments
for delete to authenticated using (public.can_edit_journey(journey_id));

create policy "Owners and journey members read media" on public.media
for select to authenticated using (
  owner_id = auth.uid()
  or (journey_id is not null and public.is_journey_member(journey_id))
);
create policy "Owners insert media" on public.media
for insert to authenticated with check (
  owner_id = auth.uid()
  and (journey_id is null or public.can_edit_journey(journey_id))
);
create policy "Owners and journey editors update media" on public.media
for update to authenticated
using (
  owner_id = auth.uid()
  or (journey_id is not null and public.can_edit_journey(journey_id))
)
with check (
  (journey_id is null and owner_id = auth.uid())
  or (journey_id is not null and public.can_edit_journey(journey_id))
);
create policy "Owners and journey owners delete media" on public.media
for delete to authenticated using (
  owner_id = auth.uid()
  or (journey_id is not null and public.is_journey_owner(journey_id))
);

create policy "Readers of media read variants" on public.media_variants
for select to authenticated using (
  exists (select 1 from public.media m where m.id = media_id)
);
create policy "Media owners write variants" on public.media_variants
for insert to authenticated with check (
  exists (select 1 from public.media m where m.id = media_id and m.owner_id = auth.uid())
  and split_part(storage_key, '/', 1) = auth.uid()::text
  and split_part(storage_key, '/', 2) = media_id::text
);
create policy "Media owners delete variants" on public.media_variants
for delete to authenticated using (
  exists (select 1 from public.media m where m.id = media_id and m.owner_id = auth.uid())
);

create policy "Journey members read tracks" on public.tracks
for select to authenticated using (public.is_journey_member(journey_id));
create policy "Journey editors write tracks" on public.tracks
for all to authenticated
using (public.can_edit_journey(journey_id))
with check (public.can_edit_journey(journey_id));

create policy "Authors and space members read posts" on public.posts
for select to authenticated using (
  author_id = auth.uid() or public.is_space_member(space_id)
);
create policy "Publishers insert posts" on public.posts
for insert to authenticated with check (
  author_id = auth.uid()
  and public.has_space_publish_role(space_id)
  and (journey_id is null or public.is_journey_member(journey_id))
);
create policy "Authors update posts" on public.posts
for update to authenticated
using (author_id = auth.uid())
with check (
  author_id = auth.uid()
  and public.has_space_publish_role(space_id)
  and (journey_id is null or public.is_journey_member(journey_id))
);
create policy "Authors delete posts" on public.posts
for delete to authenticated using (author_id = auth.uid());

create policy "Readers of posts read post media" on public.post_media
for select to authenticated using (
  exists (select 1 from public.posts p where p.id = post_id)
);
create policy "Authors manage post media" on public.post_media
for all to authenticated
using (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()))
with check (
  exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
  and exists (select 1 from public.media m where m.id = media_id and m.owner_id = auth.uid())
);

create policy "Signed-in users read tags" on public.tags
for select to authenticated using (true);
create policy "Signed-in users create free and species tags" on public.tags
for insert to authenticated with check (
  created_by = auth.uid() and kind in ('free', 'species')
);

create policy "Readers of targets read taggings" on public.taggings
for select to authenticated using (
  public.can_read_tagging_target(target_type, target_id)
);
create policy "Editors of targets add taggings" on public.taggings
for insert to authenticated with check (
  created_by = auth.uid() and public.can_edit_tagging_target(target_type, target_id)
);
create policy "Editors of targets remove taggings" on public.taggings
for delete to authenticated using (
  public.can_edit_tagging_target(target_type, target_id)
);

-- ---------------------------------------------------------------------------
-- Grants (column level for writes; anon gets nothing)
-- ---------------------------------------------------------------------------

revoke all on table public.places, public.segments, public.moments, public.media,
  public.media_variants, public.tracks, public.posts, public.post_media,
  public.tags, public.taggings
  from public, anon, authenticated;

grant select on table public.places, public.segments, public.moments, public.media,
  public.media_variants, public.tracks, public.posts, public.post_media,
  public.tags, public.taggings
  to authenticated;

grant insert (id, journey_id, parent_id, kind, trip_type, title, body, starts_at,
  ends_at, tz, cover_media_id, position, origin, created_by)
  on public.segments to authenticated;
grant update (parent_id, kind, trip_type, title, body, starts_at, ends_at, tz,
  cover_media_id, position, origin)
  on public.segments to authenticated;
grant delete on public.segments to authenticated;

grant insert (id, journey_id, starts_at, ends_at, latitude, longitude, place_id,
  title, body, cover_media_id, origin, locked, published, created_by)
  on public.moments to authenticated;
grant update (starts_at, ends_at, latitude, longitude, place_id, title, body,
  cover_media_id, origin, locked, published)
  on public.moments to authenticated;
grant delete on public.moments to authenticated;

grant insert (id, owner_id, journey_id, kind, status, captured_at, captured_tz,
  latitude, longitude, altitude, hide_location, width, height, duration_ms,
  source_asset_id, content_hash, starred, caption, focal_x, focal_y, moment_id,
  segment_override_id)
  on public.media to authenticated;
grant update (journey_id, status, captured_at, captured_tz, latitude, longitude,
  altitude, hide_location, width, height, duration_ms, starred, caption, focal_x,
  focal_y, moment_id, segment_override_id)
  on public.media to authenticated;
grant delete on public.media to authenticated;

grant insert (media_id, kind, storage_key, mime_type, width, height, byte_size)
  on public.media_variants to authenticated;
grant delete on public.media_variants to authenticated;

grant insert (id, journey_id, segment_id, source, geojson, distance_m, ascent_m)
  on public.tracks to authenticated;
grant update (source, geojson, distance_m, ascent_m) on public.tracks to authenticated;
grant delete on public.tracks to authenticated;

grant insert (id, author_id, space_id, kind, title, body, slug, visibility,
  journey_id, segment_id, place_id, published_at)
  on public.posts to authenticated;
grant update (kind, title, body, slug, visibility, journey_id, segment_id,
  place_id, published_at)
  on public.posts to authenticated;
grant delete on public.posts to authenticated;

grant insert, delete on public.post_media to authenticated;
grant update (position) on public.post_media to authenticated;

grant insert (kind, slug, label, parent_id, gbif_taxon_id, created_by)
  on public.tags to authenticated;

grant insert (tag_id, target_type, target_id, created_by)
  on public.taggings to authenticated;
grant delete on public.taggings to authenticated;

grant insert (home_tz) on public.journeys to authenticated;
grant update (home_tz, cover_media_id) on public.journeys to authenticated;
