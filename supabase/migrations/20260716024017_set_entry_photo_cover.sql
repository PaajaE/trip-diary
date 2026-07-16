-- Atomic cover selection for entry_photos.
-- Single-statement update keeps the partial unique index valid end-to-end.

create or replace function public.set_entry_photo_cover(
  p_entry_id uuid,
  p_photo_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated integer := 0;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  if not exists (
    select 1
    from public.entries
    where id = p_entry_id
      and creator_id = v_user_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'entry is unavailable or not owned by the current user';
  end if;

  if not exists (
    select 1
    from public.entry_photos
    where entry_id = p_entry_id
      and photo_id = p_photo_id
      and creator_id = v_user_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'photo is not linked to this entry';
  end if;

  -- One statement: exactly one cover remains for the entry.
  update public.entry_photos
  set is_cover = (photo_id = p_photo_id)
  where entry_id = p_entry_id
    and creator_id = v_user_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception using
      errcode = '22023',
      message = 'photo is not linked to this entry';
  end if;
end;
$$;

revoke all on function public.set_entry_photo_cover(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.set_entry_photo_cover(uuid, uuid)
  to authenticated;

comment on function public.set_entry_photo_cover(uuid, uuid) is
  'Atomically sets exactly one cover photo for an entry owned by the caller.';
