begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

select has_table('public', 'profiles', 'profiles table exists');
select col_is_pk('public', 'profiles', 'id', 'profiles.id is the primary key');
select has_trigger(
  'public',
  'profiles',
  'set_profiles_updated_at',
  'profiles has an updated_at trigger'
);
select has_trigger(
  'auth',
  'users',
  'create_profile_after_user_insert',
  'auth.users has an automatic profile trigger'
);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'owner@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"owner_initial"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'stranger@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

select results_eq(
  $$ select count(*)::bigint from public.profiles
     where id in (
       '00000000-0000-4000-8000-000000000001',
       '00000000-0000-4000-8000-000000000002'
     ) $$,
  $$ values (2::bigint) $$,
  'inserting auth users automatically creates profiles'
);

select results_eq(
  $$ select username from public.profiles
     where id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values ('owner_initial'::text) $$,
  'new-user trigger copies a valid username from auth metadata'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq(
  $$ select count(*)::bigint from public.profiles
     where id in (
       '00000000-0000-4000-8000-000000000001',
       '00000000-0000-4000-8000-000000000002'
     ) $$,
  $$ values (2::bigint) $$,
  'anonymous users can read public profiles'
);

select throws_ok(
  $$ update public.profiles set display_name = 'Anonymous edit'
     where id = '00000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'anonymous users cannot update profiles'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$ update public.profiles
     set username = 'owner_1', display_name = 'Profile owner', preferred_locale = 'en'
     where id = '00000000-0000-4000-8000-000000000001' $$,
  'owners can update editable fields on their own profile'
);

select throws_ok(
  $$ update public.profiles
     set preferred_locale = 'de'
     where id = '00000000-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'preferred locale only accepts supported languages'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select results_eq(
  $$ update public.profiles
     set display_name = 'Unauthorized edit'
     where id = '00000000-0000-4000-8000-000000000001'
     returning id $$,
  $$ select id from public.profiles where false $$,
  'a foreign authenticated user cannot update the owner profile'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$ update public.profiles
     set created_at = now()
     where id = '00000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'clients cannot update system-managed profile fields'
);

select throws_ok(
  $$ insert into public.profiles (id)
     values ('00000000-0000-4000-8000-000000000003') $$,
  '42501',
  null,
  'clients cannot insert profiles'
);

select throws_ok(
  $$ delete from public.profiles
     where id = '00000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'clients cannot delete profiles'
);

select throws_ok(
  $$ update public.profiles
     set username = 'Invalid Username'
     where id = '00000000-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'username validation rejects invalid values'
);

select lives_ok(
  $$ update public.profiles
     set username = null
     where id = '00000000-0000-4000-8000-000000000001' $$,
  'username may remain unset'
);

reset role;

select is(
  has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE'),
  false,
  'anonymous users cannot execute the new-user trigger function'
);
select is(
  has_function_privilege('authenticated', 'public.set_updated_at()', 'EXECUTE'),
  false,
  'authenticated users cannot execute the updated-at trigger function'
);

select * from finish();
rollback;
