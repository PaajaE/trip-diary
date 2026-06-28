-- Retried photo uploads use storage upsert; without UPDATE policy RLS blocks overwrites.

create policy "Authors can overwrite declared photo variants"
on storage.objects
for update
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
)
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
