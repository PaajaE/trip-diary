begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000f61','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zs-day@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

-- ---- local_day: 04:00 boundary --------------------------------------------
-- Prague is UTC+2 in June.
select is(public.local_day('2026-06-10T22:40:00Z', 'Europe/Prague'), '2026-06-10'::date, '00:40 local belongs to the previous day');
select is(public.local_day('2026-06-11T01:59:00Z', 'Europe/Prague'), '2026-06-10'::date, '03:59 local is still the previous day');
select is(public.local_day('2026-06-11T02:00:00Z', 'Europe/Prague'), '2026-06-11'::date, '04:00 local starts the new day');
select is(public.local_day('2026-06-10T22:00:00Z', 'Europe/Prague'), '2026-06-10'::date, '00:00 local belongs to the previous day');
select is(public.local_day('2026-06-10T21:59:00Z', 'Europe/Prague'), '2026-06-10'::date, '23:59 local is the same day');
select is(public.local_day('2026-06-10T03:59:00Z', 'UTC'), '2026-06-09'::date, 'UTC works the same');
-- Date line: the same instant is a different day on each side.
select is(public.local_day('2026-06-11T13:59:00Z', 'Pacific/Auckland'), '2026-06-11'::date, 'date line: Auckland (UTC+12) 01:59 on 06-12 is day 06-11');
select is(public.local_day('2026-06-11T13:59:00Z', 'Pacific/Honolulu'), '2026-06-10'::date, 'date line: Honolulu (UTC-10) 03:59 on 06-11 is day 06-10');
select is(public.local_day('2026-06-11T14:00:00Z', 'Pacific/Honolulu'), '2026-06-11'::date, 'date line: Honolulu 04:00 starts day 06-11');
select ok((select provolatile = 'i' from pg_proc where oid = 'public.local_day(timestamptz, text)'::regprocedure), 'local_day is immutable');

-- ---- pick_local_day (pure) --------------------------------------------------
select is(public.pick_local_day('2026-06-10T22:40:00Z', 'Europe/Prague', '{}'::date[], '{}'::text[]), '2026-06-10'::date, 'no photo days: falls back to home_tz');
select is(public.pick_local_day('2026-06-10T22:40:00Z', null, '{}'::date[], '{}'::text[]), '2026-06-10'::date, 'no home_tz: falls back to UTC (22:40 UTC is 06-10)');
select is(public.pick_local_day('2026-06-11T03:00:00Z', 'Europe/Prague', array['2026-06-10']::date[], array['America/Edmonton']), '2026-06-10'::date, 'tz crossing: photo-day zone Edmonton (21:00 on 06-10) wins over home_tz');
select is(public.pick_local_day('2026-06-11T03:00:00Z', 'Europe/Prague', '{}'::date[], '{}'::text[]), '2026-06-11'::date, 'tz crossing: without photo days home_tz gives 06-11');
select is(public.pick_local_day('2026-06-20T10:00:00Z', 'Europe/Prague', array['2026-06-10']::date[], array['America/Edmonton']), '2026-06-20'::date, 'instant outside any photo day falls back to home_tz');
select is(public.pick_local_day(null, 'Europe/Prague', array['2026-06-10']::date[], array['America/Edmonton']), null, 'null instant gives null');

