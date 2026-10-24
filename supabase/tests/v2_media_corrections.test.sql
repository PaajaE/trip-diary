begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-0000000000f1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mc-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-0000000000f2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mc-editor@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-0000000000f3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mc-member@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-0000000000f4','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mc-stranger@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

-- owner f01, editor f02, member (read-only) f03, stranger f04
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}',true);
insert into public.journeys (id, creator_id, title, visibility)
  values ('b2000000-0000-4000-8000-000000000001', auth.uid(), 'Corrections', 'private');
insert into public.journey_members (journey_id, user_id, role) values
('b2000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000f2','editor'),
('b2000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000f3','member');
insert into public.moments (id, journey_id, starts_at, ends_at, created_by)
  values ('b2200000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','2026-06-01T09:00:00Z','2026-06-01T12:00:00Z', auth.uid());
insert into public.media (id, owner_id, journey_id, kind, status, captured_at, captured_tz, hide_location, moment_id) values
('b2300000-0000-4000-8000-000000000001', auth.uid(), 'b2000000-0000-4000-8000-000000000001','photo','ready','2026-06-01T10:00:00Z','Europe/Prague', false, 'b2200000-0000-4000-8000-000000000001'),
('b2300000-0000-4000-8000-000000000002', auth.uid(), 'b2000000-0000-4000-8000-000000000001','photo','ready','2026-06-01T11:00:00Z','Europe/Prague', true, null),
('b2300000-0000-4000-8000-000000000003', auth.uid(), 'b2000000-0000-4000-8000-000000000001','photo','ready',null,null, false, null),
('b2300000-0000-4000-8000-000000000004', auth.uid(), 'b2000000-0000-4000-8000-000000000001','photo','ready','2026-06-01T12:00:00Z',null, false, null);
select public.trash_media(array['b2300000-0000-4000-8000-000000000004']::uuid[]);

-- direct writes and constraints
select throws_ok($$ update public.media set captured_at_source = 'manual' where id = 'b2300000-0000-4000-8000-000000000001' $$, '42501', null, 'captured_at_source not writable directly');
select throws_ok($$ update public.media set location_source = 'manual' where id = 'b2300000-0000-4000-8000-000000000001' $$, '42501', null, 'location_source not writable directly');
select lives_ok($$ insert into public.media (id, owner_id, journey_id, kind, status, captured_at, captured_at_source, location_source)
  values ('b2300000-0000-4000-8000-000000000005', auth.uid(), 'b2000000-0000-4000-8000-000000000001','photo','ready','2026-06-02T10:00:00Z','exif','exif') $$, 'importer records the source at insert');
select throws_ok($$ insert into public.media (id, owner_id, journey_id, kind, status, captured_at_source)
  values ('b2300000-0000-4000-8000-000000000006', auth.uid(), 'b2000000-0000-4000-8000-000000000001','photo','ready','camera') $$, '23514', null, 'unknown captured_at_source rejected');
select throws_ok($$ insert into public.media (id, owner_id, journey_id, kind, status, location_source)
  values ('b2300000-0000-4000-8000-000000000007', auth.uid(), 'b2000000-0000-4000-8000-000000000001','photo','ready','gps') $$, '23514', null, 'gps is not a location_source');
