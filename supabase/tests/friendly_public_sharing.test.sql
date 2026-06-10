begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

select has_column('public', 'journeys', 'space_id', 'journeys have a publishing space');
select has_column('public', 'journeys', 'slug', 'journeys have a friendly slug');
select has_column('public', 'entries', 'space_id', 'entries have a publishing space');
select has_column('public', 'entries', 'slug', 'entries have a friendly slug');
select has_function('public', 'move_journey_to_space', array['uuid','uuid','text'], 'journey move RPC exists');
select has_function('public', 'move_entry_to_space', array['uuid','uuid','text'], 'entry move RPC exists');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000081','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sharing-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{"username":"sharing_owner"}',now(),now()),
('00000000-0000-4000-8000-000000000082','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sharing-editor@example.test','',now(),'{"provider":"email","providers":["email"]}','{"username":"sharing_editor"}',now(),now()),
('00000000-0000-4000-8000-000000000083','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sharing-member@example.test','',now(),'{"provider":"email","providers":["email"]}','{"username":"sharing_member"}',now(),now()),
('00000000-0000-4000-8000-000000000084','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sharing-stranger@example.test','',now(),'{"provider":"email","providers":["email"]}','{"username":"sharing_stranger"}',now(),now());

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000081","role":"authenticated"}',true);
select public.create_family_space('Sharing family', 'sharing-family');

reset role;
insert into public.space_members (space_id, user_id, role)
select id, '00000000-0000-4000-8000-000000000082', 'editor' from public.spaces where handle = 'sharing-family';
insert into public.space_members (space_id, user_id, role)
select id, '00000000-0000-4000-8000-000000000083', 'member' from public.spaces where handle = 'sharing-family';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000081","role":"authenticated"}',true);

select lives_ok(
  $$ insert into public.journeys (id, creator_id, title)
     values ('80000000-0000-4000-8000-000000000001', auth.uid(), 'Žlutá cesta') $$,
  'legacy journey insert remains compatible'
);
select results_eq(
  $$ select spaces.handle, journeys.slug
     from public.journeys join public.spaces on spaces.id = journeys.space_id
     where journeys.id = '80000000-0000-4000-8000-000000000001' $$,
  $$ values ('sharing-owner'::text, 'zluta-cesta'::text) $$,
  'legacy journey insert receives personal space and friendly slug'
);

select lives_ok(
  $$ insert into public.entries (id, creator_id, type, title)
     values ('81000000-0000-4000-8000-000000000001', auth.uid(), 'story', 'Žlutá cesta') $$,
  'legacy entry insert remains compatible'
);
select results_eq(
  $$ select spaces.handle, entries.slug
     from public.entries join public.spaces on spaces.id = entries.space_id
     where entries.id = '81000000-0000-4000-8000-000000000001' $$,
  $$ values ('sharing-owner'::text, 'zluta-cesta'::text) $$,
  'entries use an independent slug namespace'
);

