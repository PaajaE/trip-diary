begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

select has_table('public', 'journeys', 'journeys table exists');
select has_table('public', 'journey_members', 'journey members table exists');
select has_table('public', 'journey_stages', 'journey stages table exists');
select has_table('public', 'journey_stops', 'journey stops table exists');
select has_table('public', 'journey_guide_sections', 'journey guides table exists');
select has_table('public', 'entry_journey_links', 'optional entry journey links exist');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000041','00000000-0000-0000-0000-000000000000','authenticated','authenticated','journey-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000042','00000000-0000-0000-0000-000000000000','authenticated','authenticated','journey-member@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000043','00000000-0000-0000-0000-000000000000','authenticated','authenticated','journey-stranger@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000041","role":"authenticated"}',true);
select lives_ok(
  $$ insert into public.journeys (id, creator_id, title, visibility)
     values ('50000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000041','Canada 2026','public') $$,
  'creator creates journey'
);
select results_eq(
  $$ select role from public.journey_members where journey_id = '50000000-0000-4000-8000-000000000001' and user_id = auth.uid() $$,
  $$ values ('owner'::public.journey_member_role) $$,
  'owner membership is automatic'
);
select lives_ok(
  $$ insert into public.journey_members (journey_id,user_id,role)
     values ('50000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000042','editor') $$,
  'owner adds member'
);

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000042","role":"authenticated"}',true);
select lives_ok(
  $$ insert into public.journey_stages (id,journey_id,creator_id,title,position)
     values ('51000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',auth.uid(),'Rockies',0) $$,
  'member creates own stage'
);
select lives_ok(
  $$ insert into public.journey_stops (id,journey_id,stage_id,creator_id,title,status,position,latitude,longitude)
     values ('52000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001',auth.uid(),'Banff','planned',0,51.1784,-115.5708) $$,
  'member creates planned stop'
);
select lives_ok(
  $$ select public.create_journey_stage('50000000-0000-4000-8000-000000000001','Prairies','') $$,
  'member creates an ordered stage through RPC'
);
select lives_ok(
  $$ select public.create_journey_stop('50000000-0000-4000-8000-000000000001',null,'Calgary','','planned') $$,
  'member creates an ordered stop through RPC'
);
select lives_ok(
  $$ select public.create_journey_guide_section('50000000-0000-4000-8000-000000000001','Transport','Use transit') $$,
  'member creates an ordered guide through RPC'
);

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000043","role":"authenticated"}',true);
select throws_ok(
  $$ insert into public.journey_stages (id,journey_id,creator_id,title,position)
     values ('51000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001',auth.uid(),'No access',1) $$,
  '42501', null, 'non-member cannot create content'
);
select throws_ok(
  $$ select latitude from public.journey_stops where id = '52000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'public authenticated readers cannot access exact coordinates'
);

reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select results_eq(
  $$ select title from public.journeys where id = '50000000-0000-4000-8000-000000000001' $$,
  $$ values ('Canada 2026'::text) $$,
  'anonymous reader sees public journey'
);
select throws_ok(
  $$ select latitude from public.journey_stops where id = '52000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'anonymous reader cannot access exact coordinates'
);

reset role;
select is(has_column_privilege('anon','public.journey_stops','latitude','SELECT'), false, 'anonymous role lacks latitude privilege');
select is(has_column_privilege('authenticated','public.journey_stops','latitude','SELECT'), false, 'authenticated role lacks direct latitude privilege');
select is(has_column_privilege('authenticated','public.journeys','creator_id','UPDATE'), false, 'journey ownership cannot be changed');
select is(has_column_privilege('authenticated','public.journey_stages','creator_id','UPDATE'), true, 'table grants remain subject to RLS creator checks');
select is(has_table_privilege('anon','public.journeys','INSERT'), false, 'anonymous role cannot create journeys');

select * from finish();
rollback;
