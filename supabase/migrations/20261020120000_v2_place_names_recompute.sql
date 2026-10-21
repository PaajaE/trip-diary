-- Recompute automatic place names (resolve-place now prefers Geoapify nearby
-- places over Mapy.com administrative units).
--
-- Automatic names are the places with geocode_source 'mapy-com'; v1-migrated
-- places carry another source and stay. Moments lose the reference so the
-- client job resolves them again; the grid cache is dropped (it only ever held
-- Mapy.com results). places rows are kept: posts.place_id (tips) and old
-- references stay valid; unreferenced rows are harmless and reused through
-- places.source_ref. Idempotent.

update public.moments
set place_id = null
where place_id in (
  select id from public.places where geocode_source = 'mapy-com'
);

delete from public.place_lookups;
