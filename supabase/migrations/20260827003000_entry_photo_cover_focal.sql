-- Normalized focal point for entry cover crops (presentation metadata only).
alter table public.entry_photos
  add column if not exists focal_x double precision,
  add column if not exists focal_y double precision;

comment on column public.entry_photos.focal_x is
  'Horizontal focal point for object-position when this link is the cover (0..1). Null = center.';

comment on column public.entry_photos.focal_y is
  'Vertical focal point for object-position when this link is the cover (0..1). Null = center.';

alter table public.entry_photos
  drop constraint if exists entry_photos_focal_range_check;

alter table public.entry_photos
  add constraint entry_photos_focal_range_check
  check (
    (focal_x is null and focal_y is null)
    or (
      focal_x is not null
      and focal_y is not null
      and focal_x >= 0
      and focal_x <= 1
      and focal_y >= 0
      and focal_y <= 1
    )
  );

grant update (position, is_cover, caption, focal_x, focal_y)
  on table public.entry_photos to authenticated;
