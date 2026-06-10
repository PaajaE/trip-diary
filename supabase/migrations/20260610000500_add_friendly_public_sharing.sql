alter table public.journeys
  add column space_id uuid references public.spaces (id) on delete restrict,
  add column slug text;

alter table public.entries
  add column space_id uuid references public.spaces (id) on delete restrict,
  add column slug text;

create or replace function public.normalize_content_slug(p_value text, p_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      trim(both '-' from regexp_replace(
        regexp_replace(
          translate(
            lower(coalesce(p_value, '')),
            'áäčďéěëíňóöřšťúůüýž',
            'aacdeeeinoorstuuuyz'
          ),
          '[^a-z0-9]+',
          '-',
          'g'
        ),
        '-+',
        '-',
        'g'
      )),
      ''
    ),
    'item-' || left(p_id::text, 8)
  )
$$;

revoke all on function public.normalize_content_slug(text, uuid)
  from public, anon, authenticated;

create or replace function public.has_space_publish_role(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.space_members
    where space_id = p_space_id
      and user_id = auth.uid()
      and role in ('owner'::public.space_role, 'editor'::public.space_role)
  )
$$;

revoke all on function public.has_space_publish_role(uuid)
  from public, anon, authenticated;
grant execute on function public.has_space_publish_role(uuid) to authenticated;

do $$
begin
  if exists (
    select 1
    from public.journeys
    left join public.spaces
      on spaces.personal_owner_id = journeys.creator_id
     and spaces.kind = 'personal'::public.space_kind
    where spaces.id is null
  ) or exists (
    select 1
    from public.entries
    left join public.spaces
      on spaces.personal_owner_id = entries.creator_id
     and spaces.kind = 'personal'::public.space_kind
    where spaces.id is null
  ) then
    raise exception 'cannot backfill public sharing: a creator has no personal space';
  end if;
end
$$;

update public.journeys
set space_id = spaces.id
from public.spaces
where spaces.personal_owner_id = journeys.creator_id
  and spaces.kind = 'personal'::public.space_kind;

update public.entries
set space_id = spaces.id
from public.spaces
where spaces.personal_owner_id = entries.creator_id
  and spaces.kind = 'personal'::public.space_kind;

with bases as (
  select
    id,
    space_id,
    created_at,
    left(public.normalize_content_slug(title, id), 120) as base_slug
  from public.journeys
),
generated as (
  select
    id,
    base_slug,
    row_number() over (
      partition by space_id, base_slug
      order by created_at, id
    ) as slug_rank
  from bases
)
update public.journeys
set slug = case
  when generated.slug_rank = 1 then generated.base_slug
  else left(
    generated.base_slug,
    120 - length(generated.slug_rank::text) - 1
  ) || '-' || generated.slug_rank::text
end
from generated
where journeys.id = generated.id;

with bases as (
  select
    id,
    space_id,
    created_at,
    left(public.normalize_content_slug(title, id), 120) as base_slug
  from public.entries
),
generated as (
  select
    id,
    base_slug,
    row_number() over (
      partition by space_id, base_slug
      order by created_at, id
    ) as slug_rank
  from bases
)
update public.entries
set slug = case
  when generated.slug_rank = 1 then generated.base_slug
  else left(
    generated.base_slug,
    120 - length(generated.slug_rank::text) - 1
  ) || '-' || generated.slug_rank::text
end
from generated
where entries.id = generated.id;

alter table public.journeys
  alter column space_id set not null,
  alter column slug set not null,
  add constraint journeys_slug_format_check check (
    slug = lower(slug)
    and slug ~ '^[a-z0-9][a-z0-9-]{0,119}$'
  );

alter table public.entries
  alter column space_id set not null,
  alter column slug set not null,
  add constraint entries_slug_format_check check (
    slug = lower(slug)
    and slug ~ '^[a-z0-9][a-z0-9-]{0,119}$'
  );

create unique index journeys_space_slug_unique_idx
  on public.journeys (space_id, slug);
create unique index entries_space_slug_unique_idx
  on public.entries (space_id, slug);
