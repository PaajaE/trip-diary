-- Mobile (and future clients) upload Storage bytes before declaring
-- photo_variants, then verify size, then insert the variant row.
-- The previous policies required a photo_variants row first, which blocked
-- Storage-before-DB and made size verification of undeclared objects fail.

-- Authors may upload/overwrite/delete objects under their own uid folder when
-- the object name matches the canonical photo variant path shape.
-- Public/shared reads still go through declared photo_variants (existing policy).

drop policy if exists "Authors can upload declared photo variants" on storage.objects;
drop policy if exists "Authors can overwrite declared photo variants" on storage.objects;
drop policy if exists "Authors can delete their photo variant objects" on storage.objects;
drop policy if exists "Authors can read their own photo objects" on storage.objects;

create policy "Authors can upload photo objects in their folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(thumb|preview|large)\.(jpg|webp)$'
);

create policy "Authors can overwrite photo objects in their folder"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(thumb|preview|large)\.(jpg|webp)$'
)
with check (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(thumb|preview|large)\.(jpg|webp)$'
);

create policy "Authors can delete photo objects in their folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(thumb|preview|large)\.(jpg|webp)$'
);

create policy "Authors can read their own photo objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