-- ---- journey_day_zones and consumers ---------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000f61","role":"authenticated"}',true);
insert into public.journeys (id, creator_id, title, visibility, home_tz) values
('f6000000-0000-4000-8000-000000000001', auth.uid(), 'Zones', 'private', 'Europe/Prague'),
('f6000000-0000-4000-8000-000000000002', auth.uid(), 'No photos', 'private', 'Europe/Prague');
insert into public.media (id, owner_id, journey_id, kind, status, captured_at, captured_tz) values
-- 06-10: three photos in Edmonton (10:00 local), one without zone (home Prague 18:30): majority Edmonton
('f6300000-0000-4000-8000-000000000001', auth.uid(), 'f6000000-0000-4000-8000-000000000001','photo','ready','2026-06-10T16:00:00Z','America/Edmonton'),
('f6300000-0000-4000-8000-000000000002', auth.uid(), 'f6000000-0000-4000-8000-000000000001','photo','ready','2026-06-10T16:10:00Z','America/Edmonton'),
('f6300000-0000-4000-8000-000000000003', auth.uid(), 'f6000000-0000-4000-8000-000000000001','photo','ready','2026-06-10T16:20:00Z','America/Edmonton'),
('f6300000-0000-4000-8000-000000000004', auth.uid(), 'f6000000-0000-4000-8000-000000000001','photo','ready','2026-06-10T16:30:00Z', null),
-- 06-12: one photo without zone (home Prague)
('f6300000-0000-4000-8000-000000000005', auth.uid(), 'f6000000-0000-4000-8000-000000000001','photo','ready','2026-06-12T10:00:00Z', null),
-- 06-13: pending photo is ignored
('f6300000-0000-4000-8000-000000000006', auth.uid(), 'f6000000-0000-4000-8000-000000000001','photo','pending','2026-06-13T10:00:00Z','Asia/Tokyo'),
-- 06-14: tie Prague (14:00) vs Edmonton (06:00): alphabetically first zone wins
('f6300000-0000-4000-8000-000000000007', auth.uid(), 'f6000000-0000-4000-8000-000000000001','photo','ready','2026-06-14T12:00:00Z','Europe/Prague'),
('f6300000-0000-4000-8000-000000000008', auth.uid(), 'f6000000-0000-4000-8000-000000000001','photo','ready','2026-06-14T12:00:00Z','America/Edmonton'),
-- undated photo is ignored
('f6300000-0000-4000-8000-000000000009', auth.uid(), 'f6000000-0000-4000-8000-000000000001','photo','ready', null, 'Asia/Tokyo');
insert into public.moments (id, journey_id, starts_at, ends_at, created_by) values
-- Edmonton 21:00 on 06-10 (Prague alone would say 06-11)
('f6200000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000001','2026-06-11T03:00:00Z','2026-06-11T03:30:00Z', auth.uid()),
-- Edmonton 16:40 on 06-10 (Prague alone would say 06-10 00:40 -> 06-10 as well)
('f6200000-0000-4000-8000-000000000002','f6000000-0000-4000-8000-000000000001','2026-06-10T22:40:00Z','2026-06-10T23:00:00Z', auth.uid()),
-- Edmonton 20:00 on 06-11 is not a photo day: home Prague 04:00 on 06-12 starts day 06-12
('f6200000-0000-4000-8000-000000000003','f6000000-0000-4000-8000-000000000001','2026-06-12T02:00:00Z','2026-06-12T02:30:00Z', auth.uid());
insert into public.day_notes (journey_id, local_date, body) values
('f6000000-0000-4000-8000-000000000001','2026-06-10','note');

reset role;
select is((select dates from public.journey_day_zones('f6000000-0000-4000-8000-000000000001')), array['2026-06-10','2026-06-12','2026-06-14']::date[], 'journey_day_zones: only ready dated photos make days');
select is((select tzs from public.journey_day_zones('f6000000-0000-4000-8000-000000000001')), array['America/Edmonton','Europe/Prague','America/Edmonton'], 'journey_day_zones: majority zone, home_tz for photos without zone, tie to the first zone name');
select is((select dates from public.journey_day_zones('f6000000-0000-4000-8000-000000000002')), '{}'::date[], 'journey without photos: no photo days (fallback to home_tz happens in pick_local_day)');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000f61","role":"authenticated"}',true);
select is((select days_total from public.journey_progress(array['f6000000-0000-4000-8000-000000000001']::uuid[])), 2, 'journey_progress: moments at 21:00 and 16:40 Edmonton share day 06-10, third is 06-12');
select is((select days_with_note from public.journey_progress(array['f6000000-0000-4000-8000-000000000001']::uuid[])), 1, 'journey_progress: note on 06-10 counts');
reset role;

select * from finish();
rollback;
