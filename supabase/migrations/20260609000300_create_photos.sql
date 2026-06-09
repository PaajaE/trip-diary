create type public.photo_variant_type as enum ('thumb', 'preview', 'large');

alter table public.entries
  add constraint entries_id_creator_unique unique (id, creator_id);

create table public.photos (
  id uuid primary key,
  creator_id uuid not null references auth.users (id) on delete cascade,
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint photos_id_creator_unique unique (id, creator_id)
);

create table public.photo_variants (
  photo_id uuid not null,
  creator_id uuid not null,
  variant public.photo_variant_type not null,
  storage_path text not null,
  width integer not null,
  height integer not null,
  byte_size bigint not null,
  mime_type text not null default 'image/webp',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (photo_id, variant),
  constraint photo_variants_photo_creator_fk
    foreign key (photo_id, creator_id)
    references public.photos (id, creator_id)
    on delete cascade,
  constraint photo_variants_storage_path_unique unique (storage_path),
  constraint photo_variants_storage_path_check check (
    storage_path = creator_id::text || '/' || photo_id::text || '/' || variant::text || '.webp'
  ),
  constraint photo_variants_width_positive_check check (width > 0),
  constraint photo_variants_height_positive_check check (height > 0),
  constraint photo_variants_byte_size_positive_check check (byte_size > 0),
  constraint photo_variants_mime_type_check check (mime_type = 'image/webp')
);

create table public.entry_photos (
  entry_id uuid not null,
  photo_id uuid not null,
  creator_id uuid not null,
  position integer not null,
  created_at timestamptz not null default now(),

  primary key (entry_id, photo_id),
  constraint entry_photos_entry_creator_fk
    foreign key (entry_id, creator_id)
    references public.entries (id, creator_id)
    on delete cascade,
  constraint entry_photos_photo_creator_fk
    foreign key (photo_id, creator_id)
    references public.photos (id, creator_id)
    on delete cascade,
  constraint entry_photos_entry_position_unique unique (entry_id, position),
  constraint entry_photos_position_nonnegative_check check (position >= 0)
);

create index photos_creator_created_at_idx
  on public.photos (creator_id, created_at desc);

create index entry_photos_photo_id_idx
  on public.entry_photos (photo_id);

create trigger set_photos_updated_at
before update on public.photos
for each row
execute function public.set_updated_at();

create trigger set_photo_variants_updated_at
before update on public.photo_variants
for each row
execute function public.set_updated_at();

alter table public.photos enable row level security;
alter table public.photo_variants enable row level security;
alter table public.entry_photos enable row level security;

create policy "Authors and public entry readers can read photos"
on public.photos
for select
to anon, authenticated
using (
  (select auth.uid()) = creator_id
  or exists (
    select 1
    from public.entry_photos ep
    join public.entries e on e.id = ep.entry_id
    where ep.photo_id = photos.id
      and e.status = 'published'
      and e.visibility = 'public'
  )
);

create policy "Authors can insert their own photos"
on public.photos
for insert
to authenticated
with check ((select auth.uid()) = creator_id);

create policy "Authors can update their own photos"
on public.photos
for update
to authenticated
using ((select auth.uid()) = creator_id)
with check ((select auth.uid()) = creator_id);

create policy "Authors can delete their own photos"
on public.photos
for delete
to authenticated
using ((select auth.uid()) = creator_id);

create policy "Authors and public entry readers can read photo variants"
on public.photo_variants
for select
to anon, authenticated
using (
  (select auth.uid()) = creator_id
  or exists (
    select 1
    from public.entry_photos ep
    join public.entries e on e.id = ep.entry_id
    where ep.photo_id = photo_variants.photo_id
      and e.status = 'published'
      and e.visibility = 'public'
  )
);

create policy "Authors can insert their own photo variants"
on public.photo_variants
for insert
to authenticated
with check ((select auth.uid()) = creator_id);

create policy "Authors can update their own photo variants"
on public.photo_variants
for update
to authenticated
using ((select auth.uid()) = creator_id)
with check ((select auth.uid()) = creator_id);

create policy "Authors can delete their own photo variants"
on public.photo_variants
for delete
to authenticated
using ((select auth.uid()) = creator_id);

create policy "Authors and public entry readers can read entry photo links"
on public.entry_photos
for select
to anon, authenticated
using (
  (select auth.uid()) = creator_id
  or exists (
    select 1
    from public.entries e
    where e.id = entry_photos.entry_id
      and e.status = 'published'
      and e.visibility = 'public'
  )
);

create policy "Authors can attach their own photos"
on public.entry_photos
for insert
to authenticated
with check ((select auth.uid()) = creator_id);

create policy "Authors can reorder their own photos"
on public.entry_photos
for update
to authenticated
using ((select auth.uid()) = creator_id)
with check ((select auth.uid()) = creator_id);

create policy "Authors can detach their own photos"
on public.entry_photos
for delete
to authenticated
using ((select auth.uid()) = creator_id);

revoke all on table public.photos from public, anon, authenticated;
grant select on table public.photos to anon, authenticated;
grant insert (id, creator_id, captured_at) on table public.photos to authenticated;
grant update (captured_at) on table public.photos to authenticated;
grant delete on table public.photos to authenticated;

revoke all on table public.photo_variants from public, anon, authenticated;
grant select on table public.photo_variants to anon, authenticated;
grant insert (
  photo_id,
  creator_id,
  variant,
  storage_path,
  width,
  height,
  byte_size,
  mime_type
) on table public.photo_variants to authenticated;
grant update (width, height, byte_size) on table public.photo_variants to authenticated;
grant delete on table public.photo_variants to authenticated;

revoke all on table public.entry_photos from public, anon, authenticated;
grant select on table public.entry_photos to anon, authenticated;
grant insert (entry_id, photo_id, creator_id, position)
  on table public.entry_photos to authenticated;
grant update (position) on table public.entry_photos to authenticated;
grant delete on table public.entry_photos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 8388608, array['image/webp'])
on conflict (id) do nothing;

create policy "Readable photo variants can be downloaded"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'photos'
  and exists (
    select 1
    from public.photo_variants pv
    where pv.storage_path = storage.objects.name
  )
);

create policy "Authors can upload declared photo variants"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.photo_variants pv
    where pv.storage_path = storage.objects.name
      and pv.creator_id = (select auth.uid())
  )
);

create policy "Authors can delete their photo variant objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.photo_variants pv
    where pv.storage_path = storage.objects.name
      and pv.creator_id = (select auth.uid())
  )
);
