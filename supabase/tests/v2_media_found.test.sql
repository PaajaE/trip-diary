-- Phase 4f, DB contract wave 4: "found" media (metadata only, triaged before upload).
-- Roles: owner (f01, journey owner), editor (f02), viewer (f03, read-only member),
-- stranger (f04), anon.
begin;
create extension if not exists pgtap with schema extensions;
select plan(94);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000f01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fm-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000f02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fm-editor@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000f03','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fm-viewer@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000f04','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fm-stranger@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

-- ---------------------------------------------------------------------------
-- Fixture (owner): public journey with a published moment and one ready photo
-- that has a variant, plus a second journey.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000f01","role":"authenticated"}',true);
insert into public.journeys (id, creator_id, title, visibility, slug, home_tz) values
('f1000000-0000-4000-8000-000000000001', auth.uid(), 'Found', 'public', 'fm-pub', 'Europe/Prague'),
('f1000000-0000-4000-8000-000000000002', auth.uid(), 'Other', 'private', null, 'Europe/Prague');
insert into public.journey_members (journey_id, user_id, role) values
('f1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000f02','editor'),
('f1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000f03','member');
insert into public.moments (id, journey_id, starts_at, ends_at, published, created_by) values
('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','2026-06-01T08:00:00Z','2026-06-01T20:00:00Z', true, auth.uid());
insert into public.media (id, owner_id, journey_id, kind, status, captured_at, captured_tz, width, height, moment_id) values
('f3000000-0000-4000-8000-000000000001', auth.uid(), 'f1000000-0000-4000-8000-000000000001','photo','ready','2026-06-01T09:00:00Z','Europe/Prague',100,100,'f2000000-0000-4000-8000-000000000001');
insert into public.media_variants (media_id, kind, storage_key, mime_type, width, height, byte_size) values
('f3000000-0000-4000-8000-000000000001','small','00000000-0000-4000-8000-000000000f01/f3000000-0000-4000-8000-000000000001/small.webp','image/webp',80,80,1000);

reset role;
create temp table fm_h as select handle from public.spaces s join public.journeys j on j.space_id = s.id where j.slug = 'fm-pub';
grant select on fm_h to anon, authenticated;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000f01","role":"authenticated"}',true);

-- ---------------------------------------------------------------------------
-- create_found_media (owner)
-- ---------------------------------------------------------------------------
create temp table fm_r1 as
select * from public.create_found_media('f1000000-0000-4000-8000-000000000001', $$[
 {"id":"f4000000-0000-4000-8000-00000000000a","sourceAssetId":"asset-A","kind":"photo","capturedAt":"2026-06-01T10:00:00Z","capturedTz":"Europe/Prague","latitude":50.08,"longitude":14.42,"width":4000,"height":3000,"device":"Apple iPhone 15 Pro","capturedAtSource":"exif","locationSource":"exif","phash":123456789,"quality":{"v":1,"sharp":0.9}},
 {"id":"f4000000-0000-4000-8000-00000000000b","sourceAssetId":"asset-B","capturedAt":"2026-06-01T11:00:00Z","capturedTz":"Europe/Prague"},
 {"id":"f4000000-0000-4000-8000-00000000000c","sourceAssetId":"asset-C","kind":"video","durationMs":5000,"capturedAt":"2026-06-01T12:00:00Z","capturedTz":"Europe/Prague"}
]$$::jsonb);
grant select on fm_r1 to public;
select is((select count(*)::int from fm_r1 where outcome = 'inserted' and current_status = 'found' and not kept and not dropped), 3, 'owner creates 3 found rows');
select is((select count(*)::int from public.media where status = 'found' and owner_id = auth.uid() and journey_id = 'f1000000-0000-4000-8000-000000000001'), 3, 'rows are found, owned by the caller, in the journey');
select is((select count(*)::int from public.media_variants v join public.media m on m.id = v.media_id where m.status = 'found'), 0, 'found rows have no variants');
select is((select phash from public.media where id = 'f4000000-0000-4000-8000-00000000000a'), 123456789::bigint, 'phash and metadata are stored');

-- idempotent re-run, also with fresh client ids
select is((select count(*)::int from public.create_found_media('f1000000-0000-4000-8000-000000000001',
  '[{"id":"f4000000-0000-4000-8000-00000000000a","sourceAssetId":"asset-A"},{"id":"f4000000-0000-4000-8000-0000000000aa","sourceAssetId":"asset-B"}]'::jsonb) where outcome = 'existing'), 2, 're-run: existing, nothing inserted (even with new ids)');
