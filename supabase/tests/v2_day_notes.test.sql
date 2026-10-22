begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000d01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dn-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000d02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dn-viewer@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000d03','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dn-stranger@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000d01","role":"authenticated"}',true);
insert into public.journeys (id, creator_id, title, visibility, slug, home_tz)
  values ('da000000-0000-4000-8000-000000000001', auth.uid(), 'Notes', 'public', 'dn-pub', 'Europe/Prague');
insert into public.journey_members (journey_id, user_id, role)
  values ('da000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000d02','member');
insert into public.moments (id, journey_id, starts_at, ends_at, published, created_by) values
('da200000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','2026-06-03T10:00:00Z','2026-06-03T11:00:00Z', true, auth.uid()),
-- 2026-06-04 only has an unpublished moment
('da200000-0000-4000-8000-000000000002','da000000-0000-4000-8000-000000000001','2026-06-04T10:00:00Z','2026-06-04T11:00:00Z', false, auth.uid()),
-- 22:30Z on 06-05 is 00:30 on 06-06 in Prague
('da200000-0000-4000-8000-000000000003','da000000-0000-4000-8000-000000000001','2026-06-05T22:30:00Z','2026-06-05T23:00:00Z', true, auth.uid());

-- editor (owner) writes
select lives_ok($$ insert into public.day_notes (journey_id, local_date, body) values
  ('da000000-0000-4000-8000-000000000001','2026-06-03','Nice day'),
  ('da000000-0000-4000-8000-000000000001','2026-06-04','Hidden day'),
  ('da000000-0000-4000-8000-000000000001','2026-06-06','Late day'),
  ('da000000-0000-4000-8000-000000000001','2026-06-07','No moment') $$, 'editor inserts notes');
select is((select created_by from public.day_notes where local_date = '2026-06-03'), auth.uid(), 'created_by defaults to auth.uid()');
select throws_ok($$ insert into public.day_notes (journey_id, local_date, body)
  values ('da000000-0000-4000-8000-000000000001','2026-06-03','dup') $$, '23505', null, 'one note per day');
select throws_ok($$ insert into public.day_notes (journey_id, local_date, body)
  values ('da000000-0000-4000-8000-000000000001','2026-06-08','') $$, '23514', null, 'empty body rejected');
select throws_ok(format($$ insert into public.day_notes (journey_id, local_date, body)
  values ('da000000-0000-4000-8000-000000000001','2026-06-08', %L) $$, repeat('x', 20001)), '23514', null, 'body over 20000 rejected');
select lives_ok($$ update public.day_notes set body = 'Nicer day' where local_date = '2026-06-03' $$, 'editor updates');

-- viewer (read-only member)
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000d02","role":"authenticated"}',true);
select is((select count(*)::int from public.day_notes), 4, 'member reads notes');
select throws_ok($$ insert into public.day_notes (journey_id, local_date, body)
  values ('da000000-0000-4000-8000-000000000001','2026-06-09','x') $$, '42501', null, 'viewer cannot insert');
update public.day_notes set body = 'hacked' where local_date = '2026-06-03';
delete from public.day_notes where local_date = '2026-06-07';
select is((select count(*)::int from public.day_notes where body = 'hacked'), 0, 'viewer update affects no row');
select is((select count(*)::int from public.day_notes where local_date = '2026-06-07'), 1, 'viewer delete affects no row');

-- stranger
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000d03","role":"authenticated"}',true);
select is((select count(*)::int from public.day_notes), 0, 'stranger reads nothing');

-- public RPC as anon
reset role;
set local role anon;
select is(
  (select jsonb_agg(e ->> 'date' order by e ->> 'date') from jsonb_array_elements(
    public.get_public_journey((select handle from public.spaces s join public.journeys j on j.space_id = s.id where j.slug = 'dn-pub'), 'dn-pub') -> 'dayNotes') e),
  '["2026-06-03", "2026-06-06"]'::jsonb,
  'public sees notes only for days with a published moment (home_tz applied)');
reset role;
update public.journeys set visibility = 'private' where id = 'da000000-0000-4000-8000-000000000001';
set local role anon;
select is(public.get_public_journey((select handle from public.spaces s join public.journeys j on j.space_id = s.id where j.slug = 'dn-pub'), 'dn-pub'), null, 'private journey exposes nothing');

select * from finish();
rollback;
