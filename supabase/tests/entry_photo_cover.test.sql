begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- Seed two owners and two entries with multiple photos.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-4000-8000-000000000041',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'cover-owner@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-4000-8000-000000000042',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'cover-other@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.entries (id, creator_id, type, title, visibility, status)
values
  ('41000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000041', 'story', 'Cover A', 'public', 'published'),
  ('41000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000042', 'story', 'Cover B', 'public', 'published');

insert into public.photos (id, creator_id)
values
  ('42000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000041'),
  ('42000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000041'),
  ('42000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000041'),
  ('42000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000042');

-- Insert without setting is_cover so backfill-style lowest position wins via app default false.
insert into public.entry_photos (entry_id, photo_id, creator_id, position, is_cover)
values
  ('41000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000041', 0, true),
  ('41000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000041', 1, false),
  ('41000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000041', 2, false),
  ('41000000-0000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000042', 0, true);

select results_eq(
  $$ select photo_id::text
     from public.entry_photos
     where entry_id = '41000000-0000-4000-8000-000000000001'
       and is_cover
     order by photo_id $$,
  $$ values ('42000000-0000-4000-8000-000000000001') $$,
  'lowest-position photo is the initial cover'
);

select throws_ok(
  $$ update public.entry_photos
     set is_cover = true
     where entry_id = '41000000-0000-4000-8000-000000000001'
       and photo_id = '42000000-0000-4000-8000-000000000002' $$,
  '23505',
  null,
  'second cover for the same entry is rejected'
);

select lives_ok(
  $$ delete from public.entry_photos
     where entry_id = '41000000-0000-4000-8000-000000000001'
       and photo_id = '42000000-0000-4000-8000-000000000002' $$,
  'deleting a non-cover photo succeeds'
);

select results_eq(
  $$ select photo_id::text
     from public.entry_photos
     where entry_id = '41000000-0000-4000-8000-000000000001'
       and is_cover $$,
  $$ values ('42000000-0000-4000-8000-000000000001') $$,
  'deleting a non-cover does not change the cover'
);

select lives_ok(
  $$ delete from public.entry_photos
     where entry_id = '41000000-0000-4000-8000-000000000001'
       and photo_id = '42000000-0000-4000-8000-000000000001' $$,
  'deleting the cover photo succeeds'
);

select results_eq(
  $$ select photo_id::text
     from public.entry_photos
     where entry_id = '41000000-0000-4000-8000-000000000001'
       and is_cover $$,
  $$ values ('42000000-0000-4000-8000-000000000003') $$,
  'deleting the cover promotes the next lowest-position photo'
);

select lives_ok(
  $$ delete from public.entry_photos
     where entry_id = '41000000-0000-4000-8000-000000000001'
       and photo_id = '42000000-0000-4000-8000-000000000003' $$,
  'deleting the last photo succeeds'
);

select is_empty(
  $$ select 1
     from public.entry_photos
     where entry_id = '41000000-0000-4000-8000-000000000001' $$,
  'deleting the last photo leaves no cover rows'
);

-- Re-seed for atomic cover RPC tests.
insert into public.photos (id, creator_id)
values
  ('42000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000041'),
  ('42000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000041');

insert into public.entry_photos (entry_id, photo_id, creator_id, position, is_cover)
values
  ('41000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000041', 0, true),
  ('41000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000041', 1, false);

select has_function(
  'public',
  'set_entry_photo_cover',
  array['uuid', 'uuid'],
  'set_entry_photo_cover exists'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000041","role":"authenticated"}',
  true
);

select lives_ok(
  $$ select public.set_entry_photo_cover(
       '41000000-0000-4000-8000-000000000001',
       '42000000-0000-4000-8000-000000000012'
     ) $$,
  'cover can be changed atomically'
);

select results_eq(
  $$ select photo_id::text
     from public.entry_photos
     where entry_id = '41000000-0000-4000-8000-000000000001'
       and is_cover $$,
  $$ values ('42000000-0000-4000-8000-000000000012') $$,
  'atomic cover change leaves exactly one cover'
);

select lives_ok(
  $$ select public.set_entry_photo_cover(
       '41000000-0000-4000-8000-000000000001',
       '42000000-0000-4000-8000-000000000012'
     ) $$,
  'repeated cover request is idempotent'
);

select throws_ok(
  $$ select public.set_entry_photo_cover(
       '41000000-0000-4000-8000-000000000001',
       '42000000-0000-4000-8000-000000000004'
     ) $$,
  '22023',
  'photo is not linked to this entry',
  'cover rejects photos not linked to the entry'
);

reset role;

select results_eq(
  $$ select entry_id::text, photo_id::text
     from public.entry_photos
     where is_cover
       and entry_id in (
         '41000000-0000-4000-8000-000000000001',
         '41000000-0000-4000-8000-000000000002'
       )
     order by entry_id $$,
  $$ values
     ('41000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000012'),
     ('41000000-0000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000004')
  $$,
  'different entries can each keep their own cover'
);

select * from finish();
rollback;
