begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-4000-8000-000000000051',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'focal-owner@example.test', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.entries (id, creator_id, type, title, visibility, status)
values (
  '51000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000051',
  'story',
  'Focal A',
  'public',
  'published'
);

insert into public.photos (id, creator_id)
values (
  '52000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000051'
);

insert into public.entry_photos (entry_id, photo_id, creator_id, position, is_cover)
values (
  '51000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000051',
  0,
  true
);

select is(
  (
    select focal_x is null and focal_y is null
    from public.entry_photos
    where entry_id = '51000000-0000-4000-8000-000000000001'
  ),
  true,
  'new cover links default to null focal coordinates'
);

select lives_ok(
  $$ update public.entry_photos
     set focal_x = 0.25, focal_y = 0.75
     where entry_id = '51000000-0000-4000-8000-000000000001'
       and photo_id = '52000000-0000-4000-8000-000000000001' $$,
  'normalized focal coordinates can be stored'
);

select results_eq(
  $$ select round(focal_x::numeric, 2), round(focal_y::numeric, 2)
     from public.entry_photos
     where entry_id = '51000000-0000-4000-8000-000000000001' $$,
  $$ values (0.25, 0.75) $$,
  'stored focal coordinates round-trip'
);

select throws_ok(
  $$ update public.entry_photos
     set focal_x = 1.5, focal_y = 0.5
     where entry_id = '51000000-0000-4000-8000-000000000001'
       and photo_id = '52000000-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'focal coordinates outside 0..1 are rejected'
);

select * from finish();
rollback;
