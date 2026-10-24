begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-0000000000d1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cl-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-0000000000d2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cl-editor@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-0000000000d3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cl-member@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-0000000000d4','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cl-stranger@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

-- owner d1, editor d2, member (read-only) d3, stranger d4
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}',true);
insert into public.journeys (id, creator_id, title, visibility)
  values ('c2000000-0000-4000-8000-000000000001', auth.uid(), 'Clear location', 'private');
insert into public.journey_members (journey_id, user_id, role) values
('c2000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000d2','editor'),
('c2000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000d3','member');
insert into public.media (id, owner_id, journey_id, kind, status, latitude, longitude, hide_location) values
('c2300000-0000-4000-8000-000000000001', auth.uid(), 'c2000000-0000-4000-8000-000000000001','photo','ready',48.2,16.4,true),
('c2300000-0000-4000-8000-000000000002', auth.uid(), 'c2000000-0000-4000-8000-000000000001','photo','ready',null,null,false),
('c2300000-0000-4000-8000-000000000003', auth.uid(), 'c2000000-0000-4000-8000-000000000001','photo','ready',10,20,false),
('c2300000-0000-4000-8000-000000000004', auth.uid(), 'c2000000-0000-4000-8000-000000000001','photo','ready',null,null,false);
select public.trash_media(array['c2300000-0000-4000-8000-000000000003']::uuid[]);
-- a location with provenance, as set_media_location writes it
select public.set_media_location(array['c2300000-0000-4000-8000-000000000001']::uuid[], 48.2, 16.4);
select is((select location_source from public.media where id = 'c2300000-0000-4000-8000-000000000001'), 'manual', 'precondition: location_source is manual');

select is(public.clear_media_location(array['c2300000-0000-4000-8000-000000000001','c2300000-0000-4000-8000-000000000002','c2300000-0000-4000-8000-000000000003','c2300000-0000-4000-8000-000000000004']::uuid[]), 1, 'only the row with a location changes; no-location and trashed rows are skipped');
select is((select latitude is null and longitude is null and location_source is null from public.media where id = 'c2300000-0000-4000-8000-000000000001'), true, 'coordinates and location_source reset');
select is((select hide_location from public.media where id = 'c2300000-0000-4000-8000-000000000001'), true, 'hide_location untouched');
select is((select latitude || ',' || longitude from public.media where id = 'c2300000-0000-4000-8000-000000000003'), '10,20', 'trashed row untouched');
select is(public.clear_media_location(array['c2300000-0000-4000-8000-000000000001','c2300000-0000-4000-8000-000000000002']::uuid[]), 0, 'idempotent: second call changes nothing');
select is(public.clear_media_location(array[]::uuid[]), 0, 'empty id list changes nothing');
select throws_ok($$ select public.clear_media_location(null) $$, '22023', null, 'null id list rejected');
-- undo round trip
select is(public.set_media_location(array['c2300000-0000-4000-8000-000000000002','c2300000-0000-4000-8000-000000000004']::uuid[], 1, 2), 2, 'set location on two rows');
select is(public.clear_media_location(array['c2300000-0000-4000-8000-000000000002','c2300000-0000-4000-8000-000000000004']::uuid[]), 2, 'clear undoes set_media_location');
select is((select count(*)::int from public.media where journey_id = 'c2000000-0000-4000-8000-000000000001' and deleted_at is null and (latitude is not null or location_source is not null)), 0, 'no live row keeps a location or source');
-- roles
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated"}',true);
select is(public.set_media_location(array['c2300000-0000-4000-8000-000000000002']::uuid[], 5, 6), 1, 'editor can set location');
select is(public.clear_media_location(array['c2300000-0000-4000-8000-000000000002']::uuid[]), 1, 'editor can clear location');
select public.set_media_location(array['c2300000-0000-4000-8000-000000000002']::uuid[], 5, 6);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000d3","role":"authenticated"}',true);
select throws_ok($$ select public.clear_media_location(array['c2300000-0000-4000-8000-000000000002']::uuid[]) $$, '42501', null, 'member cannot clear location');
select is((select latitude from public.media where id = 'c2300000-0000-4000-8000-000000000002'), 5::double precision, 'member attempt changed nothing');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}',true);
select throws_ok($$ select public.clear_media_location(array['c2300000-0000-4000-8000-000000000002']::uuid[]) $$, 'P0002', null, 'stranger: not found');
reset role;
set local role anon;
select throws_ok($$ select public.clear_media_location(array['c2300000-0000-4000-8000-000000000002']::uuid[]) $$, '42501', null, 'anon cannot execute');
reset role;

select * from finish();
rollback;
