begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000081','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ed-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000082','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ed-viewer@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000083','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ed-other@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

-- Fixtures as the other user: journey B with a moment and two stages.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000083","role":"authenticated"}',true);
insert into public.journeys (id, creator_id, title, visibility)
  values ('b0000000-0000-4000-8000-000000000002', auth.uid(), 'Other', 'private');
insert into public.moments (id, journey_id, starts_at, ends_at, created_by)
  values ('b2000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002',
          '2026-06-01T10:00:00Z','2026-06-01T11:00:00Z', auth.uid());
insert into public.segments (id, journey_id, kind, title, starts_at, ends_at, created_by)
  values ('b1000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002','stage','OtherStage',
          '2026-06-01T00:00:00Z','2026-06-10T00:00:00Z', auth.uid());

-- Fixtures as owner of journey A.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000081","role":"authenticated"}',true);
insert into public.journeys (id, creator_id, title, visibility)
  values ('a0000000-0000-4000-8000-000000000001', auth.uid(), 'Mine', 'private');
insert into public.journey_members (journey_id, user_id, role)
  values ('a0000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000082','member');

insert into public.moments (id, journey_id, starts_at, ends_at, latitude, longitude, title, body, created_by) values
('a2000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','2026-06-03T10:00:00Z','2026-06-03T12:00:00Z', null, null, 'Target', 'tbody', auth.uid()),
('a2000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','2026-06-03T09:00:00Z','2026-06-03T11:00:00Z', 50.5, -115.5, 'Source', 'sbody', auth.uid()),
('a2000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001','2026-06-04T10:00:00Z','2026-06-04T14:00:00Z', 51.0, -116.0, 'ToSplit', 'body', auth.uid());
insert into public.media (id, owner_id, journey_id, kind, status, captured_at, moment_id) values
('a3000000-0000-4000-8000-000000000001', auth.uid(), 'a0000000-0000-4000-8000-000000000001','photo','ready','2026-06-03T10:30:00Z','a2000000-0000-4000-8000-000000000001'),
('a3000000-0000-4000-8000-000000000002', auth.uid(), 'a0000000-0000-4000-8000-000000000001','photo','ready','2026-06-03T09:30:00Z','a2000000-0000-4000-8000-000000000002'),
('a3000000-0000-4000-8000-000000000003', auth.uid(), 'a0000000-0000-4000-8000-000000000001','photo','ready','2026-06-04T10:30:00Z','a2000000-0000-4000-8000-000000000003'),
('a3000000-0000-4000-8000-000000000004', auth.uid(), 'a0000000-0000-4000-8000-000000000001','photo','ready','2026-06-04T12:00:00Z','a2000000-0000-4000-8000-000000000003'),
('a3000000-0000-4000-8000-000000000005', auth.uid(), 'a0000000-0000-4000-8000-000000000001','photo','ready','2026-06-04T13:00:00Z','a2000000-0000-4000-8000-000000000003'),
('a3000000-0000-4000-8000-000000000006', auth.uid(), 'a0000000-0000-4000-8000-000000000001','photo','ready',null,'a2000000-0000-4000-8000-000000000003');
insert into public.segments (id, journey_id, kind, trip_type, title, starts_at, ends_at, created_by) values
('a1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','stage',null,'S1','2026-06-01T00:00:00Z','2026-06-10T00:00:00Z', auth.uid()),
('a1000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','stage',null,'S2','2026-06-10T00:00:00Z','2026-06-20T00:00:00Z', auth.uid()),
('a1000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001','stage',null,'S3','2026-06-21T00:00:00Z','2026-06-30T00:00:00Z', auth.uid()),
('a1000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000001','trip','day','T1','2026-06-10T00:00:00Z','2026-06-11T00:00:00Z', auth.uid());

-- ------------------------------------------------------------ rejected origin
select lives_ok(
  $$ update public.segments set origin = 'rejected' where id = 'a1000000-0000-4000-8000-000000000003' $$,
  'segments accept origin rejected'
);
select results_eq(
  $$ select count(*)::int from public.segments where id = 'a1000000-0000-4000-8000-000000000003' $$,
  $$ values (1) $$,
  'rejected segment keeps its row'
);
select throws_ok(
  $$ update public.moments set origin = 'rejected' where id = 'a2000000-0000-4000-8000-000000000003' $$,
  '23514', null, 'moments do not accept origin rejected'
);
select lives_ok(
  $$ update public.segments set origin = 'manual' where id = 'a1000000-0000-4000-8000-000000000003' $$,
  'segment origin can be restored'
);

