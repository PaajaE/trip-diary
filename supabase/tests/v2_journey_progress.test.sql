begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000a01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','jp-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000a02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','jp-editor@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000a03','00000000-0000-0000-0000-000000000000','authenticated','authenticated','jp-member@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000a04','00000000-0000-0000-0000-000000000000','authenticated','authenticated','jp-stranger@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

-- owner a01, editor a02, member (read-only) a03, stranger a04
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000a01","role":"authenticated"}',true);
insert into public.journeys (id, creator_id, title, visibility, home_tz) values
('b3000000-0000-4000-8000-000000000001', auth.uid(), 'Progress', 'private', 'Europe/Prague'),
('b3000000-0000-4000-8000-000000000003', auth.uid(), 'Empty', 'private', null);
insert into public.journey_members (journey_id, user_id, role) values
('b3000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000a02','editor'),
('b3000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000a03','member');
insert into public.moments (id, journey_id, starts_at, ends_at, published, created_by) values
('b3200000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','2026-06-03T10:00:00Z','2026-06-03T11:00:00Z', true, auth.uid()),
('b3200000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000001','2026-06-03T15:00:00Z','2026-06-03T16:00:00Z', true, auth.uid()),
('b3200000-0000-4000-8000-000000000003','b3000000-0000-4000-8000-000000000001','2026-06-04T10:00:00Z','2026-06-04T11:00:00Z', false, auth.uid()),
-- 22:30Z on 06-05 is 00:30 on 06-06 in Prague
('b3200000-0000-4000-8000-000000000004','b3000000-0000-4000-8000-000000000001','2026-06-05T22:30:00Z','2026-06-05T23:00:00Z', true, auth.uid());
insert into public.day_notes (journey_id, local_date, body) values
('b3000000-0000-4000-8000-000000000001','2026-06-03','a'), ('b3000000-0000-4000-8000-000000000001','2026-06-04','b'), ('b3000000-0000-4000-8000-000000000001','2026-06-05','c');
insert into public.media (id, owner_id, journey_id, kind, status, captured_at, starred) values
('b3300000-0000-4000-8000-000000000001', auth.uid(), 'b3000000-0000-4000-8000-000000000001','photo','ready','2026-06-03T10:00:00Z', true),
('b3300000-0000-4000-8000-000000000002', auth.uid(), 'b3000000-0000-4000-8000-000000000001','photo','ready','2026-06-03T10:05:00Z', false),
('b3300000-0000-4000-8000-000000000003', auth.uid(), 'b3000000-0000-4000-8000-000000000001','photo','ready','2026-06-03T10:10:00Z', false),
('b3300000-0000-4000-8000-000000000004', auth.uid(), 'b3000000-0000-4000-8000-000000000001','photo','pending','2026-06-03T10:15:00Z', true),
('b3300000-0000-4000-8000-000000000005', auth.uid(), 'b3000000-0000-4000-8000-000000000001','photo','ready','2026-06-03T10:20:00Z', true);
select public.trash_media(array['b3300000-0000-4000-8000-000000000005']::uuid[]);
select public.mark_media_reviewed(array['b3300000-0000-4000-8000-000000000001']::uuid[]);
update public.journeys set cover_media_id = 'b3300000-0000-4000-8000-000000000001' where id = 'b3000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000a04","role":"authenticated"}',true);
insert into public.journeys (id, creator_id, title, visibility)
  values ('b3000000-0000-4000-8000-000000000002', auth.uid(), 'Foreign', 'private');
insert into public.media (id, owner_id, journey_id, kind, status, captured_at)
  values ('b3300000-0000-4000-8000-0000000000f1', auth.uid(), 'b3000000-0000-4000-8000-000000000002','photo','ready','2026-06-03T10:00:00Z');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000a01","role":"authenticated"}',true);

select is((select days_total from public.journey_progress(array['b3000000-0000-4000-8000-000000000001']::uuid[])), 3, 'days_total: distinct local days in home_tz (unpublished moment counts)');
select is((select days_with_note from public.journey_progress(array['b3000000-0000-4000-8000-000000000001']::uuid[])), 2, 'days_with_note: only notes on days with a moment (Prague)');
select is((select media_total from public.journey_progress(array['b3000000-0000-4000-8000-000000000001']::uuid[])), 3, 'media_total: ready and not trashed only');
select is((select media_unreviewed from public.journey_progress(array['b3000000-0000-4000-8000-000000000001']::uuid[])), 2, 'media_unreviewed excludes reviewed');
select is((select starred from public.journey_progress(array['b3000000-0000-4000-8000-000000000001']::uuid[])), 1, 'starred ignores trashed and not-ready media');
select is((select cover_media_id from public.journey_progress(array['b3000000-0000-4000-8000-000000000001']::uuid[])), 'b3300000-0000-4000-8000-000000000001'::uuid, 'cover_media_id comes from the journey');
select is((select days_total + days_with_note + media_total + media_unreviewed + starred from public.journey_progress(array['b3000000-0000-4000-8000-000000000003']::uuid[])), 0, 'empty journey: all counters zero');
select is((select cover_media_id from public.journey_progress(array['b3000000-0000-4000-8000-000000000003']::uuid[])), null, 'empty journey: no cover');
select is((select count(*)::int from public.journey_progress(array['b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000003']::uuid[])), 2, 'journeys the caller does not belong to are omitted');
select is((select count(*)::int from public.journey_progress(array['b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001']::uuid[])), 1, 'duplicate ids return one row');
select is((select count(*)::int from public.journey_progress(null)), 0, 'null array returns nothing');
select is((select count(*)::int from public.journey_progress(array[]::uuid[])), 0, 'empty array returns nothing');
-- home_tz changes the day boundary
update public.journeys set home_tz = 'UTC' where id = 'b3000000-0000-4000-8000-000000000001';
select is((select days_total from public.journey_progress(array['b3000000-0000-4000-8000-000000000001']::uuid[])), 3, 'UTC: days are 06-03, 06-04, 06-05');
select is((select days_with_note from public.journey_progress(array['b3000000-0000-4000-8000-000000000001']::uuid[])), 3, 'UTC: note on 06-05 now has a moment that day');
-- roles
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000a02","role":"authenticated"}',true);
select is((select media_total from public.journey_progress(array['b3000000-0000-4000-8000-000000000001']::uuid[])), 3, 'editor sees progress');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000a03","role":"authenticated"}',true);
select is((select media_unreviewed from public.journey_progress(array['b3000000-0000-4000-8000-000000000001']::uuid[])), 2, 'read-only member sees progress');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000a04","role":"authenticated"}',true);
select is((select count(*)::int from public.journey_progress(array['b3000000-0000-4000-8000-000000000001']::uuid[])), 0, 'stranger gets nothing for a foreign journey (no error)');
select is((select media_total from public.journey_progress(array['b3000000-0000-4000-8000-000000000002']::uuid[])), 1, 'stranger sees own journey');
reset role;
set local role anon;
select throws_ok($$ select * from public.journey_progress(array['b3000000-0000-4000-8000-000000000001']::uuid[]) $$, '42501', null, 'anon cannot execute');
reset role;

select * from finish();
rollback;
