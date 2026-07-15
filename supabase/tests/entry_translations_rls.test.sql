begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

select has_table(
  'public',
  'entry_translations',
  'entry_translations table exists'
);
select has_enum(
  'public',
  'translation_status',
  'translation_status enum exists'
);
select col_is_pk(
  'public',
  'entry_translations',
  'id',
  'entry_translations.id is the primary key'
);
select col_not_null(
  'public',
  'entry_translations',
  'entry_id',
  'entry_translations.entry_id is required'
);
select col_has_default(
  'public',
  'entry_translations',
  'status',
  'entry_translations.status defaults to pending'
);
select has_index(
  'public',
  'entry_translations',
  'entry_translations_entry_id_idx',
  'entry_translations has an entry_id index'
);
select has_index(
  'public',
  'entry_translations',
  'entry_translations_status_idx',
  'entry_translations has a status index'
);
select has_trigger(
  'public',
  'entry_translations',
  'set_entry_translations_updated_at',
  'entry_translations has an updated_at trigger'
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
    '00000000-0000-4000-8000-000000000031',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'translation-owner@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000032',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'translation-stranger@example.test',
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
  language,
  visibility,
  status
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000031',
    'story',
    'Owner story',
    'Original body',
    'cs',
    'public',
    'published'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000032',
    'note',
    'Stranger note',
    'Private body',
    'en',
    'private',
    'draft'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000031","role":"authenticated"}',
  true
);

select lives_ok(
  $$ insert into public.entry_translations (
       id,
       entry_id,
       source_locale,
       target_locale,
       translated_title,
       translated_body,
       status,
       provider,
       model,
       source_version
     )
     values (
       '30000000-0000-4000-8000-000000000001',
       '20000000-0000-4000-8000-000000000001',
       'cs',
       'en',
       'Owner story',
       'Translated body',
       'succeeded',
       'mock',
       'mock-model',
       1
     ) $$,
  'authors can insert translations for their entries'
);
select results_eq(
  $$ select count(*)::bigint
     from public.entry_translations
     where entry_id = '20000000-0000-4000-8000-000000000001' $$,
  $$ values (1::bigint) $$,
  'authors can read translations for their entries'
);
select lives_ok(
  $$ update public.entry_translations
     set translated_body = 'Updated translation'
     where id = '30000000-0000-4000-8000-000000000001' $$,
  'authors can update translations for their entries'
);
select throws_ok(
  $$ insert into public.entry_translations (
       id,
       entry_id,
       source_locale,
       target_locale,
       translated_body
     )
     values (
       '30000000-0000-4000-8000-000000000002',
       '20000000-0000-4000-8000-000000000001',
       'cs',
       'en',
       'Duplicate target locale'
     ) $$,
  '23505',
  null,
  'duplicate entry_id and target_locale are rejected'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000032","role":"authenticated"}',
  true
);

select throws_ok(
  $$ insert into public.entry_translations (
       id,
       entry_id,
       source_locale,
       target_locale,
       translated_body
     )
     values (
       '30000000-0000-4000-8000-000000000003',
       '20000000-0000-4000-8000-000000000001',
       'cs',
       'en',
       'Foreign translation'
     ) $$,
  '42501',
  null,
  'foreign authors cannot insert translations for another entry'
);
select results_eq(
  $$ select count(*)::bigint
     from public.entry_translations
     where entry_id = '20000000-0000-4000-8000-000000000001' $$,
  $$ values (0::bigint) $$,
  'foreign authors cannot read another author translations'
);
select results_eq(
  $$ update public.entry_translations
     set translated_body = 'Foreign update'
     where id = '30000000-0000-4000-8000-000000000001'
     returning id $$,
  $$ select id from public.entry_translations where false $$,
  'foreign authors cannot update another author translations'
);
select results_eq(
  $$ delete from public.entry_translations
     where id = '30000000-0000-4000-8000-000000000001'
     returning id $$,
  $$ select id from public.entry_translations where false $$,
  'foreign authors cannot delete another author translations'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ insert into public.entry_translations (
       id,
       entry_id,
       source_locale,
       target_locale,
       translated_body
     )
     values (
       '30000000-0000-4000-8000-000000000004',
       '20000000-0000-4000-8000-000000000001',
       'cs',
       'en',
       'Anonymous translation'
     ) $$,
  '42501',
  null,
  'anonymous users cannot insert translations'
);
select throws_ok(
  $$ select count(*)::bigint
     from public.entry_translations $$,
  '42501',
  'permission denied for table entry_translations',
  'anonymous users cannot read translations'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000031","role":"authenticated"}',
  true
);
select results_eq(
  $$ delete from public.entry_translations
     where id = '30000000-0000-4000-8000-000000000001'
     returning id $$,
  $$ values ('30000000-0000-4000-8000-000000000001'::uuid) $$,
  'authors can delete translations for their entries'
);

reset role;

select * from finish();
rollback;