-- ------------------------------------------------------------ merge_moments
select throws_ok(
  $$ select public.merge_moments('a2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001') $$,
  '22023', null, 'merge with itself fails'
);
select throws_ok(
  $$ select public.merge_moments('a2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001') $$,
  'P0002', null, 'merge with a moment of an invisible journey fails'
);
select throws_ok(
  $$ select public.merge_moments('a2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-0000000000ff') $$,
  'P0002', null, 'merge with a missing moment fails'
);
select is(
  public.merge_moments('a2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002'),
  'a2000000-0000-4000-8000-000000000001'::uuid,
  'merge returns the target id'
);
select results_eq(
  $$ select starts_at, ends_at, latitude, longitude, title, body, locked, origin::text
     from public.moments where id = 'a2000000-0000-4000-8000-000000000001' $$,
  $$ values ('2026-06-03T09:00:00Z'::timestamptz, '2026-06-03T12:00:00Z'::timestamptz,
             50.5::double precision, -115.5::double precision, 'Target'::text, 'tbody'::text,
             true, 'manual'::text) $$,
  'merged range is the union, coordinates fall back to source, text and flags set'
);
select results_eq(
  $$ select count(*)::int from public.media
     where moment_id = 'a2000000-0000-4000-8000-000000000001' $$,
  $$ values (2) $$,
  'media of both moments are now on the target'
);
select results_eq(
  $$ select count(*)::int from public.moments where id = 'a2000000-0000-4000-8000-000000000002' $$,
  $$ values (0) $$,
  'source moment is deleted'
);

-- ------------------------------------------------------------ split_moment
select throws_ok(
  $$ select public.split_moment('a2000000-0000-4000-8000-000000000003','2026-06-04T10:00:00Z','a2000000-0000-4000-8000-0000000000a1') $$,
  '22023', null, 'split at the start fails'
);
select throws_ok(
  $$ select public.split_moment('a2000000-0000-4000-8000-000000000003','2026-06-04T14:00:01Z','a2000000-0000-4000-8000-0000000000a1') $$,
  '22023', null, 'split after the end fails'
);
select throws_ok(
  $$ select public.split_moment('a2000000-0000-4000-8000-000000000003',null,'a2000000-0000-4000-8000-0000000000a1') $$,
  '22023', null, 'split without time fails'
);
select throws_ok(
  $$ select public.split_moment('b2000000-0000-4000-8000-000000000001','2026-06-01T10:30:00Z','a2000000-0000-4000-8000-0000000000a1') $$,
  'P0002', null, 'split of another journey moment fails'
);
select is(
  public.split_moment('a2000000-0000-4000-8000-000000000003','2026-06-04T12:00:00Z','a2000000-0000-4000-8000-0000000000a1'),
  'a2000000-0000-4000-8000-0000000000a1'::uuid,
  'split returns the new id'
);
select results_eq(
  $$ select id::text, starts_at, ends_at, title, locked, origin::text
     from public.moments where id in ('a2000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-0000000000a1')
     order by starts_at $$,
  $$ values ('a2000000-0000-4000-8000-000000000003'::text, '2026-06-04T10:00:00Z'::timestamptz, '2026-06-04T12:00:00Z'::timestamptz, 'ToSplit'::text, true, 'manual'::text),
            ('a2000000-0000-4000-8000-0000000000a1'::text, '2026-06-04T12:00:00Z'::timestamptz, '2026-06-04T14:00:00Z'::timestamptz, null::text, true, 'manual'::text) $$,
  'ranges are [start,at] and [at,end]; both locked and manual; title stays'
);
select results_eq(
  $$ select id::text from public.media where moment_id = 'a2000000-0000-4000-8000-0000000000a1' order by id $$,
  $$ values ('a3000000-0000-4000-8000-000000000004'::text), ('a3000000-0000-4000-8000-000000000005'::text) $$,
  'media captured at or after the split move to the new moment'
);
select results_eq(
  $$ select id::text from public.media where moment_id = 'a2000000-0000-4000-8000-000000000003' order by id $$,
  $$ values ('a3000000-0000-4000-8000-000000000003'::text), ('a3000000-0000-4000-8000-000000000006'::text) $$,
  'earlier media and media without capture time stay'
);
select results_eq(
  $$ select created_by::text, journey_id::text from public.moments where id = 'a2000000-0000-4000-8000-0000000000a1' $$,
  $$ values ('00000000-0000-4000-8000-000000000081'::text, 'a0000000-0000-4000-8000-000000000001'::text) $$,
  'new moment is created by the caller in the same journey'
);
select throws_ok(
  $$ select public.split_moment('a2000000-0000-4000-8000-0000000000a1','2026-06-04T13:00:00Z','a2000000-0000-4000-8000-0000000000a1') $$,
  '23505', null, 'split with an existing new id fails'
);
select lives_ok(
  $$ select public.split_moment('a2000000-0000-4000-8000-0000000000a1','2026-06-04T14:00:00Z','a2000000-0000-4000-8000-0000000000a2') $$,
  'split exactly at the end is allowed (zero-length tail)'
);