create index journeys_space_updated_at_idx
  on public.journeys (space_id, updated_at desc);
create index entries_space_published_at_idx
  on public.entries (space_id, published_at desc)
  where status = 'published' and visibility = 'public';

create or replace function public.prepare_journey_sharing_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base_slug text;
  v_candidate_slug text;
  v_suffix integer := 1;
begin
  if tg_op = 'UPDATE' and new.creator_id <> old.creator_id then
    raise exception using errcode = '42501', message = 'journey creator cannot be changed';
  end if;

  if new.space_id is null then
    select id into new.space_id
    from public.spaces
    where personal_owner_id = new.creator_id
      and kind = 'personal'::public.space_kind;
  end if;

  if new.space_id is null then
    raise exception using errcode = '23502', message = 'journey space is required';
  end if;

  if auth.uid() is not null
    and (tg_op = 'INSERT' or new.space_id is distinct from old.space_id)
    and not public.has_space_publish_role(new.space_id)
  then
    raise exception using errcode = '42501', message = 'space owner or editor role required';
  end if;

  if new.slug is not null then
    if new.slug <> lower(new.slug) or new.slug !~ '^[a-z0-9][a-z0-9-]{0,119}$' then
      raise exception using errcode = '22023', message = 'invalid journey slug';
    end if;
    return new;
  end if;

  v_base_slug := left(public.normalize_content_slug(new.title, new.id), 120);
  v_candidate_slug := v_base_slug;
  while exists (
    select 1 from public.journeys
    where space_id = new.space_id and slug = v_candidate_slug and id <> new.id
  ) loop
    v_suffix := v_suffix + 1;
    v_candidate_slug := left(v_base_slug, 120 - length(v_suffix::text) - 1)
      || '-' || v_suffix::text;
  end loop;
  new.slug := v_candidate_slug;
  return new;
end
$$;

create or replace function public.prepare_entry_sharing_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base_slug text;
  v_candidate_slug text;
  v_suffix integer := 1;
begin
  if tg_op = 'UPDATE' and new.creator_id <> old.creator_id then
    raise exception using errcode = '42501', message = 'entry creator cannot be changed';
  end if;

  if new.space_id is null then
    select id into new.space_id
    from public.spaces
    where personal_owner_id = new.creator_id
      and kind = 'personal'::public.space_kind;
  end if;

  if new.space_id is null then
    raise exception using errcode = '23502', message = 'entry space is required';
  end if;

  if auth.uid() is not null
    and (tg_op = 'INSERT' or new.space_id is distinct from old.space_id)
    and not public.has_space_publish_role(new.space_id)
  then
    raise exception using errcode = '42501', message = 'space owner or editor role required';
  end if;

  if new.slug is not null then
    if new.slug <> lower(new.slug) or new.slug !~ '^[a-z0-9][a-z0-9-]{0,119}$' then
      raise exception using errcode = '22023', message = 'invalid entry slug';
    end if;
    return new;
  end if;

  v_base_slug := left(public.normalize_content_slug(new.title, new.id), 120);
  v_candidate_slug := v_base_slug;
  while exists (
    select 1 from public.entries
    where space_id = new.space_id and slug = v_candidate_slug and id <> new.id
  ) loop
    v_suffix := v_suffix + 1;
    v_candidate_slug := left(v_base_slug, 120 - length(v_suffix::text) - 1)
      || '-' || v_suffix::text;
  end loop;
  new.slug := v_candidate_slug;
  return new;
end
$$;

revoke all on function public.prepare_journey_sharing_write()
  from public, anon, authenticated;
revoke all on function public.prepare_entry_sharing_write()
  from public, anon, authenticated;

create trigger prepare_journey_sharing_before_write
before insert or update on public.journeys
for each row execute function public.prepare_journey_sharing_write();

create trigger prepare_entry_sharing_before_write
before insert or update on public.entries
for each row execute function public.prepare_entry_sharing_write();

drop policy "Creators can insert journeys" on public.journeys;
drop policy "Owners can update journeys" on public.journeys;

