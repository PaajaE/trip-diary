begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000d01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mr-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000d02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mr-viewer@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000d03','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mr-other@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000d01","role":"authenticated"}',true);
insert into public.journeys (id, creator_id, title, visibility)
  values ('da000000-0000-4000-8000-000000000001', auth.uid(), 'Mine', 'private');
insert into public.journey_members (journey_id, user_id, role)
  values ('da000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000d02','member');
insert into public.media (id, owner_id, journey_id, kind, status, captured_at) values
('da300000-0000-4000-8000-000000000001', auth.uid(), 'da000000-0000-4000-8000-000000000001','photo','ready','2026-06-01T10:00:00Z'),
('da300000-0000-4000-8000-000000000002', auth.uid(), 'da000000-0000-4000-8000-000000000001','photo','ready','2026-06-01T11:00:00Z'),
('da300000-0000-4000-8000-000000000003', auth.uid(), 'da000000-0000-4000-8000-000000000001','photo','ready','2026-06-01T12:00:00Z');

-- new inserts are unreviewed
select is((select count(*)::int from public.media where journey_id = 'da000000-0000-4000-8000-000000000001' and reviewed_at is null), 3, 'new inserts are waiting to be sorted');

-- direct writes are not allowed
select throws_ok($$ update public.media set reviewed_at = now() where id = 'da300000-0000-4000-8000-000000000001' $$, '42501', null, 'reviewed_at not writable directly');
select throws_ok($$ insert into public.media (owner_id, journey_id, kind, status, captured_at, reviewed_at) values (auth.uid(), 'da000000-0000-4000-8000-000000000001','photo','ready',now(), now()) $$, '42501', null, 'reviewed_at not insertable directly');

-- trashed rows are ignored
select public.trash_media(array['da300000-0000-4000-8000-000000000003']::uuid[]);

select is(public.mark_media_reviewed(array['da300000-0000-4000-8000-000000000001','da300000-0000-4000-8000-000000000003']::uuid[]), 1, 'editor marks; trashed row ignored');
select is(public.mark_media_reviewed(array['da300000-0000-4000-8000-000000000001','da300000-0000-4000-8000-000000000003']::uuid[]), 0, 'idempotent: second call changes nothing');
select is((select count(*)::int from public.media where reviewed_at is null and deleted_at is null), 1, 'one media still to sort');
select is((select reviewed_at is null from public.media where id = 'da300000-0000-4000-8000-000000000003'), true, 'trashed row untouched');
select is(public.mark_media_reviewed(array['da300000-0000-4000-8000-000000000001']::uuid[], false), 1, 'unmark works');
-- viewer cannot
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000d02","role":"authenticated"}',true);
select throws_ok($$ select public.mark_media_reviewed(array['da300000-0000-4000-8000-000000000002']::uuid[]) $$, '42501', null, 'viewer cannot mark');

-- outsider cannot, and cannot tell it exists
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000d03","role":"authenticated"}',true);
select throws_ok($$ select public.mark_media_reviewed(array['da300000-0000-4000-8000-000000000002']::uuid[]) $$, 'P0002', null, 'outsider: not found');

-- anon has no execute
reset role;
set local role anon;
select throws_ok($$ select public.mark_media_reviewed(array['da300000-0000-4000-8000-000000000002']::uuid[]) $$, '42501', null, 'anon cannot execute');
reset role;

-- backfill statement from the migration: rows with null become reviewed
select is((select count(*)::int from public.media where reviewed_at is null and deleted_at is null), 2, 'unreviewed rows exist before backfill');
update public.media set reviewed_at = now() where reviewed_at is null;
select is((select count(*)::int from public.media where reviewed_at is null), 0, 'backfill leaves no row to sort');

select * from finish();
rollback;
