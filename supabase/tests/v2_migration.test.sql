begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- v1 fixture (inserted as the migration owner, like the real switchover).
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000081','00000000-0000-0000-0000-000000000000','authenticated','authenticated','v1-author@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

insert into public.journeys (id, creator_id, title, visibility, slug)
values ('b0000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000081','Kanada 2026','public','kanada-v1');

insert into public.journey_stages (id, journey_id, creator_id, title, summary, position, starts_at, ends_at) values
('b1000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000081','Rockies','Měsíc v horách',0,'2026-05-25','2026-06-25'),
('b1000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000081','Na sever','',1,null,null);

insert into public.journey_stops (id, journey_id, stage_id, creator_id, title, status, position, latitude, longitude) values
('b2000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000081','Lake Magog','visited',0,50.8722,-115.6458),
('b2000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001',null,'00000000-0000-4000-8000-000000000081','Někdy později','planned',1,null,null);

insert into public.entries (id, creator_id, type, title, body, visibility, status, event_at, published_at) values
('b3000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000081','story','Národní park Yoho','Jarní tání.','public','published','2026-08-26T10:00:00Z',now()),
('b3000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000081','note','Koncept','Rozepsáno.','private','draft','2026-07-10T18:00:00Z',null),
('b3000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000081','tip',null,'Medvědí sprej kupte v Calgary.','public','published','2026-05-20T10:00:00Z',now()),
('b3000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000081','story','Soukromé','Jen pro nás.','private','draft',null,null);

insert into public.entry_journey_links (entry_id, journey_id, stage_id, stop_id, creator_id) values
('b3000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000081'),
('b3000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002',null,'00000000-0000-4000-8000-000000000081');

insert into public.photos (id, creator_id, captured_at, latitude, longitude, media_type, duration_ms) values
('b4000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000081','2026-06-03T14:30:00Z',50.8722,-115.6458,'photo',null),
('b4000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000081','2026-06-03T15:10:00Z',50.8730,-115.6470,'video',42000),
('b4000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000081','2026-05-20T09:00:00Z',null,null,'photo',null),
('b4000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000081',null,null,null,'photo',null);

insert into public.photo_variants (photo_id, creator_id, variant, storage_path, width, height, byte_size, mime_type) values
('b4000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000081','thumb','00000000-0000-4000-8000-000000000081/b4000000-0000-4000-8000-000000000001/thumb.webp',220,165,9000,'image/webp'),
('b4000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000081','small','00000000-0000-4000-8000-000000000081/b4000000-0000-4000-8000-000000000001/small.webp',800,600,60000,'image/webp'),
('b4000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000081','preview','00000000-0000-4000-8000-000000000081/b4000000-0000-4000-8000-000000000001/preview.webp',2400,1800,400000,'image/webp'),
('b4000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000081','large','00000000-0000-4000-8000-000000000081/b4000000-0000-4000-8000-000000000001/large.webp',1600,1200,200000,'image/webp'),
('b4000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000081','full','00000000-0000-4000-8000-000000000081/b4000000-0000-4000-8000-000000000001/full.webp',2400,1800,400000,'image/webp'),
('b4000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000081','thumb','00000000-0000-4000-8000-000000000081/b4000000-0000-4000-8000-000000000002/thumb.jpg',220,124,8000,'image/jpeg'),
('b4000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000081','video','00000000-0000-4000-8000-000000000081/b4000000-0000-4000-8000-000000000002/video.mp4',1920,1080,20000000,'video/mp4'),
('b4000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000081','small','00000000-0000-4000-8000-000000000081/b4000000-0000-4000-8000-000000000003/small.webp',800,600,50000,'image/webp');

insert into public.entry_photos (entry_id, photo_id, creator_id, position, is_cover, caption, focal_x, focal_y) values
('b3000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000081',0,true,'Ráno u jezera',0.4,0.6),
('b3000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000081',1,false,null,null,null),
('b3000000-0000-4000-8000-000000000003','b4000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000081',0,false,null,null,null);

insert into public.journey_guide_sections (id, journey_id, creator_id, title, body, position) values
('b5000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000081','Doprava','Auto je nutnost.',0);

insert into public.journey_photo_tags (id, journey_id, slug, label) values
('b6000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','medved','Medvěd');
insert into public.photo_tag_assignments (photo_id, tag_id, creator_id) values
('b4000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000081');

-- ------------------------------------------------------------------ run
select lives_ok($$ select public.v2_migrate_from_v1() $$, 'migration runs');
select results_eq(
  $$ select bool_and(ok) from public.v2_verify_migration() $$,
  $$ values (true) $$,
  'every verification check passes'
);

-- Moments take their time from photos, not from when the entry was written.
select results_eq(
  $$ select starts_at, ends_at from public.moments where id = 'b3000000-0000-4000-8000-000000000001' $$,
  $$ values ('2026-06-03T14:30:00Z'::timestamptz, '2026-06-03T15:10:00Z'::timestamptz) $$,
  'moment spans its photos'
);
select results_eq(
  $$ select published, locked, origin::text, place_id, cover_media_id
     from public.moments where id = 'b3000000-0000-4000-8000-000000000001' $$,
  $$ values (true, true, 'manual'::text,
             'b2000000-0000-4000-8000-000000000001'::uuid,
             'b4000000-0000-4000-8000-000000000001'::uuid) $$,
  'published entry becomes a locked manual moment with place and cover'
);
select results_eq(
  $$ select published, starts_at from public.moments where id = 'b3000000-0000-4000-8000-000000000002' $$,
  $$ values (false, '2026-07-10T18:00:00Z'::timestamptz) $$,
  'draft entry becomes an unpublished moment dated by its event time'
);