select is((select media_id from public.create_found_media('f1000000-0000-4000-8000-000000000001',
  '[{"id":"f4000000-0000-4000-8000-0000000000bb","sourceAssetId":"asset-B"}]'::jsonb)), 'f4000000-0000-4000-8000-00000000000b'::uuid, 're-run returns the original id');
select is((select count(*)::int from public.media where owner_id = auth.uid() and source_asset_id like 'asset-%'), 3, 'still 3 rows after re-runs');
-- id taken by an unrelated row; duplicate asset inside one call
select is((select outcome from public.create_found_media('f1000000-0000-4000-8000-000000000001',
  '[{"id":"f3000000-0000-4000-8000-000000000001","sourceAssetId":"asset-X"}]'::jsonb)), 'id_conflict', 'id collision is reported, not swallowed');
select is((select count(*)::int from public.create_found_media('f1000000-0000-4000-8000-000000000001',
  '[{"id":"f4000000-0000-4000-8000-0000000000d1","sourceAssetId":"asset-D"},{"id":"f4000000-0000-4000-8000-0000000000d2","sourceAssetId":"asset-D"}]'::jsonb)), 1, 'duplicate asset inside one call collapses to one row');
-- argument validation
select throws_ok($$ select * from public.create_found_media('f1000000-0000-4000-8000-000000000001', '{"id":1}'::jsonb) $$, '22023', null, 'items must be an array');
select throws_ok($$ select * from public.create_found_media('f1000000-0000-4000-8000-000000000001', '[{"id":"f4000000-0000-4000-8000-0000000000e1"}]'::jsonb) $$, '22023', null, 'sourceAssetId is required');
select throws_ok($$ select * from public.create_found_media('f1000000-0000-4000-8000-000000000001', '[{"id":"f4000000-0000-4000-8000-0000000000e1","sourceAssetId":"asset-E","capturedAt":"not a date"}]'::jsonb) $$, '22023', null, 'bad timestamp is 22023');
select throws_ok($$ select * from public.create_found_media('f1000000-0000-4000-8000-000000000001', '[{"id":"f4000000-0000-4000-8000-0000000000e1","sourceAssetId":"asset-E","latitude":10}]'::jsonb) $$, '22023', null, 'lone latitude violates the table check (22023 with the item index)');
select throws_ok($$ select * from public.create_found_media(null, '[]'::jsonb) $$, '22023', null, 'journey is required');
select throws_ok($$ select * from public.create_found_media('f1000000-0000-4000-8000-000000000001', (select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'sourceAssetId', 'big-' || g)) from generate_series(1, 5001) g)) $$, '22023', null, 'more than 5000 items is rejected');
select is((select count(*)::int from public.create_found_media('f1000000-0000-4000-8000-000000000001', '[]'::jsonb)), 0, 'empty array is a no-op');

-- ---------------------------------------------------------------------------
-- Triage state machine (owner)
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.triage_found_media(array['f4000000-0000-4000-8000-00000000000a']::uuid[], 'maybe') $$, '22023', null, 'unknown decision');
select throws_ok($$ update public.media set reviewed_at = now() where id = 'f4000000-0000-4000-8000-00000000000a' $$, '42501', null, 'reviewed_at is not writable directly');
select throws_ok($$ update public.media set deleted_at = now() where id = 'f4000000-0000-4000-8000-00000000000a' $$, '42501', null, 'deleted_at is not writable directly');
select is(public.triage_found_media(array['f4000000-0000-4000-8000-00000000000a','f4000000-0000-4000-8000-00000000000b']::uuid[], 'keep'), 2, 'keep two');
select is(public.triage_found_media(array['f4000000-0000-4000-8000-00000000000a','f4000000-0000-4000-8000-00000000000b']::uuid[], 'keep'), 0, 'keep is idempotent');
select lives_ok($$ update public.media set starred = true where id = 'f4000000-0000-4000-8000-00000000000a' $$, 'best (starred) stays a plain update');
select is(public.triage_found_media(array['f4000000-0000-4000-8000-00000000000b']::uuid[], 'drop'), 1, 'drop a kept row');
select is(public.triage_found_media(array['f4000000-0000-4000-8000-00000000000b']::uuid[], 'drop'), 0, 'drop is idempotent');
select is((select count(*)::int from public.create_found_media('f1000000-0000-4000-8000-000000000001',
  '[{"id":"f4000000-0000-4000-8000-0000000000cc","sourceAssetId":"asset-B"}]'::jsonb) where outcome = 'existing' and dropped and kept), 1, 'dropped row is not re-offered on the next import');
