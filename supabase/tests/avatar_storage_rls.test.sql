begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

select results_eq(
  $$ select id, public, file_size_limit, allowed_mime_types
     from storage.buckets where id = 'avatars' $$,
  $$ values ('avatars'::text, true, 1048576::bigint, array['image/webp']::text[]) $$,
  'avatars bucket is public, WebP-only, and limited to 1 MiB'
);

select results_eq(
  $$ select policyname
     from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname in (
         'Public profile avatars can be read',
         'Users can upload their profile avatar',
         'Users can overwrite their profile avatar',
         'Users can delete their profile avatar'
       )
     order by policyname $$,
  $$ values
       ('Public profile avatars can be read'::name),
       ('Users can delete their profile avatar'::name),
       ('Users can overwrite their profile avatar'::name),
       ('Users can upload their profile avatar'::name) $$,
  'avatar storage policies exist'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000041","role":"authenticated"}',
  true
);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id, metadata)
     values (
       'avatars',
       '00000000-0000-4000-8000-000000000041/avatar.webp',
       '00000000-0000-4000-8000-000000000041',
       '{"mimetype":"image/webp"}'::jsonb
     ) $$,
  'users can upload their deterministic avatar path'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id, metadata)
     values (
       'avatars',
       '00000000-0000-4000-8000-000000000041/another.webp',
       '00000000-0000-4000-8000-000000000041',
       '{"mimetype":"image/webp"}'::jsonb
     ) $$,
  '42501',
  null,
  'users cannot upload additional files into their avatar folder'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id, metadata)
     values (
       'avatars',
       '00000000-0000-4000-8000-000000000042/avatar.webp',
       '00000000-0000-4000-8000-000000000041',
       '{"mimetype":"image/webp"}'::jsonb
     ) $$,
  '42501',
  null,
  'users cannot upload another user avatar'
);

select lives_ok(
  $$ update storage.objects
     set metadata = '{"mimetype":"image/webp","cacheControl":"3600"}'::jsonb
     where bucket_id = 'avatars'
       and name = '00000000-0000-4000-8000-000000000041/avatar.webp' $$,
  'users can overwrite their own avatar'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq(
  $$ select name from storage.objects
     where bucket_id = 'avatars'
     order by name $$,
  $$ values ('00000000-0000-4000-8000-000000000041/avatar.webp'::text) $$,
  'anonymous users can read public avatars'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, metadata)
     values (
       'avatars',
       '00000000-0000-4000-8000-000000000043/avatar.webp',
       '{"mimetype":"image/webp"}'::jsonb
     ) $$,
  '42501',
  null,
  'anonymous users cannot upload avatars'
);

select results_eq(
  $$ update storage.objects set name = name
     where bucket_id = 'avatars'
     returning name $$,
  $$ select name from storage.objects where false $$,
  'anonymous users cannot overwrite avatars'
);

select throws_ok(
  $$ delete from storage.objects where bucket_id = 'avatars' $$,
  '42501',
  null,
  'anonymous users cannot delete avatars'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000042","role":"authenticated"}',
  true
);

select results_eq(
  $$ update storage.objects
     set metadata = '{"mimetype":"image/webp"}'::jsonb
     where bucket_id = 'avatars'
     returning name $$,
  $$ select name from storage.objects where false $$,
  'foreign users cannot overwrite an avatar'
);

select results_eq(
  $$ select count(*)::bigint from storage.objects
     where bucket_id = 'avatars'
       and name = auth.uid()::text || '/avatar.webp' $$,
  $$ values (0::bigint) $$,
  'foreign users do not satisfy the avatar delete ownership predicate'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000041","role":"authenticated"}',
  true
);

select results_eq(
  $$ select count(*)::bigint from storage.objects
     where bucket_id = 'avatars'
       and name = auth.uid()::text || '/avatar.webp' $$,
  $$ values (1::bigint) $$,
  'users satisfy the delete ownership predicate for their own avatar'
);

select results_eq(
  $$ select count(*)::bigint from storage.objects where bucket_id = 'avatars' $$,
  $$ values (1::bigint) $$,
  'direct SQL tests preserve the avatar for Storage API deletion'
);

select * from finish();
rollback;
