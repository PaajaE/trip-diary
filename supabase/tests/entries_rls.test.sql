begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

select has_table('public', 'entries', 'entries table exists');
select col_is_pk('public', 'entries', 'id', 'entries.id is the primary key');
select has_trigger(
  'public',
  'entries',
  'prepare_entry_before_write',
  'entries has a write preparation trigger'
);
select has_function(
  'public',
  'update_entry',
  array[
    'uuid',
    'bigint',
    'entry_type',
    'text',
    'text',
    'entry_language',
    'entry_visibility',
    'entry_status',
    'timestamp with time zone',
    'double precision',
    'double precision'
  ],
  'versioned entry update RPC exists'
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
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'entry-owner@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000012',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'entry-stranger@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.entries (
  id,
  creator_id,
  type,
  title,
  body,
  visibility,
  status
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    'story',
    'Public story',
    'Published body',
    'public',
    'published'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000011',
    'note',
    'Public draft',
    'Draft body',
    'public',
    'draft'
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000011',
    'tip',
    'Private published tip',
    'Private body',
    'private',
    'published'
  );

select results_eq(
  $$ select version from public.entries
     where id = '10000000-0000-4000-8000-000000000001' $$,
  $$ values (1::bigint) $$,
  'new entries start at version one'
);
select isnt(
  (select published_at from public.entries where id = '10000000-0000-4000-8000-000000000001'),
  null,
  'published entries receive published_at'
);
select is(
  (select published_at from public.entries where id = '10000000-0000-4000-8000-000000000002'),
  null,
  'draft entries have no published_at'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq(
  $$ select id from public.entries
     where id in (
       '10000000-0000-4000-8000-000000000001',
       '10000000-0000-4000-8000-000000000002',
       '10000000-0000-4000-8000-000000000003'
     )
     order by id $$,
  $$ values ('10000000-0000-4000-8000-000000000001'::uuid) $$,
  'anonymous users only read published public entries'
);
select throws_ok(
  $$ insert into public.entries (id, creator_id, type)
     values (
       '10000000-0000-4000-8000-000000000010',
       '00000000-0000-4000-8000-000000000011',
       'note'
     ) $$,
  '42501',
  null,
  'anonymous users cannot insert entries'
);
select throws_ok(
  $$ select public.update_entry(
       '10000000-0000-4000-8000-000000000001',
       1,
       'story',
       'Changed',
       'Changed',
       'cs',
       'public',
       'published',
       null,
       null,
       null
     ) $$,
  '42501',
  null,
  'anonymous users cannot execute the update RPC'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000012","role":"authenticated"}',
  true
);

select results_eq(
  $$ select id from public.entries
     where id in (
       '10000000-0000-4000-8000-000000000001',
       '10000000-0000-4000-8000-000000000002',
       '10000000-0000-4000-8000-000000000003'
     )
     order by id $$,
  $$ values ('10000000-0000-4000-8000-000000000001'::uuid) $$,
  'foreign authenticated users only read published public entries'
);
select throws_ok(
  $$ insert into public.entries (id, creator_id, type)
     values (
       '10000000-0000-4000-8000-000000000011',
       '00000000-0000-4000-8000-000000000011',
       'note'
     ) $$,
  '42501',
  null,
  'authenticated users cannot spoof creator_id'
);
select throws_ok(
  $$ select public.update_entry(
       '10000000-0000-4000-8000-000000000001',
       1,
       'story',
       'Foreign change',
       'Foreign change',
       'cs',
       'public',
       'published',
       null,
       null,
       null
     ) $$,
  '42501',
  'entry is unavailable or not owned by the current user',
  'foreign users cannot update another author entry'
);
select results_eq(
  $$ delete from public.entries
     where id = '10000000-0000-4000-8000-000000000001'
     returning id $$,
  $$ select id from public.entries where false $$,
  'foreign users cannot delete another author entry'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000011","role":"authenticated"}',
  true
);

select results_eq(
  $$ select count(*)::bigint from public.entries
     where creator_id = '00000000-0000-4000-8000-000000000011' $$,
  $$ values (3::bigint) $$,
  'authors can read all their entries'
);
select lives_ok(
  $$ insert into public.entries (
       id, creator_id, type, title, body, language, visibility, status,
       event_at, latitude, longitude
     )
     values (
       '10000000-0000-4000-8000-000000000020',
       '00000000-0000-4000-8000-000000000011',
       'place',
       'Offline place',
       '',
       'en',
       'private',
       'draft',
       '2026-06-09T10:00:00Z',
       51.0447,
       -114.0719
     ) $$,
  'authors can insert client-generated entries'
);
select results_eq(
  $$ select creator_id from public.entries
     where id = '10000000-0000-4000-8000-000000000020' $$,
  $$ values ('00000000-0000-4000-8000-000000000011'::uuid) $$,
  'inserted entry belongs to the authenticated author'
);
select throws_ok(
  $$ insert into public.entries (
       id, creator_id, type, latitude, longitude
     )
     values (
       '10000000-0000-4000-8000-000000000021',
       '00000000-0000-4000-8000-000000000011',
       'place',
       91,
       0
     ) $$,
  '23514',
  null,
  'invalid coordinates are rejected'
);
select throws_ok(
  $$ insert into public.entries (
       id, creator_id, type, latitude
     )
     values (
       '10000000-0000-4000-8000-000000000022',
       '00000000-0000-4000-8000-000000000011',
       'place',
       50
     ) $$,
  '23514',
  null,
  'partial coordinates are rejected'
);
select throws_ok(
  $$ update public.entries
     set body = 'Direct update'
     where id = '10000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'direct client updates cannot bypass optimistic locking'
);
select results_eq(
  $$ select id, version, body
     from public.update_entry(
       '10000000-0000-4000-8000-000000000001',
       1,
       'story',
       'Public story updated',
       'Updated through RPC',
       'cs',
       'public',
       'published',
       null,
       null,
       null
     ) $$,
  $$ values (
       '10000000-0000-4000-8000-000000000001'::uuid,
       2::bigint,
       'Updated through RPC'::text
     ) $$,
  'versioned RPC updates the entry and increments its version'
);
select throws_ok(
  $$ select public.update_entry(
       '10000000-0000-4000-8000-000000000001',
       1,
       'story',
       'Stale update',
       'Stale update',
       'cs',
       'public',
       'published',
       null,
       null,
       null
     ) $$,
  '40001',
  'entry version conflict',
  'stale expected_version raises an explicit conflict'
);
select results_eq(
  $$ select version, body from public.entries
     where id = '10000000-0000-4000-8000-000000000001' $$,
  $$ values (2::bigint, 'Updated through RPC'::text) $$,
  'a version conflict does not overwrite the entry'
);
select throws_ok(
  $$ insert into public.entries (id, creator_id, type, version)
     values (
       '10000000-0000-4000-8000-000000000023',
       '00000000-0000-4000-8000-000000000011',
       'note',
       99
     ) $$,
  '42501',
  null,
  'clients cannot choose an initial version'
);
select lives_ok(
  $$ select public.update_entry(
       '10000000-0000-4000-8000-000000000003',
       1,
       'tip',
       'Now a draft',
       'Private draft',
       'cs',
       'private',
       'draft',
       null,
       null,
       null
     ) $$,
  'authors can move their published entry back to draft'
);
select is(
  (select published_at from public.entries where id = '10000000-0000-4000-8000-000000000003'),
  null,
  'moving an entry back to draft clears published_at'
);
select results_eq(
  $$ delete from public.entries
     where id = '10000000-0000-4000-8000-000000000020'
     returning id $$,
  $$ values ('10000000-0000-4000-8000-000000000020'::uuid) $$,
  'authors can delete their own entries'
);
reset role;

select is(
  has_function_privilege('anon', 'public.update_entry(uuid,bigint,public.entry_type,text,text,public.entry_language,public.entry_visibility,public.entry_status,timestamptz,double precision,double precision)', 'EXECUTE'),
  false,
  'anonymous users cannot execute the update RPC'
);
select is(
  has_function_privilege('authenticated', 'public.prepare_entry_write()', 'EXECUTE'),
  false,
  'authenticated users cannot execute the write trigger function'
);

select * from finish();
rollback;
