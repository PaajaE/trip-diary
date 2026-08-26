-- Expand photo variants to the canonical responsive set:
--   thumb  (~220)  tiny UI
--   small  (~800)  cards / feeds
--   medium (~1600) fullscreen / retina
--   full   (normalized master)
-- Keep legacy enum values preview/large for backward-compatible reads.

alter type public.photo_variant_type add value if not exists 'small';
alter type public.photo_variant_type add value if not exists 'medium';
alter type public.photo_variant_type add value if not exists 'full';

alter table public.photo_variants
  drop constraint if exists photo_variants_storage_path_check;

alter table public.photo_variants
  add constraint photo_variants_storage_path_check check (
    storage_path = creator_id::text || '/' || photo_id::text || '/' || variant::text || '.webp'
    or storage_path = creator_id::text || '/' || photo_id::text || '/' || variant::text || '.jpg'
  );

-- Allow author Storage writes for both canonical and legacy variant filenames.
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
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(thumb|small|medium|full|preview|large)\.(jpg|webp)$'
);

create policy "Authors can overwrite photo objects in their folder"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(thumb|small|medium|full|preview|large)\.(jpg|webp)$'
)
with check (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(thumb|small|medium|full|preview|large)\.(jpg|webp)$'
);

create policy "Authors can delete photo objects in their folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(thumb|small|medium|full|preview|large)\.(jpg|webp)$'
);
