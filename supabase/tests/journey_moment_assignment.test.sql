begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

select has_function(
  'public',
  'upsert_journey_moment_assignment',
  array[
    'uuid',
    'uuid',
    'uuid',
    'uuid',
    'text',
    'double precision',
    'double precision'
  ],
  'atomic journey moment assignment RPC exists'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-4000-8000-000000000071','00000000-0000-0000-0000-000000000000','authenticated','authenticated','moment-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('00000000-0000-4000-8000-000000000072','00000000-0000-0000-0000-000000000000','authenticated','authenticated','moment-stranger@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

insert into public.entries (id, creator_id, type, title)
values ('72000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000072', 'place', 'Stranger moment');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000071","role":"authenticated"}',
  true
);

insert into public.journeys (id, creator_id, title, visibility)
values
  ('70000000-0000-4000-8000-000000000001', auth.uid(), 'Atomic journey', 'private'),
  ('70000000-0000-4000-8000-000000000002', auth.uid(), 'Other journey', 'private');

insert into public.journey_stages (id, journey_id, creator_id, title, position)
values
  ('71000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', auth.uid(), 'Correct stage', 0),
  ('71000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', auth.uid(), 'Wrong stage', 0);

insert into public.journey_stops (id, journey_id, creator_id, title, status, position)
values ('73000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', auth.uid(), 'Wrong stop', 'planned', 0);

insert into public.entries (id, creator_id, type, title, event_at)
values
  ('72000000-0000-4000-8000-000000000001', auth.uid(), 'place', 'Lake Louise', '2026-06-12 10:00:00+00'),
  ('72000000-0000-4000-8000-000000000002', auth.uid(), 'place', 'Mismatch', null),
  ('72000000-0000-4000-8000-000000000003', auth.uid(), 'place', 'Invalid GPS', null);

select results_eq(
  $$ select public.upsert_journey_moment_assignment(
    '72000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    null,
    51.4254,
    -116.1773
  ) $$,
  $$ values ('73000000-0000-4000-8000-000000000001'::uuid) $$,
  'member atomically assigns a located journey moment and receives stop id'
);

reset role;

select results_eq(
  $$ select journey_id, stage_id, stop_id
     from public.entry_journey_links
     where entry_id = '72000000-0000-4000-8000-000000000001' $$,
  $$ values (
    '70000000-0000-4000-8000-000000000001'::uuid,
    '71000000-0000-4000-8000-000000000001'::uuid,
    '73000000-0000-4000-8000-000000000001'::uuid
  ) $$,
  'link points to the requested journey, stage, and stop'
);

select results_eq(
  $$ select status, latitude, longitude, map_latitude, map_longitude
     from public.journey_stops
     where id = '73000000-0000-4000-8000-000000000001' $$,
  $$ values ('visited'::public.journey_stop_status, 51.4254::double precision, (-116.1773)::double precision, 51.43::double precision, (-116.18)::double precision) $$,
  'visited stop stores exact and map coordinates'
);

select results_eq(
  $$ select title, visited_at
     from public.journey_stops
     where id = '73000000-0000-4000-8000-000000000001' $$,
  $$ values ('Lake Louise'::text, '2026-06-12 10:00:00+00'::timestamptz) $$,
  'created stop inherits entry title and event time'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000071","role":"authenticated"}',
  true
);

select throws_ok(
  $$ select public.upsert_journey_moment_assignment(
    '72000000-0000-4000-8000-000000000002',
    '70000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000002'
  ) $$,
  '23503',
  'stage does not belong to journey',
  'stage from another journey is rejected'
);

select is(
  (select count(*) from public.entry_journey_links where entry_id = '72000000-0000-4000-8000-000000000002'),
  0::bigint,
  'failed stage validation leaves no link'
);

select results_eq(
  $$ select public.upsert_journey_moment_assignment(
    '72000000-0000-4000-8000-000000000002',
    '70000000-0000-4000-8000-000000000001',
    null,
    null,
    null,
    null,
    null
  ) $$,
  $$ values (null::uuid) $$,
  'assignment without location returns null stop id'
);

select is(
  (select count(*) from public.entry_journey_links where entry_id = '72000000-0000-4000-8000-000000000002' and stop_id is null),
  1::bigint,
  'assignment without location still creates journey link'
);

select throws_ok(
  $$ select public.upsert_journey_moment_assignment(
    '72000000-0000-4000-8000-000000000003',
    '70000000-0000-4000-8000-000000000001',
    null,
    null,
    null,
    'NaN'::double precision,
    15
  ) $$,
  '22023',
  'invalid exact coordinates',
  'invalid GPS is rejected'
);

select is(
  (select count(*) from public.entry_journey_links where entry_id = '72000000-0000-4000-8000-000000000003'),
  0::bigint,
  'invalid GPS leaves no link'
);

reset role;

insert into public.spaces (
  id,
  kind,
  handle,
  name,
  created_by
) values (
  '74000000-0000-4000-8000-000000000001',
  'family',
  'atomic-other-space',
  'Other publishing space',
  '00000000-0000-4000-8000-000000000071'
);

insert into public.space_members (space_id, user_id, role)
values (
  '74000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000071',
  'owner'
);

update public.journeys
set space_id = '74000000-0000-4000-8000-000000000001'
where id = '70000000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000071","role":"authenticated"}',
  true
);

select throws_ok(
  $$ select public.upsert_journey_moment_assignment(
    '72000000-0000-4000-8000-000000000003',
    '70000000-0000-4000-8000-000000000002'
  ) $$,
  '23514',
  'entry and journey must share publishing space',
  'entry cannot be assigned across publishing spaces'
);

select is(
  (select count(*) from public.entry_journey_links where entry_id = '72000000-0000-4000-8000-000000000003'),
  0::bigint,
  'space mismatch leaves no link'
);

select throws_ok(
  $$ select public.upsert_journey_moment_assignment(
    '72000000-0000-4000-8000-000000000003',
    '70000000-0000-4000-8000-000000000001',
    null,
    '73000000-0000-4000-8000-000000000002'
  ) $$,
  '23503',
  'stop does not belong to journey',
  'stop from another journey is rejected'
);

select lives_ok(
  $$ select public.upsert_journey_moment_assignment(
    '72000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    null,
    51.4254,
    -116.1773
  ) $$,
  'identical retry succeeds'
);

select is(
  (select count(*) from public.entry_journey_links where entry_id = '72000000-0000-4000-8000-000000000001'),
  1::bigint,
  'retry keeps one journey link'
);

select is(
  (select count(*) from public.journey_stops where id = '73000000-0000-4000-8000-000000000001'),
  1::bigint,
  'retry keeps one visited stop'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000072","role":"authenticated"}',
  true
);

select throws_ok(
  $$ select public.upsert_journey_moment_assignment(
    '72000000-0000-4000-8000-000000000004',
    '70000000-0000-4000-8000-000000000001'
  ) $$,
  '42501',
  'journey membership required',
  'non-member cannot assign a moment to journey'
);

select throws_ok(
  $$ select public.upsert_journey_moment_assignment(
    '72000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001'
  ) $$,
  '42501',
  'entry is unavailable or not owned by the current user',
  'non-owner cannot assign another user entry'
);

select is(
  has_function_privilege('anon', 'public.upsert_journey_moment_assignment(uuid,uuid,uuid,uuid,text,double precision,double precision)', 'EXECUTE'),
  false,
  'anonymous role cannot execute assignment RPC'
);

select * from finish();
rollback;
