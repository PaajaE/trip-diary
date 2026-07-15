begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

select has_function(
  'public',
  'compute_source_content_hash',
  array['text', 'text'],
  'compute_source_content_hash function exists'
);
select has_function(
  'public',
  'mark_entry_translations_stale',
  'mark_entry_translations_stale trigger function exists'
);
select has_trigger(
  'public',
  'entries',
  'mark_entry_translations_stale_after_update',
  'entries has a stale translation trigger'
);
select results_eq(
  $$ select public.compute_source_content_hash(null, '') $$,
  $$ values ('00a20e27'::text) $$,
  'compute_source_content_hash matches the edge function for empty content'
);
select results_eq(
  $$ select public.compute_source_content_hash('Hello', 'World') $$,
  $$ values ('0f9a4fdd'::text) $$,
  'compute_source_content_hash matches the edge function for title and body'
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
values (
  '00000000-0000-4000-8000-000000000041',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'translation-stale@example.test',
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
  status,
  version
)
values
  (
    '20000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000041',
    'story',
    'Original title',
    'Original body',
    'cs',
    'public',
    'published',
    2
  ),
  (
    '20000000-0000-4000-8000-000000000012',
    '00000000-0000-4000-8000-000000000041',
    'note',
    'Failed entry title',
    'Failed entry body',
    'cs',
    'private',
    'draft',
    1
  ),
  (
    '20000000-0000-4000-8000-000000000013',
    '00000000-0000-4000-8000-000000000041',
    'note',
    'Processing entry title',
    'Processing entry body',
    'cs',
    'private',
    'draft',
    1
  ),
  (
    '20000000-0000-4000-8000-000000000014',
    '00000000-0000-4000-8000-000000000041',
    'note',
    'Same locale title',
    'Same locale body',
    'en',
    'private',
    'draft',
    1
  );

insert into public.entry_translations (
  id,
  entry_id,
  source_locale,
  target_locale,
  translated_title,
  translated_body,
  status,
  provider,
  model,
  source_content_hash,
  source_version
)
values
  (
    '30000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000011',
    'cs',
    'en',
    'Translated title',
    'Translated body',
    'succeeded',
    'mock',
    'mock-model',
    public.compute_source_content_hash('Original title', 'Original body'),
    2
  ),
  (
    '30000000-0000-4000-8000-000000000012',
    '20000000-0000-4000-8000-000000000012',
    'cs',
    'en',
    null,
    'Failed translation',
    'failed',
    'mock',
    'mock-model',
    public.compute_source_content_hash('Failed entry title', 'Failed entry body'),
    1
  ),
  (
    '30000000-0000-4000-8000-000000000013',
    '20000000-0000-4000-8000-000000000013',
    'cs',
    'en',
    'Processing title',
    'Processing body',
    'processing',
    'mock',
    'mock-model',
    public.compute_source_content_hash('Processing entry title', 'Processing entry body'),
    1
  ),
  (
    '30000000-0000-4000-8000-000000000014',
    '20000000-0000-4000-8000-000000000014',
    'en',
    'en',
    'Same locale title',
    'Same locale body',
    'succeeded',
    'mock',
    'mock-model',
    public.compute_source_content_hash('Same locale title', 'Same locale body'),
    1
  );

reset role;

select lives_ok(
  $$ update public.entries
     set body = 'Updated body'
     where id = '20000000-0000-4000-8000-000000000011' $$,
  'entry body updates run for stale trigger tests'
);
select results_eq(
  $$ select status::text
     from public.entry_translations
     where id = '30000000-0000-4000-8000-000000000011' $$,
  $$ values ('stale'::text) $$,
  'succeeded cross-locale translations become stale when entry body changes'
);
select lives_ok(
  $$ update public.entries
     set body = 'Updated failed body'
     where id = '20000000-0000-4000-8000-000000000012' $$,
  'failed entry body updates run for stale trigger tests'
);
select results_eq(
  $$ select status::text
     from public.entry_translations
     where id = '30000000-0000-4000-8000-000000000012' $$,
  $$ values ('failed'::text) $$,
  'failed translations stay failed when entry body changes'
);
select lives_ok(
  $$ update public.entries
     set body = 'Updated processing body'
     where id = '20000000-0000-4000-8000-000000000013' $$,
  'processing entry body updates run for stale trigger tests'
);
select results_eq(
  $$ select status::text
     from public.entry_translations
     where id = '30000000-0000-4000-8000-000000000013' $$,
  $$ values ('processing'::text) $$,
  'processing translations stay processing when entry body changes'
);
select lives_ok(
  $$ update public.entries
     set body = 'Updated same-locale body'
     where id = '20000000-0000-4000-8000-000000000014' $$,
  'same-locale entry body updates run for stale trigger tests'
);
select results_eq(
  $$ select status::text
     from public.entry_translations
     where id = '30000000-0000-4000-8000-000000000014' $$,
  $$ values ('succeeded'::text) $$,
  'same-locale translations are not marked stale'
);

update public.entry_translations
set
  status = 'succeeded',
  source_content_hash = public.compute_source_content_hash(
    'Original title',
    'Updated body'
  ),
  source_version = 2
where id = '30000000-0000-4000-8000-000000000011';

select lives_ok(
  $$ update public.entries
     set version = 3
     where id = '20000000-0000-4000-8000-000000000011' $$,
  'entry version updates run for stale trigger tests'
);
select results_eq(
  $$ select status::text
     from public.entry_translations
     where id = '30000000-0000-4000-8000-000000000011' $$,
  $$ values ('stale'::text) $$,
  'succeeded cross-locale translations become stale when entry version changes'
);

update public.entry_translations
set status = 'succeeded'
where id = '30000000-0000-4000-8000-000000000011';

select lives_ok(
  $$ update public.entries
     set title = 'Updated title'
     where id = '20000000-0000-4000-8000-000000000011' $$,
  'entry title updates run for stale trigger tests'
);
select results_eq(
  $$ select status::text
     from public.entry_translations
     where id = '30000000-0000-4000-8000-000000000011' $$,
  $$ values ('stale'::text) $$,
  'succeeded cross-locale translations become stale when entry title changes'
);

select * from finish();
rollback;
