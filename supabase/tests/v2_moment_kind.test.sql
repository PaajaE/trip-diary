begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000f41','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zs-kind@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000f41","role":"authenticated"}',true);
insert into public.journeys (id, creator_id, title, visibility)
  values ('f4000000-0000-4000-8000-000000000001', auth.uid(), 'Kind', 'private');
insert into public.moments (id, journey_id, starts_at, ends_at, created_by) values
('f4200000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000001','2026-06-03T10:00:00Z','2026-06-03T11:00:00Z', auth.uid());

select is((select kind from public.moments where id = 'f4200000-0000-4000-8000-000000000001'), 'stay', 'kind defaults to stay');
select lives_ok($$ insert into public.moments (id, journey_id, starts_at, ends_at, kind, created_by)
  values ('f4200000-0000-4000-8000-000000000002','f4000000-0000-4000-8000-000000000001','2026-06-03T12:00:00Z','2026-06-03T12:00:00Z','point', auth.uid()) $$, 'owner inserts a point moment');
select lives_ok($$ update public.moments set kind = 'en_route' where id = 'f4200000-0000-4000-8000-000000000001' $$, 'owner updates kind');
select is((select kind from public.moments where id = 'f4200000-0000-4000-8000-000000000001'), 'en_route', 'en_route stored');
select throws_ok($$ update public.moments set kind = 'bogus' where id = 'f4200000-0000-4000-8000-000000000001' $$, '23514', null, 'unknown kind rejected by check constraint');
select throws_ok($$ update public.moments set kind = null where id = 'f4200000-0000-4000-8000-000000000001' $$, '23502', null, 'kind is not null');
select ok(has_column_privilege('authenticated', 'public.moments', 'kind', 'insert') and has_column_privilege('authenticated', 'public.moments', 'kind', 'update'), 'authenticated can insert and update kind');
reset role;
select ok(not has_column_privilege('anon', 'public.moments', 'kind', 'update'), 'anon cannot update kind');

select * from finish();
rollback;
