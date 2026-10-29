begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000e01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ld-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000e02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ld-viewer@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000e03','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ld-stranger@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000e01","role":"authenticated"}',true);
insert into public.journeys (id, creator_id, title, visibility, slug, home_tz)
  values ('ea000000-0000-4000-8000-000000000001', auth.uid(), 'Local day', 'private', 'ld-1', 'Europe/Prague');
insert into public.journey_members (journey_id, user_id, role)
  values ('ea000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000e02','member');
-- m1: 22:30Z on 06-05 is 00:30 on 06-06 in Prague, but the author's night makes
--     it the evening of 06-05 (the client stores that).
-- m2: no stored day; shot in Vancouver (UTC-7): 05:00Z on 06-08 is 22:00 on 06-07.
-- m3: stored day wins over any zone arithmetic.
insert into public.moments (id, journey_id, starts_at, ends_at, created_by) values
('ea200000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000001','2026-06-05T22:30:00Z','2026-06-05T23:00:00Z', auth.uid()),
('ea200000-0000-4000-8000-000000000002','ea000000-0000-4000-8000-000000000001','2026-06-08T05:00:00Z','2026-06-08T05:30:00Z', auth.uid()),
('ea200000-0000-4000-8000-000000000003','ea000000-0000-4000-8000-000000000001','2026-06-10T10:00:00Z','2026-06-10T11:00:00Z', auth.uid());
insert into public.media (id, owner_id, journey_id, kind, status, captured_at, captured_tz, moment_id)
  values ('ea300000-0000-4000-8000-000000000001', auth.uid(), 'ea000000-0000-4000-8000-000000000001', 'photo', 'ready',
          '2026-06-08T05:00:00Z', 'America/Vancouver', 'ea200000-0000-4000-8000-000000000002');
insert into public.day_notes (journey_id, local_date, body) values
  ('ea000000-0000-4000-8000-000000000001','2026-06-05','evening note'),
  ('ea000000-0000-4000-8000-000000000001','2026-06-07','vancouver note');

-- editor stores days
select is(
  public.set_moment_local_days(
    'ea000000-0000-4000-8000-000000000001',
    array['ea200000-0000-4000-8000-000000000001','ea200000-0000-4000-8000-000000000003']::uuid[],
    array['2026-06-05','2026-06-10']::date[]),
  2, 'editor stores two days');
select is(
  public.set_moment_local_days(
    'ea000000-0000-4000-8000-000000000001',
    array['ea200000-0000-4000-8000-000000000001']::uuid[],
    array['2026-06-05']::date[]),
  0, 'storing the same day again changes nothing');
select is((select local_day from public.moments where id = 'ea200000-0000-4000-8000-000000000002'), null,
  'a moment without a stored day stays NULL');

-- progress: stored day (06-05), zone fallback (Vancouver 06-07), stored (06-10)
select is((select days_total from public.journey_progress(array['ea000000-0000-4000-8000-000000000001']::uuid[])), 3,
  'three days: stored, captured_tz fallback, stored');
select is((select days_with_note from public.journey_progress(array['ea000000-0000-4000-8000-000000000001']::uuid[])), 2,
  'notes match the stored day and the captured_tz day, not home_tz midnight');

-- bad arguments
select throws_ok($$ select public.set_moment_local_days('ea000000-0000-4000-8000-000000000001',
  array['ea200000-0000-4000-8000-000000000001']::uuid[], array['2026-06-05','2026-06-06']::date[]) $$,
  '22023', null, 'unequal array lengths rejected');
select throws_ok($$ select public.set_moment_local_days(null, null, null) $$, '22023', null, 'nulls rejected');

-- a moment of another journey is not touched
select is(
  public.set_moment_local_days(
    'ea000000-0000-4000-8000-000000000001',
    array['ea200000-0000-4000-8000-0000000000ff']::uuid[], array['2026-06-05']::date[]),
  0, 'unknown moment id changes nothing');

-- read-only member
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000e02","role":"authenticated"}',true);
select throws_ok($$ select public.set_moment_local_days('ea000000-0000-4000-8000-000000000001',
  array['ea200000-0000-4000-8000-000000000001']::uuid[], array['2026-06-06']::date[]) $$,
  '42501', null, 'a read-only member cannot store days');

-- stranger
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000e03","role":"authenticated"}',true);
select throws_ok($$ select public.set_moment_local_days('ea000000-0000-4000-8000-000000000001',
  array['ea200000-0000-4000-8000-000000000001']::uuid[], array['2026-06-06']::date[]) $$,
  'P0002', null, 'a stranger gets not found');
select is((select count(*)::int from public.journey_progress(array['ea000000-0000-4000-8000-000000000001']::uuid[])), 0,
  'a stranger sees no progress');

select * from finish();
rollback;