select is((select count(*)::int from public.media where source_asset_id = 'asset-B'), 1, 'no second row for the dropped asset');
select is(public.triage_found_media(array['f4000000-0000-4000-8000-00000000000b']::uuid[], 'restore'), 1, 'restore a dropped row');
select is((select reviewed_at is not null and deleted_at is null from public.media where id = 'f4000000-0000-4000-8000-00000000000b'), true, 'restored row is kept again (previous state)');
select is(public.triage_found_media(array['f4000000-0000-4000-8000-00000000000a']::uuid[], 'undecided'), 1, 'back to undecided');
select is((select reviewed_at is null and deleted_at is null and starred from public.media where id = 'f4000000-0000-4000-8000-00000000000a'), true, 'undecided clears the decision, keeps the star');
select is(public.triage_found_media(array['f4000000-0000-4000-8000-00000000000c']::uuid[], 'drop'), 1, 'drop an undecided row');
select is(public.triage_found_media(array['f4000000-0000-4000-8000-00000000000c']::uuid[], 'keep'), 1, 'keep brings a dropped row back');
select is(public.triage_found_media(array['f3000000-0000-4000-8000-000000000001']::uuid[], 'drop'), 0, 'ready rows are ignored by triage');
select is((select deleted_at is null from public.media where id = 'f3000000-0000-4000-8000-000000000001'), true, 'ready row untouched');
-- trash_media (existing RPC) works on a found row and dedupes too
select is(public.trash_media(array['f4000000-0000-4000-8000-00000000000c']::uuid[]), 0, 'trash_media ignores found rows (they are not part of the Trash)');
select is(public.triage_found_media(array['f4000000-0000-4000-8000-00000000000c']::uuid[], 'drop'), 1, 'a found row is dropped through triage_found_media');
select is((select count(*)::int from public.create_found_media('f1000000-0000-4000-8000-000000000001',
  '[{"id":"f4000000-0000-4000-8000-0000000000c9","sourceAssetId":"asset-C"}]'::jsonb) where outcome = 'existing' and dropped), 1, 'trashed found row is not re-offered');
select is(public.restore_media(array['f4000000-0000-4000-8000-00000000000c']::uuid[]), 0, 'restore_media ignores found rows');
select is(public.triage_found_media(array['f4000000-0000-4000-8000-00000000000c']::uuid[], 'restore'), 1, 'a dropped found row is restored through triage_found_media');

-- ---------------------------------------------------------------------------
-- Organising works on found rows (captured_at / tz / GPS only)
-- ---------------------------------------------------------------------------
select is(public.move_media(array['f4000000-0000-4000-8000-00000000000a','f4000000-0000-4000-8000-00000000000b']::uuid[], 'f2000000-0000-4000-8000-000000000001'), 2, 'move_media assigns found rows to a moment');
select is(public.shift_media_time(array['f4000000-0000-4000-8000-00000000000a']::uuid[], 60), 1, 'shift_media_time works on found rows');
select is(public.create_moment_from_media(array['f4000000-0000-4000-8000-00000000000c']::uuid[], 'f2000000-0000-4000-8000-0000000000c1'), 'f2000000-0000-4000-8000-0000000000c1'::uuid, 'create_moment_from_media works on found rows');

-- ---------------------------------------------------------------------------
-- Row guards
-- ---------------------------------------------------------------------------
select throws_ok($$ update public.journeys set cover_media_id = 'f4000000-0000-4000-8000-00000000000a' where id = 'f1000000-0000-4000-8000-000000000001' $$, '23514', null, 'a found row cannot be a cover');
select throws_ok($$ insert into public.media_variants (media_id, kind, storage_key, mime_type, width, height, byte_size) values ('f4000000-0000-4000-8000-00000000000a','small','k/found.webp','image/webp',10,10,10) $$, '23514', null, 'a found row cannot get variants');
select throws_ok($$ update public.media set status = 'ready' where id = 'f4000000-0000-4000-8000-00000000000a' $$, '42501', null, 'found cannot skip upload (found -> ready)');
select throws_ok($$ update public.media set status = 'uploading' where id = 'f4000000-0000-4000-8000-00000000000a' $$, '42501', null, 'found cannot skip upload (found -> uploading)');
select throws_ok($$ update public.media set status = 'found' where id = 'f3000000-0000-4000-8000-000000000001' $$, '42501', null, 'ready cannot become found');
select lives_ok($$ update public.media set caption = 'x' where id = 'f4000000-0000-4000-8000-00000000000a' $$, 'other updates of found rows are fine');

