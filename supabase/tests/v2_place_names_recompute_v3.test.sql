begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000d31','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pr3-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

insert into public.journeys (id, creator_id, title, visibility)
  values ('db000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000d31','Recompute','private');

insert into public.places (id, name, latitude, longitude, geocode_source) values
('db100000-0000-4000-8000-000000000001','Alberta',51,-114,'mapy-com'),
('db100000-0000-4000-8000-000000000002','Lake Louise',51.4,-116.2,'geoapify'),
('db100000-0000-4000-8000-000000000003','Praha',50,14,'nominatim');

insert into public.moments (id, journey_id, starts_at, ends_at, created_by, place_id) values
('db200000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001','2026-06-03T10:00:00Z','2026-06-03T11:00:00Z','00000000-0000-4000-8000-000000000d31','db100000-0000-4000-8000-000000000001'),
('db200000-0000-4000-8000-000000000002','db000000-0000-4000-8000-000000000001','2026-06-04T10:00:00Z','2026-06-04T11:00:00Z','00000000-0000-4000-8000-000000000d31','db100000-0000-4000-8000-000000000002'),
('db200000-0000-4000-8000-000000000003','db000000-0000-4000-8000-000000000001','2026-06-05T10:00:00Z','2026-06-05T11:00:00Z','00000000-0000-4000-8000-000000000d31','db100000-0000-4000-8000-000000000003');
insert into public.place_lookups (grid_key, place_id) values
('51.000,-114.000','db100000-0000-4000-8000-000000000001'),
('51.400,-116.200','db100000-0000-4000-8000-000000000002');

-- Statements of 20261021120000_v2_place_names_recompute_v3.sql, run twice.
do $$
begin
  for i in 1..2 loop
    update public.moments set place_id = null
    where place_id in (select id from public.places where geocode_source in ('mapy-com', 'geoapify'));
    delete from public.place_lookups;
  end loop;
end $$;

select is(
  (select place_id from public.moments where id = 'db200000-0000-4000-8000-000000000001'),
  null, 'mapy-com moment loses its place for recomputation'
);
select is(
  (select place_id from public.moments where id = 'db200000-0000-4000-8000-000000000002'),
  null, 'geoapify moment loses its place for recomputation'
);
select is(
  (select place_id from public.moments where id = 'db200000-0000-4000-8000-000000000003'),
  'db100000-0000-4000-8000-000000000003'::uuid, 'v1-migrated place is kept'
);
select is((select count(*)::int from public.place_lookups), 0, 'grid cache is cleared');
select is((select count(*)::int from public.places where id::text like 'db100000%'), 3, 'places rows are not deleted');
select is((select count(*)::int from public.moments where id::text like 'db200000%'), 3, 'moments are not deleted');

select * from finish();
rollback;
