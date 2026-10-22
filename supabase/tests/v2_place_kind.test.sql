begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000d41','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pk-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

insert into public.journeys (id, creator_id, title, visibility)
  values ('dc000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000d41','Kind','private');

insert into public.places (id, name, latitude, longitude, geocode_source, kind) values
('dc100000-0000-4000-8000-000000000001','Alberta',51,-114,'mapy-com','region'),
('dc100000-0000-4000-8000-000000000002','Lake Louise',51.4,-116.2,'geoapify','settlement'),
('dc100000-0000-4000-8000-000000000003','Praha',50,14,'nominatim',null);

insert into public.moments (id, journey_id, starts_at, ends_at, created_by, place_id) values
('dc200000-0000-4000-8000-000000000001','dc000000-0000-4000-8000-000000000001','2026-06-03T10:00:00Z','2026-06-03T11:00:00Z','00000000-0000-4000-8000-000000000d41','dc100000-0000-4000-8000-000000000001'),
('dc200000-0000-4000-8000-000000000002','dc000000-0000-4000-8000-000000000001','2026-06-04T10:00:00Z','2026-06-04T11:00:00Z','00000000-0000-4000-8000-000000000d41','dc100000-0000-4000-8000-000000000002'),
('dc200000-0000-4000-8000-000000000003','dc000000-0000-4000-8000-000000000001','2026-06-05T10:00:00Z','2026-06-05T11:00:00Z','00000000-0000-4000-8000-000000000d41','dc100000-0000-4000-8000-000000000003');
insert into public.place_lookups (grid_key, place_id) values
('51.000,-114.000','dc100000-0000-4000-8000-000000000001');

-- Statements of 20261022120000_v2_place_kind.sql (data part), run twice.
do $$
begin
  for i in 1..2 loop
    update public.moments set place_id = null
    where place_id in (select id from public.places where geocode_source in ('mapy-com', 'geoapify'));
    delete from public.place_lookups;
  end loop;
end $$;

select is(
  (select count(*)::int from public.moments where id::text like 'dc200000%' and place_id is null), 2,
  'automatic places are detached for recomputation'
);
select is(
  (select place_id from public.moments where id = 'dc200000-0000-4000-8000-000000000003'),
  'dc100000-0000-4000-8000-000000000003'::uuid, 'v1-migrated place is kept'
);
select is((select count(*)::int from public.place_lookups), 0, 'grid cache is cleared');
select is((select kind from public.places where id = 'dc100000-0000-4000-8000-000000000001'), 'region', 'kind is stored');
select is((select kind from public.places where id = 'dc100000-0000-4000-8000-000000000003'), null, 'kind is nullable');

select lives_ok(
  $$update public.places set kind = 'near' where id = 'dc100000-0000-4000-8000-000000000001'$$,
  'valid kind accepted'
);
select throws_ok(
  $$update public.places set kind = 'bogus' where id = 'dc100000-0000-4000-8000-000000000001'$$,
  '23514', null, 'invalid kind rejected by check constraint'
);
select ok(has_column_privilege('authenticated', 'public.places', 'kind', 'select'), 'authenticated can read kind');

select * from finish();
rollback;
