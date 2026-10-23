-- Phase 4d (decision A): media.reviewed_at marks media as sorted after a batch
-- upload. NULL = waiting to be sorted.
--
-- * Column is added nullable WITHOUT a default, so newly inserted rows stay NULL
--   (= to sort). Existing rows are backfilled to now() in the same migration, so
--   they never appear as "to sort". Backfill is a one-off statement here.
-- * No client column grant: authenticated cannot write reviewed_at directly
--   (insert/update grants are column lists that do not include it). Only
--   mark_media_reviewed changes it.
-- * Public RPCs build explicit JSON objects and do not expose the column.
-- * Trashed rows (deleted_at is not null) are ignored: not changed, not counted.
-- Errors as in the curation RPCs: P0002 / 42501 / 22023.

alter table public.media add column reviewed_at timestamptz;

update public.media set reviewed_at = now() where reviewed_at is null;

create index media_unreviewed_idx on public.media (journey_id)
  where reviewed_at is null and deleted_at is null;

-- Returns the number of rows whose state actually changed.
create or replace function public.mark_media_reviewed(
  p_media_ids uuid[],
  p_reviewed boolean default true
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_journey uuid := public.media_batch_journey(p_media_ids, 'mark_media_reviewed');
  v_count int;
begin
  if v_journey is null then
    return 0;
  end if;
  if p_reviewed is null then
    raise exception 'mark_media_reviewed: p_reviewed is required' using errcode = '22023';
  end if;

  if p_reviewed then
    update public.media set reviewed_at = now()
     where id = any (p_media_ids) and journey_id = v_journey
       and deleted_at is null and reviewed_at is null;
  else
    update public.media set reviewed_at = null
     where id = any (p_media_ids) and journey_id = v_journey
       and deleted_at is null and reviewed_at is not null;
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_media_reviewed(uuid[], boolean) from public, anon, authenticated;
grant execute on function public.mark_media_reviewed(uuid[], boolean) to authenticated;
