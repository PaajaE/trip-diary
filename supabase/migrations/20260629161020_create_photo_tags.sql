create table public.journey_photo_tags (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys (id) on delete cascade,
  slug text not null,
  label text not null,
  created_at timestamptz not null default now(),

  constraint journey_photo_tags_journey_slug_unique unique (journey_id, slug),
  constraint journey_photo_tags_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]*$')
);

create index journey_photo_tags_journey_id_idx
  on public.journey_photo_tags (journey_id);

create table public.photo_tag_assignments (
  photo_id uuid not null,
  tag_id uuid not null references public.journey_photo_tags (id) on delete cascade,
  creator_id uuid not null,
  created_at timestamptz not null default now(),

  primary key (photo_id, tag_id),
  constraint photo_tag_assignments_photo_creator_fk
    foreign key (photo_id, creator_id)
    references public.photos (id, creator_id)
    on delete cascade
);

create index photo_tag_assignments_tag_id_idx
  on public.photo_tag_assignments (tag_id);

create or replace function public.is_public_photo(p_photo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.entry_photos ep
    join public.entries e on e.id = ep.entry_id
    where ep.photo_id = p_photo_id
      and e.status = 'published'
      and e.visibility = 'public'
  )
$$;

revoke all on function public.is_public_photo(uuid) from public, anon, authenticated;
grant execute on function public.is_public_photo(uuid) to anon, authenticated;

alter table public.journey_photo_tags enable row level security;
alter table public.photo_tag_assignments enable row level security;

create policy "Public and members can read journey photo tags"
on public.journey_photo_tags
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.journeys j
    where j.id = journey_photo_tags.journey_id
      and j.visibility = 'public'
  )
  or public.is_journey_member(journey_photo_tags.journey_id)
);

create policy "Journey members can create journey photo tags"
on public.journey_photo_tags
for insert
to authenticated
with check (public.is_journey_member(journey_photo_tags.journey_id));

create policy "Public and members can read photo tag assignments"
on public.photo_tag_assignments
for select
to anon, authenticated
using (
  public.is_public_photo(photo_tag_assignments.photo_id)
  or (select auth.uid()) = photo_tag_assignments.creator_id
  or exists (
    select 1
    from public.journey_photo_tags t
    where t.id = photo_tag_assignments.tag_id
      and public.is_journey_member(t.journey_id)
  )
);

create policy "Authors can assign photo tags"
on public.photo_tag_assignments
for insert
to authenticated
with check (
  (select auth.uid()) = creator_id
  and exists (
    select 1
    from public.photos p
    where p.id = photo_id
      and p.creator_id = creator_id
  )
);

create policy "Authors can remove photo tags"
on public.photo_tag_assignments
for delete
to authenticated
using ((select auth.uid()) = creator_id);
