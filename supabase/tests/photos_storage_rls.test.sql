begin;

create extension if not exists pgtap with schema extensions;

select plan(37);

select has_table('public', 'photos', 'photos table exists');
select has_table('public', 'photo_variants', 'photo_variants table exists');
select has_table('public', 'entry_photos', 'entry_photos table exists');
select col_is_pk('public', 'photos', 'id', 'photos.id is the primary key');
select has_trigger('public', 'photos', 'set_photos_updated_at', 'photos has updated_at trigger');
select results_eq(
  $$ select id, public, file_size_limit, allowed_mime_types
     from storage.buckets where id = 'photos' $$,
  $$ values ('photos'::text, false, 8388608::bigint, array['image/webp']::text[]) $$,
  'photos bucket is private and WebP-only'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-4000-8000-000000000031',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'photo-owner@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-4000-8000-000000000032',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'photo-stranger@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.entries (id, creator_id, type, title, visibility, status)
values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000031', 'story', 'Public', 'public', 'published'),
  ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000031', 'story', 'Private', 'private', 'published');

insert into public.photos (id, creator_id, captured_at)
values
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000031', '2026-06-01T12:00:00Z'),
  ('40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000031', null);

insert into public.photo_variants (
  photo_id, creator_id, variant, storage_path, width, height, byte_size
)
values
  (
    '40000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000031',
    'thumb',
    '00000000-0000-4000-8000-000000000031/40000000-0000-4000-8000-000000000001/thumb.webp',
    400, 300, 12000
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000031',
    'thumb',
    '00000000-0000-4000-8000-000000000031/40000000-0000-4000-8000-000000000002/thumb.webp',
    400, 300, 12000
  );

insert into public.entry_photos (entry_id, photo_id, creator_id, position)
values
  ('30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000031', 0),
  ('30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000031', 0);

select throws_ok(
  $$ insert into public.photo_variants (
       photo_id, creator_id, variant, storage_path, width, height, byte_size
     ) values (
       '40000000-0000-4000-8000-000000000001',
       '00000000-0000-4000-8000-000000000031',
       'preview',
       'bad/path.webp',
       1000, 750, 50000
     ) $$,
  '23514', null, 'variant paths must use the canonical owner/photo/variant path'
);
select throws_ok(
  $$ insert into public.photo_variants (
       photo_id, creator_id, variant, storage_path, width, height, byte_size, mime_type
     ) values (
       '40000000-0000-4000-8000-000000000001',
       '00000000-0000-4000-8000-000000000031',
       'preview',
       '00000000-0000-4000-8000-000000000031/40000000-0000-4000-8000-000000000001/preview.webp',
       1000, 750, 50000, 'image/jpeg'
     ) $$,
  '23514', null, 'only WebP variants are accepted'
);
select throws_ok(
  $$ insert into public.entry_photos (entry_id, photo_id, creator_id, position)
     values (
       '30000000-0000-4000-8000-000000000001',
       '40000000-0000-4000-8000-000000000002',
       '00000000-0000-4000-8000-000000000031',
       0
     ) $$,
  '23505', null, 'entry photo positions are unique'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq(
  $$ select id from public.photos
     where creator_id = '00000000-0000-4000-8000-000000000031'
     order by id $$,
  $$ values ('40000000-0000-4000-8000-000000000001'::uuid) $$,
  'anonymous users only read photos attached to public published entries'
);
select results_eq(
  $$ select photo_id from public.photo_variants
     where creator_id = '00000000-0000-4000-8000-000000000031'
     order by photo_id $$,
  $$ values ('40000000-0000-4000-8000-000000000001'::uuid) $$,
  'anonymous users only read variants attached to public published entries'
);
select results_eq(
  $$ select photo_id from public.entry_photos
     where creator_id = '00000000-0000-4000-8000-000000000031'
     order by photo_id $$,
  $$ values ('40000000-0000-4000-8000-000000000001'::uuid) $$,
  'anonymous users only read public entry photo links'
);
select throws_ok(
  $$ insert into public.photos (id, creator_id)
     values ('40000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000031') $$,
  '42501', null, 'anonymous users cannot insert photos'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000032","role":"authenticated"}',
  true
);

select results_eq(
  $$ select id from public.photos
     where creator_id = '00000000-0000-4000-8000-000000000031'
     order by id $$,
  $$ values ('40000000-0000-4000-8000-000000000001'::uuid) $$,
  'foreign users only read public photos'
);
select throws_ok(
  $$ insert into public.photos (id, creator_id)
     values ('40000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000031') $$,
  '42501', null, 'users cannot spoof photo creator_id'
);
select results_eq(
  $$ delete from public.photos
     where id = '40000000-0000-4000-8000-000000000001'
     returning id $$,
  $$ select id from public.photos where false $$,
  'foreign users cannot delete public photos'
);
select throws_ok(
  $$ insert into public.entry_photos (entry_id, photo_id, creator_id, position)
     values (
       '30000000-0000-4000-8000-000000000001',
       '40000000-0000-4000-8000-000000000002',
       '00000000-0000-4000-8000-000000000032',
       1
     ) $$,
  '23503', null, 'foreign users cannot attach another creator photo'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000031","role":"authenticated"}',
  true
);

select results_eq(
  $$ select count(*)::bigint from public.photos
     where creator_id = '00000000-0000-4000-8000-000000000031' $$,
  $$ values (2::bigint) $$,
  'authors read all their photos'
);
select lives_ok(
  $$ insert into public.photos (id, creator_id)
     values ('40000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000031') $$,
  'authors can insert their own photos'
);
select lives_ok(
  $$ update public.photos set captured_at = '2026-06-02T12:00:00Z'
     where id = '40000000-0000-4000-8000-000000000012' $$,
  'authors can update their own photo metadata'
);
select throws_ok(
  $$ update public.photos set creator_id = '00000000-0000-4000-8000-000000000032'
     where id = '40000000-0000-4000-8000-000000000012' $$,
  '42501', null, 'clients cannot change photo ownership'
);
select lives_ok(
  $$ insert into public.photo_variants (
       photo_id, creator_id, variant, storage_path, width, height, byte_size
     ) values (
       '40000000-0000-4000-8000-000000000012',
       '00000000-0000-4000-8000-000000000031',
       'large',
       '00000000-0000-4000-8000-000000000031/40000000-0000-4000-8000-000000000012/large.webp',
       1800, 1200, 200000
     ) $$,
  'authors can declare their own photo variants'
);
select lives_ok(
  $$ update public.entry_photos set position = 1
     where entry_id = '30000000-0000-4000-8000-000000000001'
       and photo_id = '40000000-0000-4000-8000-000000000001' $$,
  'authors can reorder their own entry photos'
);

reset role;

-- storage.objects rows stand in for Storage API writes; RLS still evaluates the same policies.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000032","role":"authenticated"}',
  true
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id, metadata)
     values (
       'photos',
       '00000000-0000-4000-8000-000000000031/40000000-0000-4000-8000-000000000001/thumb.webp',
       '00000000-0000-4000-8000-000000000032',
       '{"mimetype":"image/webp"}'::jsonb
     ) $$,
  '42501', null, 'foreign users cannot upload an owner variant'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id, metadata)
     values (
       'photos',
       '00000000-0000-4000-8000-000000000032/40000000-0000-4000-8000-000000000099/thumb.webp',
       '00000000-0000-4000-8000-000000000032',
       '{"mimetype":"image/webp"}'::jsonb
     ) $$,
  '42501', null, 'users cannot upload an undeclared variant'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000031","role":"authenticated"}',
  true
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id, metadata)
     values (
       'photos',
       '00000000-0000-4000-8000-000000000031/40000000-0000-4000-8000-000000000001/thumb.webp',
       '00000000-0000-4000-8000-000000000031',
       '{"mimetype":"image/webp"}'::jsonb
     ) $$,
  'authors can upload a declared own variant'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id, metadata)
     values (
       'photos',
       '00000000-0000-4000-8000-000000000031/40000000-0000-4000-8000-000000000002/thumb.webp',
       '00000000-0000-4000-8000-000000000031',
       '{"mimetype":"image/webp"}'::jsonb
     ) $$,
  'authors can upload a declared private variant'
);
select lives_ok(
  $$ update storage.objects
     set metadata = '{"mimetype":"image/webp","retried":true}'::jsonb
     where bucket_id = 'photos'
       and name =
         '00000000-0000-4000-8000-000000000031/40000000-0000-4000-8000-000000000001/thumb.webp'
     returning name $$,
  'authors can overwrite a declared own variant'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select results_eq(
  $$ select name from storage.objects
     where bucket_id = 'photos'
       and name like '00000000-0000-4000-8000-000000000031/%'
     order by name $$,
  $$ values (
       '00000000-0000-4000-8000-000000000031/40000000-0000-4000-8000-000000000001/thumb.webp'::text
     ) $$,
  'anonymous users only download variants attached to public published entries'
);
select throws_ok(
  $$ delete from storage.objects where bucket_id = 'photos' $$,
  '42501', null, 'anonymous users cannot delete photo objects'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000032","role":"authenticated"}',
  true
);
select results_eq(
  $$ select count(*)::bigint
     from public.photo_variants
     where storage_path =
       '00000000-0000-4000-8000-000000000031/40000000-0000-4000-8000-000000000001/thumb.webp'
       and creator_id = auth.uid() $$,
  $$ values (0::bigint) $$,
  'foreign users do not satisfy the object delete ownership predicate'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000031","role":"authenticated"}',
  true
);
select results_eq(
  $$ select count(*)::bigint from storage.objects
     where bucket_id = 'photos'
       and name like '00000000-0000-4000-8000-000000000031/%' $$,
  $$ values (2::bigint) $$,
  'authors can read all their own photo objects'
);
select results_eq(
  $$ select count(*)::bigint
     from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname = 'Authors can delete their photo variant objects'
       and cmd = 'DELETE' $$,
  $$ values (1::bigint) $$,
  'owner-scoped Storage API delete policy exists'
);

reset role;

select is(
  has_table_privilege('anon', 'public.photos', 'INSERT'),
  false,
  'anonymous users have no photo insert privilege'
);
select is(
  has_column_privilege('authenticated', 'public.photos', 'creator_id', 'UPDATE'),
  false,
  'authenticated users cannot update photo creator_id'
);
select is(
  has_column_privilege('authenticated', 'public.photo_variants', 'storage_path', 'UPDATE'),
  false,
  'authenticated users cannot change variant storage paths'
);
select is(
  has_column_privilege('authenticated', 'public.entry_photos', 'creator_id', 'UPDATE'),
  false,
  'authenticated users cannot change entry photo ownership'
);

select * from finish();
rollback;
