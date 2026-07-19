-- Optional per-photo caption on entry_photos (moment photo description).
-- Ownership-safe: UPDATE stays limited to authors via existing RLS;
-- column grant mirrors is_cover / position.

alter table public.entry_photos
  add column if not exists caption text;

comment on column public.entry_photos.caption is
  'Optional public caption for a photo within a moment. Max 500 characters enforced by check.';

alter table public.entry_photos
  drop constraint if exists entry_photos_caption_length_check;

alter table public.entry_photos
  add constraint entry_photos_caption_length_check
  check (caption is null or char_length(caption) <= 500);

grant insert (entry_id, photo_id, creator_id, position, is_cover, caption)
  on table public.entry_photos to authenticated;
grant update (position, is_cover, caption)
  on table public.entry_photos to authenticated;
