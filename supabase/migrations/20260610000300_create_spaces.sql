create type public.space_kind as enum ('personal', 'family');
create type public.space_role as enum ('owner', 'editor', 'member');

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  kind public.space_kind not null,
  handle text not null,
  name text not null,
  description text,
  avatar_url text,
  created_by uuid not null references auth.users (id) on delete restrict,
  personal_owner_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint spaces_handle_format_check check (
    handle = lower(handle)
    and handle ~ '^[a-z0-9][a-z0-9-]{2,39}$'
  ),
  constraint spaces_name_length_check check (char_length(name) between 1 and 80),
  constraint spaces_description_length_check check (
    description is null or char_length(description) <= 500
  ),
  constraint spaces_avatar_url_length_check check (
    avatar_url is null or char_length(avatar_url) <= 2048
  ),
  constraint spaces_personal_owner_check check (
    (kind = 'personal' and personal_owner_id is not null and personal_owner_id = created_by)
    or (kind = 'family' and personal_owner_id is null)
  )
);

create unique index spaces_handle_unique_idx on public.spaces (handle);
create unique index spaces_personal_owner_unique_idx
  on public.spaces (personal_owner_id)
  where personal_owner_id is not null;
create index spaces_created_by_idx on public.spaces (created_by);

create table public.space_members (
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.space_role not null,
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create index space_members_user_idx on public.space_members (user_id, space_id);

create trigger set_spaces_updated_at
before update on public.spaces
for each row
execute function public.set_updated_at();

create or replace function public.is_space_member(p_space_id uuid)
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
  )
$$;

create or replace function public.create_personal_space_for_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_handle text;
  personal_handle text;
  personal_name text;
  new_space_id uuid;
begin
  base_handle := replace(coalesce(new.username, ''), '_', '-');

  if base_handle !~ '^[a-z0-9][a-z0-9-]{2,39}$' then
    base_handle := 'traveler-' || left(new.id::text, 8);
  end if;

  personal_handle := base_handle;
  if exists (select 1 from public.spaces where handle = personal_handle) then
    personal_handle := 'u-' || md5(new.id::text);
  end if;

  personal_name := coalesce(nullif(new.display_name, ''), nullif(new.username, ''), 'Cestovatel');

  insert into public.spaces (
    kind,
    handle,
    name,
    created_by,
    personal_owner_id
  )
  values (
    'personal',
    personal_handle,
    personal_name,
    new.id,
    new.id
  )
  returning id into new_space_id;

  insert into public.space_members (space_id, user_id, role)
  values (new_space_id, new.id, 'owner');

  return new;
end;
$$;

create trigger create_personal_space_after_profile_insert
after insert on public.profiles
for each row
execute function public.create_personal_space_for_profile();

insert into public.spaces (
  kind,
  handle,
  name,
  created_by,
  personal_owner_id
)
select
  'personal'::public.space_kind,
  case
    when candidate.handle_rank > 1
      then 'u-' || md5(candidate.id::text)
    else candidate.base_handle
  end,
  coalesce(nullif(candidate.display_name, ''), nullif(candidate.username, ''), 'Cestovatel'),
  candidate.id,
  candidate.id
from (
  select
    profiles.id,
    profiles.username,
    profiles.display_name,
    generated.base_handle,
    row_number() over (
      partition by generated.base_handle
      order by profiles.id
    ) as handle_rank
  from public.profiles
  cross join lateral (
    select case
      when replace(coalesce(profiles.username, ''), '_', '-') ~ '^[a-z0-9][a-z0-9-]{2,39}$'
        then replace(profiles.username, '_', '-')
      else 'traveler-' || left(profiles.id::text, 8)
    end as base_handle
  ) generated
) candidate
where not exists (
  select 1
  from public.spaces
  where personal_owner_id = candidate.id
)
order by candidate.id;

insert into public.space_members (space_id, user_id, role)
select id, personal_owner_id, 'owner'
from public.spaces
where kind = 'personal'
on conflict (space_id, user_id) do nothing;

create or replace function public.create_family_space(
  p_name text,
  p_handle text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_space_id uuid;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if p_name is null or char_length(p_name) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'invalid space name';
  end if;

  if p_handle is null
    or p_handle <> lower(p_handle)
    or p_handle !~ '^[a-z0-9][a-z0-9-]{2,39}$'
  then
    raise exception using errcode = '22023', message = 'invalid space handle';
  end if;

  insert into public.spaces (kind, handle, name, created_by)
  values ('family', p_handle, p_name, current_user_id)
  returning id into new_space_id;

  insert into public.space_members (space_id, user_id, role)
  values (new_space_id, current_user_id, 'owner');

  return new_space_id;
end;
$$;

alter table public.spaces enable row level security;
alter table public.space_members enable row level security;

create policy "Spaces are publicly readable"
on public.spaces
for select
to anon, authenticated
using (true);

create policy "Members can read fellow space memberships"
on public.space_members
for select
to authenticated
using (public.is_space_member(space_id));

revoke all on function public.is_space_member(uuid) from public, anon, authenticated;
revoke all on function public.create_personal_space_for_profile() from public, anon, authenticated;
revoke all on function public.create_family_space(text, text) from public, anon, authenticated;
grant execute on function public.is_space_member(uuid) to authenticated;
grant execute on function public.create_family_space(text, text) to authenticated;

revoke all on table public.spaces, public.space_members from public, anon, authenticated;
grant select on table public.spaces to anon, authenticated;
grant select on table public.space_members to authenticated;