-- ---------------------------------------------------------------------------
-- Hidden from public readers, progress and quota
-- ---------------------------------------------------------------------------
reset role;
set local role anon;
select is((select count(*)::int from jsonb_array_elements(public.get_public_journey((select handle from fm_h), 'fm-pub') -> 'media')), 1, 'public reader sees only the ready photo');
select is((select public.get_public_journey((select handle from fm_h), 'fm-pub')::text ~ 'f4000000-0000-4000-8000-0000000000(0a|0b|0c|d1|d2)'), false, 'no found id appears anywhere in the public journey');
select is(public.is_interactable_target('media', 'f4000000-0000-4000-8000-00000000000a'), false, 'a found row is not an interactable target');
select throws_ok($$ select count(*) from public.media $$, '42501', null, 'anon cannot read media');
select throws_ok($$ select * from public.create_found_media('f1000000-0000-4000-8000-000000000001', '[]'::jsonb) $$, '42501', null, 'anon cannot execute create_found_media');
select throws_ok($$ select public.triage_found_media(array['f4000000-0000-4000-8000-00000000000a']::uuid[], 'keep') $$, '42501', null, 'anon cannot execute triage_found_media');
select throws_ok($$ select * from public.promote_found_media('[]'::jsonb) $$, '42501', null, 'anon cannot execute promote_found_media');
reset role;
-- as the owner: progress counts only uploaded media; found rows weigh nothing
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000f01","role":"authenticated"}',true);
select is((select media_total from public.journey_progress(array['f1000000-0000-4000-8000-000000000001']::uuid[])), 1, 'journey_progress counts only ready media');
select is((select coalesce(sum(v.byte_size), 0)::bigint from public.media_variants v join public.media m on m.id = v.media_id where m.owner_id = auth.uid()), 1000::bigint, 'stored bytes come from variants only (found rows add nothing)');

-- ---------------------------------------------------------------------------
-- Visibility and write access per role
-- ---------------------------------------------------------------------------
-- viewer (read-only member)
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000f03","role":"authenticated"}',true);
select is((select count(*)::int from public.media where status = 'found'), 0, 'viewer cannot see found rows');
select is((select count(*)::int from public.media where status = 'ready'), 1, 'viewer still sees ready media');
select throws_ok($$ select * from public.create_found_media('f1000000-0000-4000-8000-000000000001', '[{"id":"f4000000-0000-4000-8000-0000000000f1","sourceAssetId":"asset-V"}]'::jsonb) $$, '42501', null, 'viewer cannot create found rows');
select throws_ok($$ select public.triage_found_media(array['f4000000-0000-4000-8000-00000000000a']::uuid[], 'drop') $$, 'P0002', null, 'viewer cannot triage (row not theirs, no leak)');
select throws_ok($$ select * from public.promote_found_media('[{"id":"f4000000-0000-4000-8000-00000000000a"}]'::jsonb) $$, 'P0002', null, 'viewer cannot promote');
-- stranger
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000f04","role":"authenticated"}',true);
select is((select count(*)::int from public.media), 0, 'stranger sees no media');
select throws_ok($$ select * from public.create_found_media('f1000000-0000-4000-8000-000000000001', '[{"id":"f4000000-0000-4000-8000-0000000000f2","sourceAssetId":"asset-S"}]'::jsonb) $$, 'P0002', null, 'stranger: journey not found');
select throws_ok($$ select public.triage_found_media(array['f4000000-0000-4000-8000-00000000000a']::uuid[], 'drop') $$, 'P0002', null, 'stranger cannot triage');
select throws_ok($$ select * from public.promote_found_media('[{"id":"f4000000-0000-4000-8000-00000000000a"}]'::jsonb) $$, 'P0002', null, 'stranger cannot promote');
-- editor: sees found rows, writes only their own, may organise everyone's
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000f02","role":"authenticated"}',true);
select is((select count(*)::int from public.media where status = 'found'), 4, 'editor sees the journey''s found rows');
select is((select count(*)::int from public.create_found_media('f1000000-0000-4000-8000-000000000001', '[{"id":"f4000000-0000-4000-8000-0000000000f3","sourceAssetId":"asset-A"},{"id":"f4000000-0000-4000-8000-0000000000f4","sourceAssetId":"asset-EDITOR"}]'::jsonb) where outcome = 'inserted'), 2, 'editor has their own library: same asset id is a different row');
select throws_ok($$ select public.triage_found_media(array['f4000000-0000-4000-8000-00000000000a']::uuid[], 'drop') $$, 'P0002', null, 'editor cannot triage the owner''s rows');
select is(public.triage_found_media(array['f4000000-0000-4000-8000-0000000000f4']::uuid[], 'keep'), 1, 'editor triages their own rows');
select throws_ok($$ select public.triage_found_media(array['f4000000-0000-4000-8000-0000000000f4','f4000000-0000-4000-8000-00000000000a']::uuid[], 'keep') $$, 'P0002', null, 'mixed own and foreign ids are refused as a whole');
select throws_ok($$ select public.move_media(array['f4000000-0000-4000-8000-00000000000c']::uuid[], 'f2000000-0000-4000-8000-000000000001') $$, 'P0002', null, 'editor cannot move the owner''s found rows (private to the uploader)');
-- demoted editor loses write access to their own rows
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000f01","role":"authenticated"}',true);
update public.journey_members set role = 'member' where journey_id = 'f1000000-0000-4000-8000-000000000001' and user_id = '00000000-0000-4000-8000-000000000f02';
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000f02","role":"authenticated"}',true);
select throws_ok($$ select public.triage_found_media(array['f4000000-0000-4000-8000-0000000000f4']::uuid[], 'drop') $$, '42501', null, 'demoted editor can no longer triage');
select is((select count(*)::int from public.media where status = 'found'), 2, 'demoted editor sees only their own found rows');

