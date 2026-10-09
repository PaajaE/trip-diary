begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

select has_table('public', 'segments', 'segments table exists');
select has_table('public', 'moments', 'moments table exists');
select has_table('public', 'media', 'media table exists');
select has_table('public', 'media_variants', 'media variants table exists');
select has_table('public', 'posts', 'posts table exists');
select results_eq(
  $$ select count(*)::int from public.tags where kind = 'category' $$,
  $$ values (7) $$,
  'fixed categories are seeded'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000071','00000000-0000-0000-0000-000000000000','authenticated','authenticated','v2-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000072','00000000-0000-0000-0000-000000000000','authenticated','authenticated','v2-editor@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000073','00000000-0000-0000-0000-000000000000','authenticated','authenticated','v2-viewer@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000074','00000000-0000-0000-0000-000000000000','authenticated','authenticated','v2-stranger@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

-- ---------------------------------------------------------------- owner
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000071","role":"authenticated"}',true);

select lives_ok(
  $$ insert into public.journeys (id, creator_id, title, visibility, slug, home_tz)
     values ('a0000000-0000-4000-8000-000000000001', auth.uid(), 'Kanada 2026', 'public', 'kanada', 'America/Edmonton') $$,
  'owner creates a public journey with home time zone'
);
select throws_ok(
  $$ insert into public.journeys (id, creator_id, title, visibility, home_tz)
     values ('a0000000-0000-4000-8000-000000000009', auth.uid(), 'Bad tz', 'private', 'not a zone') $$,
  '23514', null, 'journey home time zone must look like an IANA name'
);
select lives_ok(
  $$ insert into public.journey_members (journey_id, user_id, role) values
     ('a0000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000072','editor'),
     ('a0000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000073','member') $$,
  'owner adds an editor and a read-only member'
);

-- ---------------------------------------------------------------- editor
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000072","role":"authenticated"}',true);

select lives_ok(
  $$ insert into public.segments (id, journey_id, kind, title, starts_at, ends_at, created_by)
     values ('a1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','stage','Rockies',
             '2026-05-25T06:00:00Z','2026-06-25T06:00:00Z', auth.uid()) $$,
  'editor creates a stage'
);
select lives_ok(
  $$ insert into public.segments (id, journey_id, parent_id, kind, trip_type, title, starts_at, ends_at, created_by)
     values ('a1000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001',
             'a1000000-0000-4000-8000-000000000001','trip','trek','Lake Magog',
             '2026-06-02T14:00:00Z','2026-06-08T02:00:00Z', auth.uid()) $$,
  'editor creates a trek nested in the stage'
);
select throws_ok(
  $$ insert into public.segments (id, journey_id, kind, trip_type, title, starts_at, ends_at, created_by)
     values ('a1000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001','stage','trek','Bad',
             '2026-06-02T00:00:00Z','2026-06-03T00:00:00Z', auth.uid()) $$,
  '23514', null, 'a stage cannot carry a trip type'
);
select throws_ok(
  $$ insert into public.segments (id, journey_id, kind, title, starts_at, ends_at, created_by)
     values ('a1000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000001','stage','Backwards',
             '2026-06-03T00:00:00Z','2026-06-02T00:00:00Z', auth.uid()) $$,
  '23514', null, 'segment must end after it starts'
);
select lives_ok(
  $$ insert into public.moments (id, journey_id, starts_at, ends_at, latitude, longitude, title, created_by)
     values ('a2000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',
             '2026-06-03T14:00:00Z','2026-06-03T15:00:00Z', 50.8722, -115.6458, 'Kemp u Magog', auth.uid()) $$,
  'editor creates a moment'
);
select lives_ok(
  $$ insert into public.moments (id, journey_id, starts_at, ends_at, published, created_by)
     values ('a2000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001',
             '2026-06-04T14:00:00Z','2026-06-04T15:00:00Z', false, auth.uid()) $$,
  'editor creates an unpublished moment'
);
select lives_ok(
  $$ insert into public.media (id, owner_id, journey_id, kind, status, captured_at, captured_tz,
                               latitude, longitude, width, height, moment_id)
     values
     ('a3000000-0000-4000-8000-000000000001', auth.uid(), 'a0000000-0000-4000-8000-000000000001', 'photo', 'ready',
      '2026-06-03T14:30:00Z', 'America/Edmonton', 50.8722, -115.6458, 4032, 3024, 'a2000000-0000-4000-8000-000000000001'),
     ('a3000000-0000-4000-8000-000000000002', auth.uid(), 'a0000000-0000-4000-8000-000000000001', 'photo', 'ready',
      '2026-06-04T14:30:00Z', 'America/Edmonton', 50.8800, -115.6500, 4032, 3024, 'a2000000-0000-4000-8000-000000000002'),
     ('a3000000-0000-4000-8000-000000000003', auth.uid(), 'a0000000-0000-4000-8000-000000000001', 'photo', 'pending',
      '2026-06-05T14:30:00Z', 'America/Edmonton', null, null, null, null, null) $$,
  'editor adds own media to the journey'
);
select lives_ok(
  $$ insert into public.media_variants (media_id, kind, storage_key, mime_type, width, height, byte_size)
     values ('a3000000-0000-4000-8000-000000000001','small',
             '00000000-0000-4000-8000-000000000072/a3000000-0000-4000-8000-000000000001/small.webp',
             'image/webp', 800, 600, 64000) $$,
  'media owner declares a variant under their own key prefix'
);
select throws_ok(
  $$ insert into public.media_variants (media_id, kind, storage_key, mime_type, width, height, byte_size)
     values ('a3000000-0000-4000-8000-000000000001','thumb',
             '00000000-0000-4000-8000-000000000071/a3000000-0000-4000-8000-000000000001/thumb.webp',
             'image/webp', 220, 165, 9000) $$,
  '42501', null, 'variant key must start with the owner and media id'
);
select throws_ok(
  $$ insert into public.media (id, owner_id, kind, duration_ms) values
     ('a3000000-0000-4000-8000-000000000008', auth.uid(), 'photo', 1000) $$,
  '23514', null, 'photos cannot have a duration'
);
select throws_ok(
  $$ insert into public.media (id, owner_id, moment_id) values
     ('a3000000-0000-4000-8000-000000000009', auth.uid(), 'a2000000-0000-4000-8000-000000000001') $$,
  '23514', null, 'media outside a journey cannot belong to a moment'
);

-- ---------------------------------------------------------------- owner again
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000071","role":"authenticated"}',true);

select lives_ok(
  $$ update public.media set caption = 'Ranní mlha', starred = true
     where id = 'a3000000-0000-4000-8000-000000000001' $$,
  'journey owner edits media uploaded by an editor'
);
select results_eq(
  $$ select caption from public.media where id = 'a3000000-0000-4000-8000-000000000001' $$,
  $$ values ('Ranní mlha'::text) $$,
  'caption edit is stored'
);
select lives_ok(
  $$ update public.journeys set cover_media_id = 'a3000000-0000-4000-8000-000000000001'
     where id = 'a0000000-0000-4000-8000-000000000001' $$,
  'owner sets a journey cover from its media'
);
select lives_ok(
  $$ insert into public.media (id, owner_id, kind, status) values
     ('a3000000-0000-4000-8000-000000000010', auth.uid(), 'photo', 'ready') $$,
  'owner keeps unassigned media in an inbox'
);
select throws_ok(
  $$ update public.journeys set cover_media_id = 'a3000000-0000-4000-8000-000000000010'
     where id = 'a0000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'journey cover must come from the same journey'
);
select lives_ok(
  $$ update public.media set hide_location = true
     where id = 'a3000000-0000-4000-8000-000000000001' $$,
  'owner hides the location of a media item'
);

-- ---------------------------------------------------------------- read-only member
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000073","role":"authenticated"}',true);

select results_eq(
  $$ select count(*)::int from public.segments where journey_id = 'a0000000-0000-4000-8000-000000000001' $$,
  $$ values (2) $$,
  'read-only member reads segments'
);
select results_eq(
  $$ select count(*)::int from public.media where id = 'a3000000-0000-4000-8000-000000000010' $$,
  $$ values (0) $$,
  'members do not see another user''s inbox media'
);
select throws_ok(
  $$ insert into public.moments (id, journey_id, starts_at, ends_at, created_by)
     values ('a2000000-0000-4000-8000-000000000009','a0000000-0000-4000-8000-000000000001',
             '2026-06-05T00:00:00Z','2026-06-05T01:00:00Z', auth.uid()) $$,
  '42501', null, 'read-only member cannot create moments'
);
update public.segments set title = 'Hacked' where id = 'a1000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select title from public.segments where id = 'a1000000-0000-4000-8000-000000000001' $$,
  $$ values ('Rockies'::text) $$,
  'read-only member updates are ignored'
);

