-- Column-level INSERT/UPDATE grants for entry_photos.is_cover.
-- Existing grants only covered (entry_id, photo_id, creator_id, position) /
-- UPDATE(position). Naming is_cover in client writes required these grants.
-- Prefer set_entry_photo_cover for cover changes; grants keep upserts safe.

grant insert (entry_id, photo_id, creator_id, position, is_cover)
  on table public.entry_photos to authenticated;
grant update (position, is_cover)
  on table public.entry_photos to authenticated;