-- ---------------------------------------------------------------------------
-- promote_found_media (owner)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000f01","role":"authenticated"}',true);
-- state: A undecided (starred), B kept, C kept. Make D kept and E dropped.
select public.create_found_media('f1000000-0000-4000-8000-000000000001', $$[
 {"id":"f4000000-0000-4000-8000-0000000000d3","sourceAssetId":"asset-D3","capturedAt":"2026-06-01T13:00:00Z"},
 {"id":"f4000000-0000-4000-8000-0000000000d4","sourceAssetId":"asset-D4","capturedAt":"2026-06-01T14:00:00Z"},
 {"id":"f4000000-0000-4000-8000-0000000000d5","sourceAssetId":"asset-D5","capturedAt":"2026-06-01T15:00:00Z"}
]$$::jsonb);
select public.triage_found_media(array['f4000000-0000-4000-8000-0000000000d3','f4000000-0000-4000-8000-0000000000d4']::uuid[], 'keep');
select public.triage_found_media(array['f4000000-0000-4000-8000-0000000000d5']::uuid[], 'drop');
select is((select string_agg(outcome, ',' order by media_id) from public.promote_found_media($$[
  {"id":"f4000000-0000-4000-8000-00000000000a"},
  {"id":"f4000000-0000-4000-8000-00000000000b","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
  {"id":"f4000000-0000-4000-8000-0000000000d5"},
  {"id":"f3000000-0000-4000-8000-000000000001"}
]$$::jsonb)), 'already_promoted,not_kept,promoted,not_kept', 'promote: only kept found rows move on');
select is((select status::text || ':' || coalesce(content_hash, '-') from public.media where id = 'f4000000-0000-4000-8000-00000000000b'), 'pending:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'promoted row is pending with its hash');
select is((select outcome from public.promote_found_media('[{"id":"f4000000-0000-4000-8000-00000000000b"}]'::jsonb)), 'already_promoted', 'promote is idempotent');
select is((select outcome || ':' || duplicate_of::text from public.promote_found_media('[{"id":"f4000000-0000-4000-8000-0000000000d3","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]'::jsonb)), 'duplicate:f4000000-0000-4000-8000-00000000000b', 'a content hash held by another row is reported as duplicate');
select is((select status::text from public.media where id = 'f4000000-0000-4000-8000-0000000000d3'), 'found', 'the duplicate stays found');
select is((select string_agg(outcome, ',' order by media_id) from public.promote_found_media($$[
  {"id":"f4000000-0000-4000-8000-0000000000d3","contentHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},
  {"id":"f4000000-0000-4000-8000-0000000000d4","contentHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}
]$$::jsonb)), 'promoted,duplicate', 'two rows with one hash in a single call: one is promoted, one is a duplicate');
select throws_ok($$ select * from public.promote_found_media('[{"id":"f4000000-0000-4000-8000-00000000000c","contentHash":"XYZ"}]'::jsonb) $$, '22023', null, 'invalid content hash');
select throws_ok($$ select * from public.promote_found_media('[{"contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]'::jsonb) $$, '22023', null, 'promote needs ids');
select throws_ok($$ select public.triage_found_media(array['f4000000-0000-4000-8000-00000000000c', 'f4000000-0000-4000-8000-0000000000ff']::uuid[], 'keep') $$, 'P0002', null, 'unknown id in a batch');
-- after promote the normal upload flow applies
select lives_ok($$ insert into public.media_variants (media_id, kind, storage_key, mime_type, width, height, byte_size) values ('f4000000-0000-4000-8000-00000000000b','small','00000000-0000-4000-8000-000000000f01/f4000000-0000-4000-8000-00000000000b/small.webp','image/webp',10,10,10) $$, 'a promoted row can get variants');
select lives_ok($$ update public.media set status = 'uploading' where id = 'f4000000-0000-4000-8000-00000000000b' $$, 'pending -> uploading as before');
select lives_ok($$ update public.media set status = 'ready' where id = 'f4000000-0000-4000-8000-00000000000b' $$, 'uploading -> ready as before');

-- rows of two journeys cannot be triaged in one call
insert into public.media (id, owner_id, journey_id, kind, status, captured_at) values
('f4000000-0000-4000-8000-0000000000e9', auth.uid(), 'f1000000-0000-4000-8000-000000000002', 'photo', 'found', '2026-06-02T10:00:00Z');
select throws_ok($$ select public.triage_found_media(array['f4000000-0000-4000-8000-0000000000e9','f4000000-0000-4000-8000-00000000000c']::uuid[], 'keep') $$, '22023', null, 'ids of two journeys are refused');

-- ---------------------------------------------------------------------------
-- 3000 rows in one call
-- ---------------------------------------------------------------------------
create temp table fm_t (t0 timestamptz, t1 timestamptz, t2 timestamptz, t3 timestamptz);
insert into fm_t (t0) values (clock_timestamp());
create temp table fm_big as
select * from public.create_found_media('f1000000-0000-4000-8000-000000000001',
  (select jsonb_agg(jsonb_build_object(
      'id', ('f5000000-0000-4000-8000-' || lpad(to_hex(g), 12, '0')),
      'sourceAssetId', 'bulk-' || g,
      'capturedAt', to_char(timestamptz '2026-06-02T00:00:00Z' + g * interval '1 minute', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'capturedTz', 'Europe/Prague', 'latitude', 50 + (g % 100) / 1000.0, 'longitude', 14 + (g % 100) / 1000.0,
      'width', 4000, 'height', 3000, 'phash', g * 1000))
     from generate_series(1, 3000) g));
update fm_t set t1 = clock_timestamp();
grant select on fm_big to public;
select is((select count(*)::int from fm_big where outcome = 'inserted'), 3000, '3000 rows in one call: all inserted');
select ok((select t1 - t0 < interval '5 seconds' from fm_t), '3000-row insert finishes well inside the statement timeout');
select is((select count(*)::int from public.create_found_media('f1000000-0000-4000-8000-000000000001',
  (select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'sourceAssetId', 'bulk-' || g)) from generate_series(1, 3000) g)) where outcome = 'existing'), 3000, '3000-row re-run is fully idempotent');
select is(public.triage_found_media((select array_agg(media_id) from fm_big), 'keep'), 3000, '3000 rows triaged in one call');
select is((select count(*)::int from public.promote_found_media((select jsonb_agg(jsonb_build_object('id', media_id, 'contentHash', md5(asset_id) || md5(asset_id || 'x'))) from fm_big)) where outcome = 'promoted'), 3000, '3000 rows promoted in one call');
select is((select count(*)::int from public.media where status = 'pending' and source_asset_id like 'bulk-%'), 3000, 'all 3000 are pending now');
-- still nothing public
reset role;
set local role anon;
select is((select count(*)::int from jsonb_array_elements(public.get_public_journey((select handle from fm_h), 'fm-pub') -> 'media')), 2, 'pending bulk rows stay hidden too (public sees the 2 ready photos)');
reset role;

select * from finish();
rollback;