-- ---------------------------------------------------------------- stranger
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000074","role":"authenticated"}',true);

select results_eq(
  $$ select count(*)::int from public.media where journey_id = 'a0000000-0000-4000-8000-000000000001' $$,
  $$ values (0) $$,
  'stranger cannot read journey media directly'
);
select throws_ok(
  $$ insert into public.media (id, owner_id, journey_id) values
     ('a3000000-0000-4000-8000-000000000011', auth.uid(), 'a0000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'stranger cannot add media to the journey'
);
select throws_ok(
  $$ insert into public.taggings (tag_id, target_type, target_id, created_by)
     select id, 'media', 'a3000000-0000-4000-8000-000000000001', auth.uid()
     from public.tags where kind = 'category' and slug = 'fauna' $$,
  '42501', null, 'stranger cannot tag journey media'
);
select throws_ok(
  $$ insert into public.tags (kind, slug, label, created_by)
     values ('category', 'weather', 'Počasí', auth.uid()) $$,
  '42501', null, 'users cannot add fixed categories'
);
select lives_ok(
  $$ insert into public.tags (kind, slug, label, created_by)
     values ('free', 'grizzly', 'Grizzly', auth.uid()) $$,
  'users can add free tags'
);
select throws_ok(
  $$ insert into public.posts (id, author_id, space_id, title)
     select 'a4000000-0000-4000-8000-000000000009', auth.uid(), s.id, 'Not mine'
     from public.spaces s where s.personal_owner_id = '00000000-0000-4000-8000-000000000071' $$,
  '42501', null, 'stranger cannot post into another user''s space'
);

-- ---------------------------------------------------------------- editor tags
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000072","role":"authenticated"}',true);
select lives_ok(
  $$ insert into public.taggings (tag_id, target_type, target_id, created_by)
     select id, 'media', 'a3000000-0000-4000-8000-000000000001', auth.uid()
     from public.tags where kind = 'category' and slug = 'fauna' $$,
  'journey editor tags journey media'
);

-- ---------------------------------------------------------------- owner posts
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000071","role":"authenticated"}',true);
select lives_ok(
  $$ insert into public.posts (id, author_id, space_id, kind, title, body, slug, visibility, published_at)
     select 'a4000000-0000-4000-8000-000000000001', auth.uid(), s.id, 'tip', 'Medvědí sprej',
            'Kupte ho hned v Calgary.', 'medvedi-sprej', 'public', now()
     from public.spaces s where s.personal_owner_id = auth.uid() $$,
  'owner writes a tip outside any journey'
);

-- ---------------------------------------------------------------- anon
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);

