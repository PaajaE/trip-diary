-- Kind of place a moment got (resolve-place), so the organizer can recognise
-- wilderness days and the UI can style names. Additive; reads are covered by the
-- existing table-level select grant and the "Signed-in users read places" policy.
--
-- Existing automatic places have no kind: moments lose the reference so the
-- client job resolves them again (with kind), and the grid cache is dropped.
-- v1-migrated places stay. Idempotent.

alter table public.places
  add column if not exists kind text;

alter table public.places
  drop constraint if exists places_kind_check;
alter table public.places
  add constraint places_kind_check
  check (kind is null or kind in ('settlement', 'natural', 'attraction', 'near', 'region', 'country'));

update public.moments
set place_id = null
where place_id in (
  select id from public.places where geocode_source in ('mapy-com', 'geoapify')
);

delete from public.place_lookups;
