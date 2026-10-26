begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000f51','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zs-device@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000f51","role":"authenticated"}',true);
insert into public.journeys (id, creator_id, title, visibility)
  values ('f5000000-0000-4000-8000-000000000001', auth.uid(), 'Device', 'private');

select lives_ok($$ insert into public.media (id, owner_id, journey_id, kind, status, captured_at, device)
  values ('f5300000-0000-4000-8000-000000000001', auth.uid(), 'f5000000-0000-4000-8000-000000000001','photo','ready','2026-06-01T10:00:00Z','Apple iPhone 15 Pro') $$, 'owner inserts media with device');
select is((select device from public.media where id = 'f5300000-0000-4000-8000-000000000001'), 'Apple iPhone 15 Pro', 'device is stored');
select lives_ok($$ insert into public.media (id, owner_id, journey_id, kind, status, captured_at)
  values ('f5300000-0000-4000-8000-000000000002', auth.uid(), 'f5000000-0000-4000-8000-000000000001','photo','ready','2026-06-01T10:05:00Z') $$, 'device is optional');
select is((select device from public.media where id = 'f5300000-0000-4000-8000-000000000002'), null, 'device defaults to null');
select lives_ok($$ update public.media set device = 'Canon EOS R6' where id = 'f5300000-0000-4000-8000-000000000002' $$, 'owner updates device');
select throws_ok($$ update public.media set device = '' where id = 'f5300000-0000-4000-8000-000000000002' $$, '23514', null, 'empty device rejected');
select throws_ok(format($$ update public.media set device = %L where id = 'f5300000-0000-4000-8000-000000000002' $$, repeat('x', 121)), '23514', null, 'device over 120 characters rejected');
select ok(has_column_privilege('authenticated', 'public.media', 'device', 'insert') and has_column_privilege('authenticated', 'public.media', 'device', 'update'), 'authenticated can insert and update device');
reset role;
select ok(not has_column_privilege('anon', 'public.media', 'device', 'select'), 'anon cannot read device');

select * from finish();
rollback;
