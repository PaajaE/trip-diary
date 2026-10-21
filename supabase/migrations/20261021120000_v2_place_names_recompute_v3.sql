-- Recompute automatic place names again (resolve-place v3: filtered attractions,
-- prominent natural features, "u <settlement>" fallback, no administrative names).
--
-- Automatic names are places with geocode_source 'mapy-com' or 'geoapify';
-- v1-migrated places carry another source and stay. Moments lose the reference
-- so the client job resolves them again; the grid cache is dropped. places rows
-- are kept (posts.place_id and old references stay valid). Idempotent.

update public.moments
set place_id = null
where place_id in (
  select id from public.places where geocode_source in ('mapy-com', 'geoapify')
);

delete from public.place_lookups;
