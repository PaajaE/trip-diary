-- Mobile WebViews often encode JPEG instead of WebP. Allow both in storage + metadata.

alter table public.photo_variants
  drop constraint photo_variants_mime_type_check;

alter table public.photo_variants
  add constraint photo_variants_mime_type_check
  check (mime_type in ('image/webp', 'image/jpeg'));

alter table public.photo_variants
  drop constraint photo_variants_storage_path_check;

alter table public.photo_variants
  add constraint photo_variants_storage_path_check
  check (
    storage_path = creator_id::text || '/' || photo_id::text || '/' || variant::text || '.webp'
    or storage_path = creator_id::text || '/' || photo_id::text || '/' || variant::text || '.jpg'
  );

update storage.buckets
set allowed_mime_types = array['image/webp', 'image/jpeg']
where id = 'photos';