select is((select captured_at_source is null and location_source is null from public.media where id = 'b2300000-0000-4000-8000-000000000001'), true, 'sources stay NULL when not provided');
-- shift_media_time
select is(public.shift_media_time(array['b2300000-0000-4000-8000-000000000001','b2300000-0000-4000-8000-000000000002','b2300000-0000-4000-8000-000000000003','b2300000-0000-4000-8000-000000000004']::uuid[], 3600), 2, 'shift: null captured_at and trashed rows are skipped');
select is((select captured_at from public.media where id = 'b2300000-0000-4000-8000-000000000001'), '2026-06-01T11:00:00Z'::timestamptz, 'captured_at moved by delta');
select is((select captured_at_source from public.media where id = 'b2300000-0000-4000-8000-000000000001'), 'manual', 'source set to manual');
select is((select captured_at_source is null and captured_at is null from public.media where id = 'b2300000-0000-4000-8000-000000000003'), true, 'row without captured_at untouched');
select is((select captured_tz || moment_id::text from public.media where id = 'b2300000-0000-4000-8000-000000000001'), 'Europe/Pragueb2200000-0000-4000-8000-000000000001', 'captured_tz and moment_id unchanged');
select is((select captured_at from public.media where id = 'b2300000-0000-4000-8000-000000000004'), '2026-06-01T12:00:00Z'::timestamptz, 'trashed row untouched');
select is(public.shift_media_time(array['b2300000-0000-4000-8000-000000000001','b2300000-0000-4000-8000-000000000002']::uuid[], 0), 0, 'zero delta changes nothing');
select is(public.shift_media_time(array['b2300000-0000-4000-8000-000000000001','b2300000-0000-4000-8000-000000000002']::uuid[], -3600), 2, 'negative delta moves back');
select is((select captured_at from public.media where id = 'b2300000-0000-4000-8000-000000000001'), '2026-06-01T10:00:00Z'::timestamptz, 'round trip restores captured_at');
select is(public.shift_media_time(array['b2300000-0000-4000-8000-000000000001','b2300000-0000-4000-8000-000000000002']::uuid[], 31622400), 2, 'boundary delta 31622400 is accepted');
select is(public.shift_media_time(array['b2300000-0000-4000-8000-000000000001','b2300000-0000-4000-8000-000000000002']::uuid[], -31622400), 2, 'boundary delta -31622400 is accepted');
select throws_ok($$ select public.shift_media_time(array['b2300000-0000-4000-8000-000000000001','b2300000-0000-4000-8000-000000000002']::uuid[], 31622401) $$, '22023', null, 'delta above the limit rejected');
select throws_ok($$ select public.shift_media_time(array['b2300000-0000-4000-8000-000000000001','b2300000-0000-4000-8000-000000000002']::uuid[], -31622401) $$, '22023', null, 'delta below the limit rejected');
select throws_ok($$ select public.shift_media_time(array['b2300000-0000-4000-8000-000000000001','b2300000-0000-4000-8000-000000000002']::uuid[], null) $$, '22023', null, 'null delta rejected');
select is(public.shift_media_time(array[]::uuid[], 60), 0, 'empty id list changes nothing');
-- set_media_location
select is(public.set_media_location(array['b2300000-0000-4000-8000-000000000001','b2300000-0000-4000-8000-000000000002','b2300000-0000-4000-8000-000000000003','b2300000-0000-4000-8000-000000000004']::uuid[], 48.2, 16.4), 3, 'location set; trashed row ignored');
select is((select latitude || ',' || longitude || ',' || location_source from public.media where id = 'b2300000-0000-4000-8000-000000000001'), '48.2,16.4,manual', 'coordinates and source stored');
select is((select hide_location from public.media where id = 'b2300000-0000-4000-8000-000000000002'), true, 'hide_location untouched');
select is(public.set_media_location(array['b2300000-0000-4000-8000-000000000001','b2300000-0000-4000-8000-000000000002','b2300000-0000-4000-8000-000000000003','b2300000-0000-4000-8000-000000000004']::uuid[], 48.2, 16.4), 0, 'idempotent: second call changes nothing');
select is((select latitude is null from public.media where id = 'b2300000-0000-4000-8000-000000000004'), true, 'trashed row untouched');
select throws_ok($$ select public.set_media_location(array['b2300000-0000-4000-8000-000000000001']::uuid[], 90.5, 16.4) $$, '22023', null, 'latitude above 90 rejected');
select throws_ok($$ select public.set_media_location(array['b2300000-0000-4000-8000-000000000001']::uuid[], 48.2, -180.5) $$, '22023', null, 'longitude below -180 rejected');
select throws_ok($$ select public.set_media_location(array['b2300000-0000-4000-8000-000000000001']::uuid[], 'NaN'::double precision, 16.4) $$, '22023', null, 'NaN rejected');
select throws_ok($$ select public.set_media_location(array['b2300000-0000-4000-8000-000000000001']::uuid[], null, null) $$, '22023', null, 'null coordinates rejected');
select is(public.set_media_location(array['b2300000-0000-4000-8000-000000000001']::uuid[], 90, -180), 1, 'boundary coordinates accepted');
-- roles
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000f2","role":"authenticated"}',true);
select is(public.shift_media_time(array['b2300000-0000-4000-8000-000000000001','b2300000-0000-4000-8000-000000000002']::uuid[], 60), 2, 'editor can shift');
select is(public.set_media_location(array['b2300000-0000-4000-8000-000000000001']::uuid[], 10, 20), 1, 'editor can set location');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000f3","role":"authenticated"}',true);
select throws_ok($$ select public.shift_media_time(array['b2300000-0000-4000-8000-000000000001']::uuid[], 60) $$, '42501', null, 'member cannot shift');
select throws_ok($$ select public.set_media_location(array['b2300000-0000-4000-8000-000000000001']::uuid[], 10, 20) $$, '42501', null, 'member cannot set location');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000f4","role":"authenticated"}',true);
select throws_ok($$ select public.shift_media_time(array['b2300000-0000-4000-8000-000000000001']::uuid[], 60) $$, 'P0002', null, 'stranger: not found (shift)');
select throws_ok($$ select public.set_media_location(array['b2300000-0000-4000-8000-000000000001']::uuid[], 10, 20) $$, 'P0002', null, 'stranger: not found (location)');
reset role;
set local role anon;
select throws_ok($$ select public.shift_media_time(array['b2300000-0000-4000-8000-000000000001']::uuid[], 60) $$, '42501', null, 'anon cannot shift');
select throws_ok($$ select public.set_media_location(array['b2300000-0000-4000-8000-000000000001']::uuid[], 10, 20) $$, '42501', null, 'anon cannot set location');
reset role;

select * from finish();
rollback;
