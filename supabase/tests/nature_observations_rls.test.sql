begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000061','00000000-0000-0000-0000-000000000000','authenticated','authenticated','obs-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000062','00000000-0000-0000-0000-000000000000','authenticated','authenticated','obs-stranger@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000061","role":"authenticated"}',true);
select lives_ok(
  $$ insert into public.journeys (id, creator_id, title, visibility)
     values ('50000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000061','Observation trip','public') $$,
  'owner creates public journey'
);
select lives_ok(
  $$ insert into public.nature_observations (
       id, journey_id, creator_id, common_name, category, confidence
     ) values (
       '70000000-0000-4000-8000-000000000001',
       '50000000-0000-4000-8000-000000000021',
       auth.uid(),
       'Kingfisher',
       'wildlife',
       'seen'
     ) $$,
  'member creates observation'
);

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000062","role":"authenticated"}',true);
select throws_ok(
  $$ insert into public.nature_observations (
       id, journey_id, creator_id, common_name, category, confidence
     ) values (
       '70000000-0000-4000-8000-000000000002',
       '50000000-0000-4000-8000-000000000021',
       auth.uid(),
       'Raven',
       'wildlife',
       'seen'
     ) $$,
  '42501', null, 'non-member cannot create observation'
);

reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select results_eq(
  $$ select common_name from public.nature_observations
     where journey_id = '50000000-0000-4000-8000-000000000021' $$,
  $$ values ('Kingfisher'::text) $$,
  'anonymous reader sees public journey observations'
);

select finish();
rollback;