select throws_ok(
  $$ select count(*) from public.media $$,
  '42501', null, 'anon has no direct access to media'
);
select throws_ok(
  $$ select count(*) from public.segments $$,
  '42501', null, 'anon has no direct access to segments'
);

reset role;
create temporary table public_journey as
select public.get_public_journey(
  (select handle from public.spaces where personal_owner_id = '00000000-0000-4000-8000-000000000071'),
  'kanada'
) as doc;
grant select on public_journey to anon;
set local role anon;

select results_eq(
  $$ select doc -> 'journey' ->> 'title' from public_journey $$,
  $$ values ('Kanada 2026'::text) $$,
  'public RPC returns the journey'
);
select results_eq(
  $$ select jsonb_array_length(doc -> 'segments') from public_journey $$,
  $$ values (2) $$,
  'public RPC returns segments'
);
select results_eq(
  $$ select jsonb_path_query_array(doc, '$.moments[*].id') from public_journey $$,
  $$ values ('["a2000000-0000-4000-8000-000000000001"]'::jsonb) $$,
  'public RPC returns only published moments'
);
select results_eq(
  $$ select jsonb_path_query_array(doc, '$.media[*].id') from public_journey $$,
  $$ values ('["a3000000-0000-4000-8000-000000000001"]'::jsonb) $$,
  'public RPC leaves out pending media and media of unpublished moments'
);
select results_eq(
  $$ select doc -> 'media' -> 0 -> 'latitude' from public_journey $$,
  $$ values ('null'::jsonb) $$,
  'public RPC hides coordinates of hidden-location media'
);

reset role;
update public.journeys set visibility = 'private' where id = 'a0000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select public.get_public_journey(
       (select handle from public.spaces where personal_owner_id = '00000000-0000-4000-8000-000000000071'),
       'kanada') $$,
  $$ values (null::jsonb) $$,
  'public RPC returns nothing for a private journey'
);
delete from public.journeys where id = 'a0000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select count(*)::int from public.media
     where id in ('a3000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000002')
       and journey_id is null and moment_id is null $$,
  $$ values (2) $$,
  'deleting a journey keeps media and detaches them'
);

select * from finish();
rollback;
