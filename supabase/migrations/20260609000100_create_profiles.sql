create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  preferred_locale text not null default 'cs',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_username_format_check check (
    username is null
    or (
      username = lower(username)
      and username ~ '^[a-z0-9_]{3,30}$'
    )
  ),
  constraint profiles_display_name_length_check check (
    display_name is null or char_length(display_name) between 1 and 80
  ),
  constraint profiles_avatar_url_length_check check (
    avatar_url is null or char_length(avatar_url) <= 2048
  ),
  constraint profiles_bio_length_check check (
    bio is null or char_length(bio) <= 500
  ),
  constraint profiles_preferred_locale_check check (
    preferred_locale in ('cs', 'en')
  )
);

create unique index profiles_username_unique_idx
  on public.profiles (username)
  where username is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data ->> 'username');

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger create_profile_after_user_insert
after insert on auth.users
for each row
execute function public.handle_new_user();

alter table public.profiles enable row level security;

create policy "Profiles are publicly readable"
on public.profiles
for select
to anon, authenticated
using (true);

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to anon, authenticated;
grant update (username, display_name, avatar_url, bio, preferred_locale)
  on table public.profiles
  to authenticated;
