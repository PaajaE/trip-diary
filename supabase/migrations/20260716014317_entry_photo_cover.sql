-- Per-moment cover photo selection on entry_photos.
-- Exactly one cover when photos exist is enforced by application logic plus a
-- partial unique index preventing multiple covers for the same entry.

alter table public.entry_photos
  add column if not exists is_cover boolean not null default false;

comment on column public.entry_photos.is_cover is
  'Whether this linked photo is the main/cover photo for the entry/moment.';

-- Backfill: lowest position becomes cover when the entry has photos.
update public.entry_photos as target
set is_cover = true
from (
  select distinct on (entry_id) entry_id, photo_id
  from public.entry_photos
  order by entry_id, position asc, photo_id asc
) as first_photo
where target.entry_id = first_photo.entry_id
  and target.photo_id = first_photo.photo_id
  and target.is_cover = false;

create unique index if not exists entry_photos_one_cover_per_entry_idx
  on public.entry_photos (entry_id)
  where is_cover;

-- When a cover row is deleted, promote the next lowest-position photo.
create or replace function public.promote_entry_photo_cover_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_cover then
    update public.entry_photos
    set is_cover = true
    where entry_id = old.entry_id
      and photo_id = (
        select photo_id
        from public.entry_photos
        where entry_id = old.entry_id
        order by position asc, photo_id asc
        limit 1
      )
      and is_cover = false;
  end if;

  return old;
end;
$$;

drop trigger if exists entry_photos_promote_cover_after_delete on public.entry_photos;
create trigger entry_photos_promote_cover_after_delete
after delete on public.entry_photos
for each row
execute function public.promote_entry_photo_cover_on_delete();

revoke all on function public.promote_entry_photo_cover_on_delete() from public;
grant execute on function public.promote_entry_photo_cover_on_delete() to postgres;
