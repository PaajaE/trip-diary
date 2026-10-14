begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values
('00000000-0000-4000-8000-000000000b01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','paths-owner@example.test','',now(),'{}','{}',now(),now(),false);

insert into public.journeys (id, creator_id, title, visibility, slug, home_tz) values
('f0000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000b01','Pub','public','paths-public','Europe/Prague'),
('f0000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000b01','Priv','private','paths-private','Europe/Prague');

set local role anon;
select is((select count(*)::int from public.list_public_journey_paths() where journey_slug = 'paths-public'), 1, 'anon sees public journey path');
select is((select count(*)::int from public.list_public_journey_paths() where journey_slug = 'paths-private'), 0, 'anon does not see private');
reset role;
select is(
  (select proargnames from pg_proc where proname = 'list_public_journey_paths'),
  array['space_handle','journey_slug','updated_at'],
  'returns only handle, slug, updated_at');
select is(has_function_privilege('public', 'public.list_public_journey_paths()', 'execute'), false, 'not executable by public');

select * from finish();
rollback;