-- ------------------------------------------------------ move_segment_boundary
select throws_ok(
  $$ select public.move_segment_boundary('a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003','2026-06-12T00:00:00Z') $$,
  '22023', null, 'non-adjacent segments fail'
);
select throws_ok(
  $$ select public.move_segment_boundary('a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000004','2026-06-10T12:00:00Z') $$,
  '22023', null, 'different kinds fail'
);
select throws_ok(
  $$ select public.move_segment_boundary('a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','2026-06-05T00:00:00Z') $$,
  'P0002', null, 'segment of an invisible journey fails'
);
select throws_ok(
  $$ select public.move_segment_boundary('a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','2026-06-01T00:00:00Z') $$,
  '22023', null, 'boundary at the start of the first segment fails'
);
select throws_ok(
  $$ select public.move_segment_boundary('a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','2026-06-20T00:00:00Z') $$,
  '22023', null, 'boundary at the end of the second segment fails'
);
select throws_ok(
  $$ select public.move_segment_boundary('a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','2026-06-05T00:00:00Z') $$,
  '22023', null, 'same segment twice fails'
);
select lives_ok(
  $$ select public.move_segment_boundary('a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','2026-06-12T00:00:00Z') $$,
  'adjacent stages move their boundary'
);
select results_eq(
  $$ select id::text, starts_at, ends_at from public.segments
     where id in ('a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002') order by id $$,
  $$ values ('a1000000-0000-4000-8000-000000000001'::text, '2026-06-01T00:00:00Z'::timestamptz, '2026-06-12T00:00:00Z'::timestamptz),
            ('a1000000-0000-4000-8000-000000000002'::text, '2026-06-12T00:00:00Z'::timestamptz, '2026-06-20T00:00:00Z'::timestamptz) $$,
  'both segments share the new boundary'
);

-- ------------------------------------------------------------ read-only member
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000082","role":"authenticated"}',true);
select throws_ok(
  $$ select public.merge_moments('a2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003') $$,
  '42501', null, 'read-only member cannot merge'
);
select throws_ok(
  $$ select public.split_moment('a2000000-0000-4000-8000-000000000001','2026-06-03T10:00:00Z','a2000000-0000-4000-8000-0000000000b1') $$,
  '42501', null, 'read-only member cannot split'
);
select throws_ok(
  $$ select public.move_segment_boundary('a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','2026-06-13T00:00:00Z') $$,
  '42501', null, 'read-only member cannot move a boundary'
);

-- ------------------------------------------------------------ stranger
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000083","role":"authenticated"}',true);
select throws_ok(
  $$ select public.merge_moments('a2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003') $$,
  'P0002', null, 'non-member cannot see moments to merge'
);

-- ------------------------------------------------------------ anon
reset role;
set local role anon;
select throws_ok(
  $$ select public.merge_moments('a2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003') $$,
  '42501', null, 'anon cannot execute merge_moments'
);
select throws_ok(
  $$ select public.split_moment('a2000000-0000-4000-8000-000000000001','2026-06-03T10:00:00Z','a2000000-0000-4000-8000-0000000000b1') $$,
  '42501', null, 'anon cannot execute split_moment'
);
select throws_ok(
  $$ select public.move_segment_boundary('a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','2026-06-13T00:00:00Z') $$,
  '42501', null, 'anon cannot execute move_segment_boundary'
);

select * from finish();
rollback;