select lives_ok(
  $$ insert into public.journeys (id, creator_id, title)
     values ('80000000-0000-4000-8000-000000000002', auth.uid(), 'Žlutá cesta') $$,
  'duplicate journey titles are accepted'
);
select results_eq(
  $$ select slug from public.journeys
     where id = '80000000-0000-4000-8000-000000000002' $$,
  $$ values ('zluta-cesta-2'::text) $$,
  'duplicate journey titles receive unique scoped slugs'
);
reset role;
select results_eq(
  $$ select char_length(public.normalize_content_slug(repeat('a', 160), gen_random_uuid())) $$,
  $$ values (160) $$,
  'normalization exposes long source slugs for bounded write-time handling'
);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000081","role":"authenticated"}',true);
select lives_ok(
  $$ insert into public.journeys (id, creator_id, space_id, slug, title)
     values (
       '80000000-0000-4000-8000-000000000003', auth.uid(),
       (select id from public.spaces where handle = 'sharing-family'),
       'kanada-2026', 'Kanada 2026'
     ) $$,
  'space owner creates a family journey'
);

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000082","role":"authenticated"}',true);
select lives_ok(
  $$ insert into public.entries (id, creator_id, space_id, type, title)
     values (
       '81000000-0000-4000-8000-000000000002', auth.uid(),
       (select id from public.spaces where handle = 'sharing-family'),
       'tip', 'Doprava'
     ) $$,
  'space editor creates family content'
);

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000083","role":"authenticated"}',true);
select throws_ok(
  $$ insert into public.entries (id, creator_id, space_id, type, title)
     values (
       '81000000-0000-4000-8000-000000000003', auth.uid(),
       (select id from public.spaces where handle = 'sharing-family'),
       'note', 'Forbidden'
     ) $$,
  '42501', 'space owner or editor role required',
  'plain members cannot create family content'
);

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000084","role":"authenticated"}',true);
select throws_ok(
  $$ insert into public.journeys (id, creator_id, space_id, title)
     values (
       '80000000-0000-4000-8000-000000000004', auth.uid(),
       (select id from public.spaces where handle = 'sharing-family'),
       'Forbidden'
     ) $$,
  '42501', 'space owner or editor role required',
  'strangers cannot create family journeys'
);

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000081","role":"authenticated"}',true);
select lives_ok(
  $$ select public.move_entry_to_space(
       '81000000-0000-4000-8000-000000000001',
       (select id from public.spaces where handle = 'sharing-family'),
       'rodinny-pribeh'
     ) $$,
  'creator moves own entry into a writable space'
);
select results_eq(
  $$ select spaces.handle, entries.slug, entries.creator_id, entries.version
     from public.entries join public.spaces on spaces.id = entries.space_id
     where entries.id = '81000000-0000-4000-8000-000000000001' $$,
  $$ values (
       'sharing-family'::text, 'rodinny-pribeh'::text,
       '00000000-0000-4000-8000-000000000081'::uuid, 2::bigint
     ) $$,
  'moving an entry preserves creator and advances its version'
);
select throws_ok(
  $$ select public.move_entry_to_space(
       '81000000-0000-4000-8000-000000000002',
       (select id from public.spaces where handle = 'sharing-owner'),
       null
     ) $$,
  '42501', 'entry is unavailable or not owned by the current user',
  'space owners cannot impersonate another content creator'
);

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000083","role":"authenticated"}',true);
select throws_ok(
  $$ select public.move_journey_to_space(
       '80000000-0000-4000-8000-000000000003',
       (select id from public.spaces where handle = 'sharing-family'),
       'stolen'
     ) $$,
  '42501', 'space owner or editor role required',
  'plain members cannot move content'
);

reset role;
delete from public.space_members
where space_id = (select id from public.spaces where handle = 'sharing-family')
  and user_id = '00000000-0000-4000-8000-000000000082';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000082","role":"authenticated"}',true);
select throws_ok(
  $$ select public.update_entry(
       '81000000-0000-4000-8000-000000000002', 1, 'tip', 'Doprava',
       'Published without membership', 'cs', 'public', 'published',
       null, null, null
     ) $$,
  '42501', 'space owner or editor role required',
  'removed creators cannot publish into a former space'
);
select lives_ok(
  $$ select public.update_entry(
       '81000000-0000-4000-8000-000000000002', 1, 'tip', 'Doprava',
       'Private draft remains editable', 'cs', 'private', 'draft',
       null, null, null
     ) $$,
  'removed creators retain creator ownership of drafts'
);
select lives_ok(
  $$ select public.move_entry_to_space(
       '81000000-0000-4000-8000-000000000002',
       (select id from public.spaces where handle = 'sharing-editor'),
       null
     ) $$,
  'removed creators can rescue their content into a writable personal space'
);

reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select results_eq(
  $$ select id from public.journeys
     where id = '80000000-0000-4000-8000-000000000003' $$,
  $$ values ('80000000-0000-4000-8000-000000000003'::uuid) $$,
  'existing public UUID journey route remains readable'
);
select results_eq(
  $$ select id from public.journeys
     where space_id = (select id from public.spaces where handle = 'sharing-family')
       and slug = 'kanada-2026' $$,
  $$ values ('80000000-0000-4000-8000-000000000003'::uuid) $$,
  'public journey can be resolved through space and slug'
);
select results_eq(
  $$ select id from public.entries
     where space_id = (select id from public.spaces where handle = 'sharing-family')
       and slug = 'rodinny-pribeh' $$,
  $$ select id from public.entries where false $$,
  'private content cannot be resolved through a known slug'
);

reset role;
select is(has_column_privilege('authenticated','public.journeys','title','UPDATE'), true, 'existing journey update API remains granted');
select is(has_column_privilege('authenticated','public.journeys','creator_id','UPDATE'), false, 'journey creator remains immutable');
select is(has_table_privilege('authenticated','public.entries','UPDATE'), false, 'entry updates remain RPC-only');
select is(has_function_privilege('anon','public.move_entry_to_space(uuid,uuid,text)','EXECUTE'), false, 'anonymous users cannot move entries');
select is(has_function_privilege('authenticated','public.normalize_content_slug(text,uuid)','EXECUTE'), false, 'slug helper is not client executable');
select col_not_null('public','journeys','space_id','journey space is required');
select col_not_null('public','entries','space_id','entry space is required');
select col_not_null('public','journeys','slug','journey slug is required');
select col_not_null('public','entries','slug','entry slug is required');

select * from finish();
rollback;
