create type public.content_target_type as enum ('journey', 'entry', 'photo');

create table public.content_hearts (
  target_type public.content_target_type not null,
  target_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (user_id, target_type, target_id)
);

create index content_hearts_target_idx
  on public.content_hearts (target_type, target_id);

create table public.content_comments (
  id uuid primary key default gen_random_uuid(),
  target_type public.content_target_type not null,
  target_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  hidden_at timestamptz,
  hidden_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint content_comments_body_length check (
    char_length(body) between 1 and 2000
  )
);

create index content_comments_target_created_idx
  on public.content_comments (target_type, target_id, created_at);

alter table public.content_comments
  add constraint content_comments_user_profile_fk
  foreign key (user_id) references public.profiles (id) on delete cascade;

create trigger set_content_comments_updated_at
before update on public.content_comments
for each row
execute function public.set_updated_at();

create or replace function public.is_interactable_target(
  p_target_type public.content_target_type,
  p_target_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_target_type
    when 'journey'::public.content_target_type then exists (
      select 1
      from public.journeys j
      where j.id = p_target_id
        and j.visibility = 'public'
    )
    when 'entry'::public.content_target_type then exists (
      select 1
      from public.entries e
      where e.id = p_target_id
        and e.status = 'published'
        and e.visibility = 'public'
    )
    when 'photo'::public.content_target_type then public.is_public_photo(p_target_id)
    else false
  end
$$;

revoke all on function public.is_interactable_target(public.content_target_type, uuid)
  from public, anon, authenticated;
grant execute on function public.is_interactable_target(public.content_target_type, uuid)
  to anon, authenticated;

create or replace function public.can_moderate_target(
  p_target_type public.content_target_type,
  p_target_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_user_id is null then false
    when p_target_type = 'journey'::public.content_target_type then exists (
      select 1
      from public.journeys j
      where j.id = p_target_id
        and (
          j.creator_id = p_user_id
          or public.has_space_publish_role(j.space_id)
        )
    )
    when p_target_type = 'entry'::public.content_target_type then exists (
      select 1
      from public.entries e
      where e.id = p_target_id
        and (
          e.creator_id = p_user_id
          or public.has_space_publish_role(e.space_id)
        )
    )
    when p_target_type = 'photo'::public.content_target_type then (
      exists (
        select 1
        from public.photos p
        where p.id = p_target_id
          and p.creator_id = p_user_id
      )
      or exists (
        select 1
        from public.entry_photos ep
        join public.entries e on e.id = ep.entry_id
        where ep.photo_id = p_target_id
          and (
            e.creator_id = p_user_id
            or public.has_space_publish_role(e.space_id)
          )
      )
    )
    else false
  end
$$;

revoke all on function public.can_moderate_target(
  public.content_target_type,
  uuid,
  uuid
) from public, anon, authenticated;
grant execute on function public.can_moderate_target(
  public.content_target_type,
  uuid,
  uuid
) to authenticated;

alter table public.content_hearts enable row level security;
alter table public.content_comments enable row level security;

create policy "Public readers can count hearts on interactable targets"
on public.content_hearts
for select
to anon, authenticated
using (public.is_interactable_target(target_type, target_id));

create policy "Authenticated users can heart interactable targets"
on public.content_hearts
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_interactable_target(target_type, target_id)
);

create policy "Users can remove their own hearts"
on public.content_hearts
for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "Readers can view visible comments on interactable targets"
on public.content_comments
for select
to anon, authenticated
using (
  public.is_interactable_target(target_type, target_id)
  and (
    hidden_at is null
    or user_id = (select auth.uid())
    or public.can_moderate_target(
      target_type,
      target_id,
      (select auth.uid())
    )
  )
);

create policy "Authenticated users can comment on interactable targets"
on public.content_comments
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and hidden_at is null
  and public.is_interactable_target(target_type, target_id)
);

create policy "Authors can update their own comments"
on public.content_comments
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Authors can delete their own comments"
on public.content_comments
for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "Moderators can hide comments"
on public.content_comments
for update
to authenticated
using (
  public.can_moderate_target(
    target_type,
    target_id,
    (select auth.uid())
  )
)
with check (
  public.can_moderate_target(
    target_type,
    target_id,
    (select auth.uid())
  )
);