create policy "Creators with space role can insert journeys" on public.journeys
for insert to authenticated with check (
  creator_id = auth.uid() and public.has_space_publish_role(space_id)
);
create policy "Creators with space role can update journeys" on public.journeys
for update to authenticated using (creator_id = auth.uid())
with check (
  creator_id = auth.uid() and public.has_space_publish_role(space_id)
);

drop policy "Authors can insert their own entries" on public.entries;
create policy "Authors with space role can insert entries" on public.entries
for insert to authenticated with check (
  creator_id = auth.uid() and public.has_space_publish_role(space_id)
);

grant insert (space_id, slug) on public.journeys to authenticated;
grant insert (space_id, slug) on public.entries to authenticated;

create or replace function public.move_journey_to_space(
  p_journey_id uuid,
  p_space_id uuid,
  p_slug text default null
)
returns setof public.journeys
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_journey public.journeys;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if not public.has_space_publish_role(p_space_id) then
    raise exception using errcode = '42501', message = 'space owner or editor role required';
  end if;

  update public.journeys
  set space_id = p_space_id, slug = p_slug
  where id = p_journey_id and creator_id = auth.uid()
  returning * into v_journey;

  if not found then
    raise exception using errcode = '42501',
      message = 'journey is unavailable or not owned by the current user';
  end if;
  return next v_journey;
end
$$;

create or replace function public.move_entry_to_space(
  p_entry_id uuid,
  p_space_id uuid,
  p_slug text default null
)
returns setof public.entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.entries;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if not public.has_space_publish_role(p_space_id) then
    raise exception using errcode = '42501', message = 'space owner or editor role required';
  end if;

  update public.entries
  set space_id = p_space_id, slug = p_slug, version = version + 1
  where id = p_entry_id and creator_id = auth.uid()
  returning * into v_entry;

  if not found then
    raise exception using errcode = '42501',
      message = 'entry is unavailable or not owned by the current user';
  end if;
  return next v_entry;
end
$$;

revoke all on function public.move_journey_to_space(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.move_entry_to_space(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.move_journey_to_space(uuid, uuid, text) to authenticated;
grant execute on function public.move_entry_to_space(uuid, uuid, text) to authenticated;

create or replace function public.update_entry(
  p_id uuid,
  p_expected_version bigint,
  p_type public.entry_type,
  p_title text,
  p_body text,
  p_language public.entry_language,
  p_visibility public.entry_visibility,
  p_status public.entry_status,
  p_event_at timestamptz,
  p_latitude double precision,
  p_longitude double precision
)
returns setof public.entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_entry public.entries;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  update public.entries
  set
    type = p_type,
    title = p_title,
    body = p_body,
    language = p_language,
    visibility = p_visibility,
    status = p_status,
    event_at = p_event_at,
    latitude = p_latitude,
    longitude = p_longitude,
    version = version + 1
  where id = p_id
    and creator_id = auth.uid()
    and version = p_expected_version
    and (
      p_status = 'draft'::public.entry_status
      or public.has_space_publish_role(space_id)
    )
  returning * into updated_entry;

  if found then
    return next updated_entry;
    return;
  end if;

  if exists (
    select 1 from public.entries
    where id = p_id and creator_id = auth.uid() and version <> p_expected_version
  ) then
    raise exception using errcode = '40001', message = 'entry version conflict';
  end if;
  if exists (
    select 1 from public.entries
    where id = p_id and creator_id = auth.uid()
  ) and p_status = 'published'::public.entry_status then
    raise exception using errcode = '42501', message = 'space owner or editor role required';
  end if;

  raise exception using errcode = '42501',
    message = 'entry is unavailable or not owned by the current user';
end
$$;

revoke all on function public.update_entry(
  uuid, bigint, public.entry_type, text, text, public.entry_language,
  public.entry_visibility, public.entry_status, timestamptz,
  double precision, double precision
) from public, anon, authenticated;
grant execute on function public.update_entry(
  uuid, bigint, public.entry_type, text, text, public.entry_language,
  public.entry_visibility, public.entry_status, timestamptz,
  double precision, double precision
) to authenticated;
