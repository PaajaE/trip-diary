create type public.entry_type as enum ('story', 'tip', 'note', 'place');
create type public.entry_language as enum ('cs', 'en');
create type public.entry_visibility as enum ('public', 'private');
create type public.entry_status as enum ('draft', 'published');

create table public.entries (
  id uuid primary key,
  creator_id uuid not null references auth.users (id) on delete cascade,
  type public.entry_type not null,
  title text,
  body text not null default '',
  language public.entry_language not null default 'cs',
  visibility public.entry_visibility not null default 'private',
  status public.entry_status not null default 'draft',
  event_at timestamptz,
  latitude double precision,
  longitude double precision,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,

  constraint entries_title_length_check check (
    title is null or char_length(title) between 1 and 160
  ),
  constraint entries_body_length_check check (char_length(body) <= 50000),
  constraint entries_coordinates_pair_check check (
    (latitude is null and longitude is null)
    or (latitude is not null and longitude is not null)
  ),
  constraint entries_latitude_range_check check (
    latitude is null or latitude between -90 and 90
  ),
  constraint entries_longitude_range_check check (
    longitude is null or longitude between -180 and 180
  ),
  constraint entries_version_positive_check check (version > 0),
  constraint entries_published_at_status_check check (
    (status = 'draft' and published_at is null)
    or (status = 'published' and published_at is not null)
  )
);

create index entries_creator_updated_at_idx
  on public.entries (creator_id, updated_at desc);

create index entries_public_published_at_idx
  on public.entries (published_at desc)
  where status = 'published' and visibility = 'public';

create or replace function public.prepare_entry_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version = 1;
    new.created_at = statement_timestamp();
  end if;

  new.updated_at = statement_timestamp();

  if new.status = 'published' and new.published_at is null then
    new.published_at = statement_timestamp();
  elsif new.status = 'draft' then
    new.published_at = null;
  end if;

  return new;
end;
$$;

revoke all on function public.prepare_entry_write() from public, anon, authenticated;

create trigger prepare_entry_before_write
before insert or update on public.entries
for each row
execute function public.prepare_entry_write();

alter table public.entries enable row level security;

create policy "Published public entries are readable"
on public.entries
for select
to anon, authenticated
using (
  (status = 'published' and visibility = 'public')
  or (select auth.uid()) = creator_id
);

create policy "Authors can insert their own entries"
on public.entries
for insert
to authenticated
with check ((select auth.uid()) = creator_id);

create policy "Authors can delete their own entries"
on public.entries
for delete
to authenticated
using ((select auth.uid()) = creator_id);

revoke all on table public.entries from public, anon, authenticated;
grant select on table public.entries to anon, authenticated;
grant insert (
  id,
  creator_id,
  type,
  title,
  body,
  language,
  visibility,
  status,
  event_at,
  latitude,
  longitude
) on table public.entries to authenticated;
grant delete on table public.entries to authenticated;

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
    raise exception using
      errcode = '42501',
      message = 'authentication required';
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
  returning * into updated_entry;

  if found then
    return next updated_entry;
    return;
  end if;

  if exists (
    select 1
    from public.entries
    where id = p_id
      and creator_id = auth.uid()
  ) then
    raise exception using
      errcode = '40001',
      message = 'entry version conflict';
  end if;

  raise exception using
    errcode = '42501',
    message = 'entry is unavailable or not owned by the current user';
end;
$$;

revoke all on function public.update_entry(
  uuid,
  bigint,
  public.entry_type,
  text,
  text,
  public.entry_language,
  public.entry_visibility,
  public.entry_status,
  timestamptz,
  double precision,
  double precision
) from public, anon, authenticated;

grant execute on function public.update_entry(
  uuid,
  bigint,
  public.entry_type,
  text,
  text,
  public.entry_language,
  public.entry_visibility,
  public.entry_status,
  timestamptz,
  double precision,
  double precision
) to authenticated;
