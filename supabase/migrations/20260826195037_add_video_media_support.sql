-- Video media support: extend photos/photo_variants without renaming tables.
-- Permanent cloud objects per video: video.mp4 + thumb.jpg + small.jpg

alter table public.photos
  add column if not exists media_type text not null default 'photo',
  add column if not exists duration_ms integer;

alter table public.photos
  drop constraint if exists photos_media_type_check;

alter table public.photos
  add constraint photos_media_type_check
  check (media_type in ('photo', 'video'));

alter table public.photos
  drop constraint if exists photos_duration_ms_check;

alter table public.photos
  add constraint photos_duration_ms_check
  check (duration_ms is null or duration_ms > 0);

alter table public.photo_variants
  drop constraint if exists photo_variants_mime_type_check;

alter table public.photo_variants
  add constraint photo_variants_mime_type_check
  check (mime_type in ('image/webp', 'image/jpeg', 'video/mp4'));

alter table public.photo_variants
  drop constraint if exists photo_variants_storage_path_check;

alter table public.photo_variants
  add constraint photo_variants_storage_path_check check (
    storage_path = creator_id::text || '/' || photo_id::text || '/' || variant::text || '.webp'
    or storage_path = creator_id::text || '/' || photo_id::text || '/' || variant::text || '.jpg'
    or (
      variant = 'video'
      and storage_path = creator_id::text || '/' || photo_id::text || '/video.mp4'
    )
  );

update storage.buckets
set
  file_size_limit = 104857600,
  allowed_mime_types = array['image/webp', 'image/jpeg', 'video/mp4']
where id = 'photos';

drop policy if exists "Authors can upload photo objects in their folder" on storage.objects;
drop policy if exists "Authors can overwrite photo objects in their folder" on storage.objects;
drop policy if exists "Authors can delete photo objects in their folder" on storage.objects;

create policy "Authors can upload photo objects in their folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(thumb|small|medium|full|preview|large|video)\.(jpg|webp|mp4)$'
);

create policy "Authors can overwrite photo objects in their folder"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(thumb|small|medium|full|preview|large|video)\.(jpg|webp|mp4)$'
)
with check (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(thumb|small|medium|full|preview|large|video)\.(jpg|webp|mp4)$'
);

create policy "Authors can delete photo objects in their folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(thumb|small|medium|full|preview|large|video)\.(jpg|webp|mp4)$'
);
