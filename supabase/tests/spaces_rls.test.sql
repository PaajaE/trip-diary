begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

select has_type('public', 'space_kind', 'space kind enum exists');
select has_type('public', 'space_role', 'space role enum exists');
select has_table('public', 'spaces', 'spaces table exists');
select has_table('public', 'space_members', 'space members table exists');
select col_is_pk('public', 'spaces', 'id', 'spaces.id is the primary key');
select col_is_pk(
  'public',
  'space_members',
  array['space_id', 'user_id'],
  'space membership has a compound primary key'
);
select has_trigger(
  'public',
  'profiles',
  'create_personal_space_after_profile_insert',
  'profiles automatically create personal spaces'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000061','00000000-0000-0000-0000-000000000000','authenticated','authenticated','space-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{"username":"space_owner"}',now(),now()),
('00000000-0000-4000-8000-000000000062','00000000-0000-0000-0000-000000000000','authenticated','authenticated','space-member@example.test','',now(),'{"provider":"email","providers":["email"]}','{"username":"space_member"}',now(),now()),
('00000000-0000-4000-8000-000000000063','00000000-0000-0000-0000-000000000000','authenticated','authenticated','space-stranger@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

select results_eq(
  $$ select count(*)::bigint from public.spaces
     where personal_owner_id in (
       '00000000-0000-4000-8000-000000000061',
       '00000000-0000-4000-8000-000000000062',
       '00000000-0000-4000-8000-000000000063'
     ) $$,
  $$ values (3::bigint) $$,
  'new profiles automatically receive one personal space'
);

select results_eq(
  $$ select handle from public.spaces
     where personal_owner_id = '00000000-0000-4000-8000-000000000061' $$,
  $$ values ('space-owner'::text) $$,
  'legacy profile underscores become deterministic hyphens'
);

select results_eq(
  $$ select role from public.space_members
     where user_id = '00000000-0000-4000-8000-000000000061'
       and space_id = (
         select id from public.spaces
         where personal_owner_id = '00000000-0000-4000-8000-000000000061'
       ) $$,
  $$ values ('owner'::public.space_role) $$,
  'personal space creator is its owner'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000061","role":"authenticated"}',
  true
);

select lives_ok(
  $$ select public.create_family_space('Ečerovi', 'ecerovi-2016') $$,
  'authenticated user creates a family space through RPC'
);

select results_eq(
  $$ select kind, created_by, personal_owner_id
     from public.spaces where handle = 'ecerovi-2016' $$,
  $$ values (
    'family'::public.space_kind,
    '00000000-0000-4000-8000-000000000061'::uuid,
    null::uuid
  ) $$,
  'family space records its creator without a personal owner'
);

select results_eq(
  $$ select role from public.space_members
     where space_id = (select id from public.spaces where handle = 'ecerovi-2016')
       and user_id = auth.uid() $$,
  $$ values ('owner'::public.space_role) $$,
  'family creator receives owner membership'
);

select throws_ok(
  $$ select public.create_family_space('Invalid', 'Invalid_Handle') $$,
  '22023',
  'invalid space handle',
  'family RPC rejects non-lowercase invalid handles'
);

select throws_ok(
  $$ insert into public.space_members (space_id, user_id, role)
     values (
       (select id from public.spaces where handle = 'ecerovi-2016'),
       '00000000-0000-4000-8000-000000000062',
       'member'
     ) $$,
  '42501',
  null,
  'clients cannot directly add space memberships'
);

select throws_ok(
  $$ update public.space_members set role = 'owner'
     where space_id = (select id from public.spaces where handle = 'ecerovi-2016') $$,
  '42501',
  null,
  'clients cannot directly update space memberships'
);

select throws_ok(
  $$ delete from public.space_members
     where space_id = (select id from public.spaces where handle = 'ecerovi-2016') $$,
  '42501',
  null,
  'clients cannot directly delete space memberships'
);

select throws_ok(
  $$ insert into public.spaces (kind, handle, name, created_by)
     values ('family', 'direct-family', 'Direct', auth.uid()) $$,
  '42501',
  null,
  'clients cannot directly create spaces'
);

select throws_ok(
  $$ update public.spaces set handle = 'renamed-family'
     where handle = 'ecerovi-2016' $$,
  '42501',
  null,
  'clients cannot directly update spaces'
);

select throws_ok(
  $$ delete from public.spaces where handle = 'ecerovi-2016' $$,
  '42501',
  null,
  'clients cannot directly delete spaces'
);

reset role;
insert into public.space_members (space_id, user_id, role)
values (
  (select id from public.spaces where handle = 'ecerovi-2016'),
  '00000000-0000-4000-8000-000000000062',
  'member'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000062","role":"authenticated"}',
  true
);

select results_eq(
  $$ select count(*)::bigint from public.space_members
     where space_id = (select id from public.spaces where handle = 'ecerovi-2016') $$,
  $$ values (2::bigint) $$,
  'members can read fellow memberships'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000063","role":"authenticated"}',
  true
);

select results_eq(
  $$ select count(*)::bigint from public.space_members
     where space_id = (select id from public.spaces where handle = 'ecerovi-2016') $$,
  $$ values (0::bigint) $$,
  'non-members cannot read space memberships'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq(
  $$ select name from public.spaces where handle = 'ecerovi-2016' $$,
  $$ values ('Ečerovi'::text) $$,
  'anonymous users can read public space identity'
);

select throws_ok(
  $$ select * from public.space_members limit 1 $$,
  '42501',
  null,
  'anonymous users cannot read memberships'
);

select throws_ok(
  $$ select public.create_family_space('Anonymous', 'anonymous-family') $$,
  '42501',
  null,
  'anonymous users cannot execute family creation RPC'
);

reset role;

select is(
  has_table_privilege('authenticated', 'public.space_members', 'INSERT'),
  false,
  'authenticated users have no direct membership insert grant'
);
select is(
  has_table_privilege('authenticated', 'public.space_members', 'UPDATE'),
  false,
  'authenticated users have no direct membership update grant'
);
select is(
  has_table_privilege('authenticated', 'public.space_members', 'DELETE'),
  false,
  'authenticated users have no direct membership delete grant'
);
select is(
  has_function_privilege('anon', 'public.create_family_space(text,text)', 'EXECUTE'),
  false,
  'anonymous users cannot execute family creation RPC'
);
select is(
  has_function_privilege('authenticated', 'public.create_personal_space_for_profile()', 'EXECUTE'),
  false,
  'authenticated users cannot execute personal-space trigger function'
);

select * from finish();
rollback;
