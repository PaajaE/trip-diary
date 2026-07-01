begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000051','00000000-0000-0000-0000-000000000000','authenticated','authenticated','checklist-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000052','00000000-0000-0000-0000-000000000000','authenticated','authenticated','checklist-stranger@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000051","role":"authenticated"}',true);
select lives_ok(
  $$ insert into public.journeys (id, creator_id, title, visibility)
     values ('50000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000051','Nature trip','public') $$,
  'owner creates public journey'
);
select lives_ok(
  $$ insert into public.journey_checklist_items (
       id, journey_id, template_slug, item_slug, creator_id, title, category, position
     ) values (
       '60000000-0000-4000-8000-000000000001',
       '50000000-0000-4000-8000-000000000011',
       'sumava',
       'lynx',
       auth.uid(),
       'Eurasian lynx',
       'wildlife',
       0
     ) $$,
  'member creates checklist item'
);

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000052","role":"authenticated"}',true);
select throws_ok(
  $$ insert into public.journey_checklist_items (
       id, journey_id, template_slug, item_slug, creator_id, title, category, position
     ) values (
       '60000000-0000-4000-8000-000000000002',
       '50000000-0000-4000-8000-000000000011',
       'sumava',
       'marmot',
       auth.uid(),
       'Marmot',
       'wildlife',
       1
     ) $$,
  '42501', null, 'non-member cannot create checklist item'
);

reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select results_eq(
  $$ select title from public.journey_checklist_items
     where journey_id = '50000000-0000-4000-8000-000000000011'
     order by position $$,
  $$ values ('Eurasian lynx'::text) $$,
  'anonymous reader sees public journey checklist items'
);

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000051","role":"authenticated"}',true);
select lives_ok(
  $$ delete from public.journey_checklist_items
     where id = '60000000-0000-4000-8000-000000000001' $$,
  'creator deletes own checklist item'
);

select finish();
rollback;
