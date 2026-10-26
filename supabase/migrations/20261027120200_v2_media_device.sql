-- Phase 4f (ZS-D3): capture device of a media item. Additive.
--
-- * device: normalised EXIF Make + Model (e.g. 'Apple iPhone 15 Pro'), filled
--   by the importers (web and iOS); NULL = unknown. Used to split photo
--   streams per person/device and to detect camera clock offsets.
-- * Nullable, no default, not backfilled, no index.
-- * Grants follow the sibling nullable metadata columns (phash, quality,
--   captured_at_source): column-level insert and update for authenticated;
--   row access stays with the media RLS policies.
-- * Public RPCs expose named columns only; this column is not exposed there.

alter table public.media
  add column device text;

alter table public.media
  add constraint media_device_check check (
    device is null or char_length(device) between 1 and 120
  );

grant insert (device) on public.media to authenticated;
grant update (device) on public.media to authenticated;