select results_eq(
  $$ select journey_id, moment_id, caption, focal_x, status::text
     from public.media where id = 'b4000000-0000-4000-8000-000000000001' $$,
  $$ values ('b0000000-0000-4000-8000-000000000001'::uuid,
             'b3000000-0000-4000-8000-000000000001'::uuid,
             'Ráno u jezera'::text, 0.4::float8, 'ready'::text) $$,
  'photo becomes journey media grouped in its moment'
);
select results_eq(
  $$ select mv.kind::text, mv.storage_key from public.media_variants mv
     where mv.media_id = 'b4000000-0000-4000-8000-000000000001' order by mv.kind $$,
  $$ values
     ('thumb'::text, '00000000-0000-4000-8000-000000000081/b4000000-0000-4000-8000-000000000001/thumb.webp'::text),
     ('small', '00000000-0000-4000-8000-000000000081/b4000000-0000-4000-8000-000000000001/small.webp'),
     ('large', '00000000-0000-4000-8000-000000000081/b4000000-0000-4000-8000-000000000001/full.webp') $$,
  'variants collapse to the v2 set; full wins over large and the legacy full-size preview'
);
select results_eq(
  $$ select kind::text, duration_ms, width, height from public.media
     where id = 'b4000000-0000-4000-8000-000000000002' $$,
  $$ values ('video'::text, 42000, 220, 124) $$,
  'video keeps kind and duration'
);
select results_eq(
  $$ select array_agg(kind::text order by kind) from public.media_variants
     where media_id = 'b4000000-0000-4000-8000-000000000002' $$,
  $$ values (array['thumb', 'video']) $$,
  'video keeps poster and video variants'
);
select results_eq(
  $$ select status::text, journey_id from public.media where id = 'b4000000-0000-4000-8000-000000000004' $$,
  $$ values ('failed'::text, null::uuid) $$,
  'photo without variants is marked failed and stays outside journeys'
);

select results_eq(
  $$ select starts_at, ends_at from public.segments where id = 'b1000000-0000-4000-8000-000000000001' $$,
  $$ values ('2026-05-25T00:00:00Z'::timestamptz, '2026-06-26T00:00:00Z'::timestamptz) $$,
  'dated stage covers its whole last day'
);
select results_eq(
  $$ select starts_at, ends_at from public.segments where id = 'b1000000-0000-4000-8000-000000000002' $$,
  $$ values ('2026-07-10T18:00:00Z'::timestamptz, '2026-07-10T18:00:01Z'::timestamptz) $$,
  'undated stage takes the span of its moments'
);
select results_eq(
  $$ select kind::text, body from public.segments where id = 'b1000000-0000-4000-8000-000000000001' $$,
  $$ values ('stage'::text, 'Měsíc v horách'::text) $$,
  'stage keeps its summary as body'
);

select results_eq(
  $$ select kind::text, title, visibility::text, journey_id
     from public.posts where id = 'b3000000-0000-4000-8000-000000000003' $$,
  $$ values ('tip'::text, 'Medvědí sprej kupte v Calgary.'::text, 'public'::text, null::uuid) $$,
  'standalone tip becomes a public tip titled from its body'
);
select results_eq(
  $$ select kind::text, visibility::text from public.posts where id = 'b3000000-0000-4000-8000-000000000004' $$,
  $$ values ('article'::text, 'private'::text) $$,
  'private standalone story becomes a private article'
);
select results_eq(
  $$ select kind::text, journey_id, visibility::text from public.posts where id = 'b5000000-0000-4000-8000-000000000001' $$,
  $$ values ('tip'::text, 'b0000000-0000-4000-8000-000000000001'::uuid, 'public'::text) $$,
  'guide section becomes a tip linked to the journey'
);
select results_eq(
  $$ select media_id from public.post_media where post_id = 'b3000000-0000-4000-8000-000000000003' $$,
  $$ values ('b4000000-0000-4000-8000-000000000003'::uuid) $$,
  'tip keeps its photo'
);

select results_eq(
  $$ select t.kind::text, t.slug from public.taggings tg join public.tags t on t.id = tg.tag_id
     where tg.target_type = 'media' and tg.target_id = 'b4000000-0000-4000-8000-000000000001' $$,
  $$ values ('free'::text, 'medved'::text) $$,
  'journey photo tag becomes a global free tag on the media'
);
select results_eq(
  $$ select array_agg(id order by id) from public.places
     where id in ('b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002') $$,
  $$ values (array['b2000000-0000-4000-8000-000000000001'::uuid]) $$,
  'stop used by an entry becomes a place, bare stop does not'
);
select results_eq(
  $$ select (public.v2_migrate_from_v1() ->> 'skipped_stops')::int $$,
  $$ values (1) $$,
  'stops without entries are reported as skipped'
);

-- ------------------------------------------------------------------ idempotence
select results_eq(
  $$ select (public.v2_migrate_from_v1() ->> 'moments')::int $$,
  $$ values (0) $$,
  'rerunning inserts nothing new'
);
select results_eq(
  $$ select bool_and(ok) from public.v2_verify_migration() $$,
  $$ values (true) $$,
  'verification still passes after a rerun'
);

-- ------------------------------------------------------------------ public read
select results_eq(
  $$ select jsonb_path_query_array(
       public.get_public_journey(
         (select handle from public.spaces where personal_owner_id = '00000000-0000-4000-8000-000000000081'),
         'kanada-v1'),
       '$.media[*].id') $$,
  $$ values ('["b4000000-0000-4000-8000-000000000001", "b4000000-0000-4000-8000-000000000002"]'::jsonb) $$,
  'migrated journey is readable through the public RPC'
);

set local role anon;
select throws_ok(
  $$ select public.v2_migrate_from_v1() $$,
  '42501', null, 'anon cannot run the migration'
);

select * from finish();
rollback;
