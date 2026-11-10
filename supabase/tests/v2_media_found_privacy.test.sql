-- Phase 4f, wave 4 final fixes (PR 69): found rows private to the uploader at RLS level (mi2),
-- bulk RPCs skip foreign found rows (mi5), promote_found_media duplicate_of only for duplicates (mi1),
-- keep-on-promote rollback (mi4). Roles: owner (c01), uploader/editor u1 (c02), other editor u2 (c03),
-- viewer (c04, read-only member), stranger (c05).
begin;
create extension if not exists pgtap with schema extensions;
select plan(73);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000c01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fp-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000c02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fp-u1@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000c03','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fp-u2@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000c04','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fp-viewer@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000c05','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fp-stranger@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c01","role":"authenticated"}',true);
insert into public.journeys (id, creator_id, title, visibility, home_tz) values
('c1000000-0000-4000-8000-000000000001', auth.uid(), 'Privacy', 'private', 'Europe/Prague'),
('c1000000-0000-4000-8000-000000000002', auth.uid(), 'Doomed', 'private', 'Europe/Prague');
insert into public.journey_members (journey_id, user_id, role) values
('c1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000c02','editor'),
('c1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000c03','editor'),
('c1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000c04','member'),
('c1000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000c02','editor'),
('c1000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000c03','editor');

-- u1: two found rows and two uploaded (ready) rows
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c02","role":"authenticated"}',true);
select * from public.create_found_media('c1000000-0000-4000-8000-000000000001', $$[
 {"id":"c4000000-0000-4000-8000-0000000000a1","sourceAssetId":"shared","capturedAt":"2026-06-01T10:00:00Z","capturedTz":"Europe/Prague","latitude":50.1,"longitude":14.4},
 {"id":"c4000000-0000-4000-8000-0000000000a2","sourceAssetId":"to-delete","capturedAt":"2026-06-01T11:00:00Z","capturedTz":"Europe/Prague"}
]$$::jsonb);
insert into public.media (id, owner_id, journey_id, kind, status, captured_at, source_asset_id) values
('c4000000-0000-4000-8000-0000000000b1', auth.uid(), 'c1000000-0000-4000-8000-000000000001', 'photo', 'ready', '2026-06-01T12:00:00Z', 'uploaded-1'),
('c4000000-0000-4000-8000-0000000000b2', auth.uid(), 'c1000000-0000-4000-8000-000000000001', 'photo', 'ready', '2026-06-01T13:00:00Z', 'uploaded-2');

-- u2 imports the same source_asset_id: a separate row of their own
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c03","role":"authenticated"}',true);
select is((select count(*)::int from public.create_found_media('c1000000-0000-4000-8000-000000000001', '[{"id":"c4000000-0000-4000-8000-0000000000a3","sourceAssetId":"shared"}]'::jsonb) where outcome = 'inserted'), 1, 'mi2: a co-uploader gets their own found row for the same source_asset_id');

-- ---- select matrix on F1 (found, owned by u1) and R1 (ready, owned by u1) ----
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c02","role":"authenticated"}',true);
select is((select count(*)::int from public.media where id = 'c4000000-0000-4000-8000-0000000000a1'), 1, 'mi2 select: uploader sees their found row');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c03","role":"authenticated"}',true);
select is((select count(*)::int from public.media where id = 'c4000000-0000-4000-8000-0000000000a1'), 0, 'mi2 select: other editor does not see the found row');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c01","role":"authenticated"}',true);
select is((select count(*)::int from public.media where id = 'c4000000-0000-4000-8000-0000000000a1'), 0, 'mi2 select: journey owner does not see the found row');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c04","role":"authenticated"}',true);
select is((select count(*)::int from public.media where id = 'c4000000-0000-4000-8000-0000000000a1'), 0, 'mi2 select: viewer does not see the found row');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c05","role":"authenticated"}',true);
select is((select count(*)::int from public.media where id = 'c4000000-0000-4000-8000-0000000000a1'), 0, 'mi2 select: stranger does not see the found row');
-- non-found rows keep their policy
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c02","role":"authenticated"}',true);
select is((select count(*)::int from public.media where id = 'c4000000-0000-4000-8000-0000000000b1'), 1, 'mi2 select: uploader sees the uploaded row (unchanged)');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c03","role":"authenticated"}',true);
select is((select count(*)::int from public.media where id = 'c4000000-0000-4000-8000-0000000000b1'), 1, 'mi2 select: other editor sees the uploaded row (unchanged)');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c01","role":"authenticated"}',true);
select is((select count(*)::int from public.media where id = 'c4000000-0000-4000-8000-0000000000b1'), 1, 'mi2 select: journey owner sees the uploaded row (unchanged)');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c04","role":"authenticated"}',true);
select is((select count(*)::int from public.media where id = 'c4000000-0000-4000-8000-0000000000b1'), 1, 'mi2 select: viewer sees the uploaded row (unchanged)');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c05","role":"authenticated"}',true);
select is((select count(*)::int from public.media where id = 'c4000000-0000-4000-8000-0000000000b1'), 0, 'mi2 select: stranger does not see the uploaded row (unchanged)');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c03","role":"authenticated"}',true);
select is((select count(*)::int from public.media where status = 'found'), 1, 'mi2 select: the other editor sees only their own found row');
reset role; set local role anon;
select throws_ok($$ select count(*) from public.media where id = 'c4000000-0000-4000-8000-0000000000a1' $$, '42501', null, 'mi2 select: anon has no access to media at all');
set local role authenticated;

-- ---- update matrix on F1 ----
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c03","role":"authenticated"}',true);
select lives_ok($$ update public.media set starred = true, caption = 'x', latitude = 1, longitude = 2, captured_at = '2001-01-01T00:00:00Z' where id = 'c4000000-0000-4000-8000-0000000000a1' $$, 'mi2 update: other editor cannot change the found row (silent no-op)');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c01","role":"authenticated"}',true);
select lives_ok($$ update public.media set starred = true, caption = 'x', latitude = 1, longitude = 2, captured_at = '2001-01-01T00:00:00Z' where id = 'c4000000-0000-4000-8000-0000000000a1' $$, 'mi2 update: journey owner cannot change the found row (silent no-op)');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c04","role":"authenticated"}',true);
select lives_ok($$ update public.media set starred = true, caption = 'x', latitude = 1, longitude = 2, captured_at = '2001-01-01T00:00:00Z' where id = 'c4000000-0000-4000-8000-0000000000a1' $$, 'mi2 update: viewer cannot change the found row (silent no-op)');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c05","role":"authenticated"}',true);
select lives_ok($$ update public.media set starred = true, caption = 'x', latitude = 1, longitude = 2, captured_at = '2001-01-01T00:00:00Z' where id = 'c4000000-0000-4000-8000-0000000000a1' $$, 'mi2 update: stranger cannot change the found row (silent no-op)');
reset role; set local role anon;
select throws_ok($$ update public.media set starred = true where id = 'c4000000-0000-4000-8000-0000000000a1' $$, '42501', null, 'mi2 update: anon cannot update');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c02","role":"authenticated"}',true);
select is((select starred = false and caption is null and latitude = 50.1 and longitude = 14.4 and captured_at = '2026-06-01T10:00:00Z' from public.media where id = 'c4000000-0000-4000-8000-0000000000a1'), true, 'mi2 update: the found row is exactly as the uploader left it');
select lives_ok($$ update public.media set starred = true, caption = 'mine' where id = 'c4000000-0000-4000-8000-0000000000a1' $$, 'mi2 update: uploader edits their own found row');
select is((select starred and caption = 'mine' from public.media where id = 'c4000000-0000-4000-8000-0000000000a1'), true, 'mi2 update: the uploader''s change is stored');
-- non-found rows keep their policy: an editor may still annotate an uploaded row
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c03","role":"authenticated"}',true);
select lives_ok($$ update public.media set caption = 'by editor' where id = 'c4000000-0000-4000-8000-0000000000b1' $$, 'mi2 update: other editor updates an uploaded row (unchanged)');
select is((select caption from public.media where id = 'c4000000-0000-4000-8000-0000000000b1'), 'by editor', 'mi2 update: ... and it took effect');

-- ---- delete matrix on F1 ----
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c03","role":"authenticated"}',true);
select lives_ok($$ delete from public.media where id = 'c4000000-0000-4000-8000-0000000000a1' $$, 'mi2 delete: other editor cannot delete the found row (silent no-op)');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c01","role":"authenticated"}',true);
select lives_ok($$ delete from public.media where id = 'c4000000-0000-4000-8000-0000000000a1' $$, 'mi2 delete: journey owner cannot delete the found row (silent no-op)');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c04","role":"authenticated"}',true);
select lives_ok($$ delete from public.media where id = 'c4000000-0000-4000-8000-0000000000a1' $$, 'mi2 delete: viewer cannot delete the found row (silent no-op)');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c05","role":"authenticated"}',true);
select lives_ok($$ delete from public.media where id = 'c4000000-0000-4000-8000-0000000000a1' $$, 'mi2 delete: stranger cannot delete the found row (silent no-op)');
reset role; set local role anon;
select throws_ok($$ delete from public.media where id = 'c4000000-0000-4000-8000-0000000000a1' $$, '42501', null, 'mi2 delete: anon cannot delete');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c02","role":"authenticated"}',true);
select is((select count(*)::int from public.media where id = 'c4000000-0000-4000-8000-0000000000a1'), 1, 'mi2 delete: the found row survived every attempt');
select lives_ok($$ delete from public.media where id = 'c4000000-0000-4000-8000-0000000000a2' $$, 'mi2 delete: uploader deletes their own found row');
select is((select count(*)::int from public.media where id = 'c4000000-0000-4000-8000-0000000000a2'), 0, 'mi2 delete: ... gone');
-- non-found rows keep their policy: the journey owner may delete an uploaded row, an editor may not
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c03","role":"authenticated"}',true);
select lives_ok($$ delete from public.media where id = 'c4000000-0000-4000-8000-0000000000b2' $$, 'mi2 delete: other editor deletes an uploaded row of someone else (no-op, unchanged)');
select is((select count(*)::int from public.media where id = 'c4000000-0000-4000-8000-0000000000b2'), 1, 'mi2 delete: ... the uploaded row is still there');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c01","role":"authenticated"}',true);
select lives_ok($$ delete from public.media where id = 'c4000000-0000-4000-8000-0000000000b2' $$, 'mi2 delete: journey owner deletes an uploaded row');
select is((select count(*)::int from public.media where id = 'c4000000-0000-4000-8000-0000000000b2'), 0, 'mi2 delete: ... gone (unchanged behaviour)');

-- ---- known_source_assets with RLS: only the caller's own rows, never a co-uploader's ----
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c02","role":"authenticated"}',true);
select is((select array_agg(source_asset_id || ':' || state order by source_asset_id) from public.known_source_assets('c1000000-0000-4000-8000-000000000001', array['shared','to-delete','uploaded-1','nope'])), array['shared:found','uploaded-1:uploaded'], 'mi2 known_source_assets: uploader gets the state of their own rows (found + uploaded)');
select is((select media_id from public.known_source_assets('c1000000-0000-4000-8000-000000000001', array['shared'])), 'c4000000-0000-4000-8000-0000000000a1'::uuid, 'mi2 known_source_assets: the uploader''s row, not the co-uploader''s');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c03","role":"authenticated"}',true);
select is((select array_agg(source_asset_id || ':' || state) from public.known_source_assets('c1000000-0000-4000-8000-000000000001', array['shared','uploaded-1'])), array['shared:found'], 'mi2 known_source_assets: the co-uploader gets only their own row for the same asset id (uploaded-1 belongs to u1: absent)');
select is((select media_id from public.known_source_assets('c1000000-0000-4000-8000-000000000001', array['shared'])), 'c4000000-0000-4000-8000-0000000000a3'::uuid, 'mi2 known_source_assets: ... and it is their own media id');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c01","role":"authenticated"}',true);
select is((select count(*)::int from public.known_source_assets('c1000000-0000-4000-8000-000000000001', array['shared','uploaded-1'])), 0, 'mi2 known_source_assets: the journey owner (no rows of their own) learns nothing');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c04","role":"authenticated"}',true);
select is((select count(*)::int from public.known_source_assets('c1000000-0000-4000-8000-000000000001', array['shared','uploaded-1'])), 0, 'mi2 known_source_assets: a read-only member learns nothing');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c05","role":"authenticated"}',true);
select throws_ok($$ select * from public.known_source_assets('c1000000-0000-4000-8000-000000000001', array['shared']) $$, 'P0002', null, 'mi2 known_source_assets: a stranger gets P0002');

-- ---- journey delete cleanup (security definer) still removes found rows of every uploader ----
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c02","role":"authenticated"}',true);
select * from public.create_found_media('c1000000-0000-4000-8000-000000000002', '[{"id":"c4000000-0000-4000-8000-0000000000d1","sourceAssetId":"j2-u1"}]'::jsonb);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c03","role":"authenticated"}',true);
select * from public.create_found_media('c1000000-0000-4000-8000-000000000002', '[{"id":"c4000000-0000-4000-8000-0000000000d2","sourceAssetId":"j2-u2"}]'::jsonb);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c01","role":"authenticated"}',true);
delete from public.journeys where id = 'c1000000-0000-4000-8000-000000000002';
reset role;
select is((select count(*)::int from public.media where source_asset_id like 'j2-%'), 0, 'mi2 journey delete: the cleanup trigger removes found rows of both uploaders despite RLS');
set local role authenticated;

-- ---------------------------------------------------------------------------
-- mi5: bulk RPC siblings skip foreign found rows (set_media_location / move_media /
-- mark_media_reviewed / trash_media are also covered in v2_media_found_review.test.sql)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c02","role":"authenticated"}',true);
insert into public.moments (id, journey_id, starts_at, ends_at, published, created_by) values
('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','2026-06-01T08:00:00Z','2026-06-01T20:00:00Z', false, auth.uid());
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c03","role":"authenticated"}',true);
select is(public.mark_media_reviewed(array['c4000000-0000-4000-8000-0000000000a1','c4000000-0000-4000-8000-0000000000a3']::uuid[]), 1, 'mi5: mark_media_reviewed with a foreign found id: only the own row changes');
select is(public.set_media_location(array['c4000000-0000-4000-8000-0000000000a1','c4000000-0000-4000-8000-0000000000a3']::uuid[], 49, 13), 1, 'mi5: set_media_location, same');
select is(public.shift_media_time(array['c4000000-0000-4000-8000-0000000000a1']::uuid[], 60), 0, 'mi5: shift_media_time with only a foreign found id: 0, no error');
select is(public.clear_media_location(array['c4000000-0000-4000-8000-0000000000a1']::uuid[]), 0, 'mi5: clear_media_location with only a foreign found id: 0, no error');
select is(public.restore_media(array['c4000000-0000-4000-8000-0000000000a1']::uuid[]), 0, 'mi5: restore_media with only a foreign found id: 0, no error');
select is((select count(*)::int from public.claim_media_purge(array['c4000000-0000-4000-8000-0000000000a1']::uuid[])), 0, 'mi5: claim_media_purge with only a foreign found id: no rows, no error');
select is((select count(*)::int from public.purge_media(array['c4000000-0000-4000-8000-0000000000a1']::uuid[])), 0, 'mi5: purge_media with only a foreign found id: no rows, no error');
select throws_ok($$ select public.create_moment_from_media(array['c4000000-0000-4000-8000-0000000000a1']::uuid[], 'c2000000-0000-4000-8000-0000000000f9') $$, '22023', null, 'mi5: create_moment_from_media with only a foreign found id: no media given');
select is(public.move_media(array['c4000000-0000-4000-8000-0000000000a1','c4000000-0000-4000-8000-0000000000a3','c4000000-0000-4000-8000-0000000000b1']::uuid[], 'c2000000-0000-4000-8000-000000000001'), 2, 'mi5: move_media over own found + foreign found + uploaded row: 2 moved');
select is((select moment_id from public.media where id = 'c4000000-0000-4000-8000-0000000000b1'), 'c2000000-0000-4000-8000-000000000001'::uuid, 'mi5: ... the uploaded row moved');
select throws_ok($$ select public.mark_media_reviewed(null) $$, '22023', null, 'mi5: a missing id list is still rejected');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c02","role":"authenticated"}',true);
select is((select latitude from public.media where id = 'c4000000-0000-4000-8000-0000000000a1'), 50.1::double precision, 'mi5: the uploader''s found row was not touched by the other editor''s calls');
select is((select reviewed_at is null and moment_id is null from public.media where id = 'c4000000-0000-4000-8000-0000000000a1'), true, 'mi5: ... not reviewed, not moved');

-- ---------------------------------------------------------------------------
-- mi1: duplicate_of is set only for the outcome 'duplicate'. Several rows without a
-- hash (kept, undecided, dismissed, already promoted) next to mixed hash batches.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c02","role":"authenticated"}',true);
select * from public.create_found_media('c1000000-0000-4000-8000-000000000001', $$[
 {"id":"c5000000-0000-4000-8000-000000000001","sourceAssetId":"m1-k1"},{"id":"c5000000-0000-4000-8000-000000000002","sourceAssetId":"m1-k2"},{"id":"c5000000-0000-4000-8000-000000000003","sourceAssetId":"m1-k3"},
 {"id":"c5000000-0000-4000-8000-000000000004","sourceAssetId":"m1-d"},{"id":"c5000000-0000-4000-8000-000000000005","sourceAssetId":"m1-e"},
 {"id":"c5000000-0000-4000-8000-000000000006","sourceAssetId":"m1-f"},{"id":"c5000000-0000-4000-8000-000000000007","sourceAssetId":"m1-g"},
 {"id":"c5000000-0000-4000-8000-000000000008","sourceAssetId":"m1-h"},{"id":"c5000000-0000-4000-8000-000000000009","sourceAssetId":"m1-u"},
 {"id":"c5000000-0000-4000-8000-00000000000a","sourceAssetId":"m1-x"},{"id":"c5000000-0000-4000-8000-00000000000b","sourceAssetId":"m1-p"},
 {"id":"c5000000-0000-4000-8000-00000000000c","sourceAssetId":"m1-n1"},{"id":"c5000000-0000-4000-8000-00000000000d","sourceAssetId":"m1-n2"},
 {"id":"c5000000-0000-4000-8000-00000000000e","sourceAssetId":"m1-n3"},{"id":"c5000000-0000-4000-8000-00000000000f","sourceAssetId":"m1-n4"}
]$$::jsonb);
select public.triage_found_media(array['c5000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000002','c5000000-0000-4000-8000-000000000003','c5000000-0000-4000-8000-000000000004','c5000000-0000-4000-8000-000000000005','c5000000-0000-4000-8000-000000000006','c5000000-0000-4000-8000-000000000007','c5000000-0000-4000-8000-000000000008','c5000000-0000-4000-8000-00000000000b','c5000000-0000-4000-8000-00000000000c','c5000000-0000-4000-8000-00000000000d','c5000000-0000-4000-8000-00000000000e','c5000000-0000-4000-8000-00000000000f']::uuid[], 'keep');
select public.triage_found_media(array['c5000000-0000-4000-8000-00000000000a']::uuid[], 'dismiss');
insert into public.media (id, owner_id, journey_id, kind, status, captured_at, source_asset_id, content_hash) values
('c5000000-0000-4000-8000-0000000000f0', auth.uid(), 'c1000000-0000-4000-8000-000000000001', 'photo', 'ready', '2026-06-02T10:00:00Z', 'm1-outside', '3333333333333333333333333333333333333333333333333333333333333333');

-- all rows without a hash: nobody is a duplicate, duplicate_of is null everywhere
create temp table pf_null as select * from public.promote_found_media($$[
 {"id":"c5000000-0000-4000-8000-00000000000c"},{"id":"c5000000-0000-4000-8000-00000000000d"},{"id":"c5000000-0000-4000-8000-00000000000e"},{"id":"c5000000-0000-4000-8000-00000000000f"}
]$$::jsonb);
grant select on pf_null to public;
select is((select count(*)::int from pf_null where outcome = 'promoted' and duplicate_of is null), 4, 'mi1: four rows without a hash are all promoted, duplicate_of null for each');

-- the first promote of P (no hash), then a mixed batch
select is((select outcome from public.promote_found_media('[{"id":"c5000000-0000-4000-8000-00000000000b"}]'::jsonb)), 'promoted', 'mi1: P promoted on its own');
create temp table pf_mix as select * from public.promote_found_media($$[
 {"id":"c5000000-0000-4000-8000-000000000001"},{"id":"c5000000-0000-4000-8000-000000000002"},{"id":"c5000000-0000-4000-8000-000000000003"},
 {"id":"c5000000-0000-4000-8000-000000000004","contentHash":"1111111111111111111111111111111111111111111111111111111111111111"},{"id":"c5000000-0000-4000-8000-000000000005","contentHash":"1111111111111111111111111111111111111111111111111111111111111111"},
 {"id":"c5000000-0000-4000-8000-000000000006","contentHash":"2222222222222222222222222222222222222222222222222222222222222222"},{"id":"c5000000-0000-4000-8000-000000000007","contentHash":"2222222222222222222222222222222222222222222222222222222222222222"},
 {"id":"c5000000-0000-4000-8000-000000000008","contentHash":"3333333333333333333333333333333333333333333333333333333333333333"},
 {"id":"c5000000-0000-4000-8000-000000000009"},{"id":"c5000000-0000-4000-8000-00000000000a"},{"id":"c5000000-0000-4000-8000-00000000000b"}
]$$::jsonb);
grant select on pf_mix to public;
select is((select string_agg(right(media_id::text, 2) || ':' || outcome, ' ' order by media_id) from pf_mix),
  '01:promoted 02:promoted 03:promoted 04:promoted 05:duplicate 06:promoted 07:duplicate 08:duplicate 09:not_kept 0a:not_kept 0b:already_promoted',
  'mi1: mixed batch outcomes (null hashes, in-batch duplicates, outside holder, undecided, dismissed, already promoted)');
select is((select count(*)::int from pf_mix where outcome <> 'duplicate' and duplicate_of is not null), 0, 'mi1: duplicate_of is NULL for every non-duplicate outcome');
select is((select duplicate_of from pf_mix where media_id = 'c5000000-0000-4000-8000-000000000005'), 'c5000000-0000-4000-8000-000000000004'::uuid, 'mi1: the in-batch duplicate names the earlier id of the batch');
select is((select duplicate_of from pf_mix where media_id = 'c5000000-0000-4000-8000-000000000007'), 'c5000000-0000-4000-8000-000000000006'::uuid, 'mi1: ... for the second hash too');
select is((select duplicate_of from pf_mix where media_id = 'c5000000-0000-4000-8000-000000000008'), 'c5000000-0000-4000-8000-0000000000f0'::uuid, 'mi1: a duplicate of a row outside the batch names that row');
-- idempotent re-run
create temp table pf_again as select * from public.promote_found_media($$[
 {"id":"c5000000-0000-4000-8000-000000000001"},{"id":"c5000000-0000-4000-8000-000000000004","contentHash":"1111111111111111111111111111111111111111111111111111111111111111"},{"id":"c5000000-0000-4000-8000-000000000005","contentHash":"1111111111111111111111111111111111111111111111111111111111111111"},{"id":"c5000000-0000-4000-8000-000000000009"},{"id":"c5000000-0000-4000-8000-00000000000a"}
]$$::jsonb);
grant select on pf_again to public;
select is((select string_agg(right(media_id::text, 2) || ':' || outcome || ':' || coalesce(right(duplicate_of::text, 2), '-'), ' ' order by media_id) from pf_again),
  '01:already_promoted:- 04:already_promoted:- 05:duplicate:04 09:not_kept:- 0a:not_kept:-',
  'mi1: re-run: duplicate_of only on the one duplicate');

-- ---------------------------------------------------------------------------
-- mi4: keep:true promotes an undecided row and marks it kept in one statement; a
-- duplicate (or any non-promoted outcome) leaves the pre-promote triage state alone.
-- ---------------------------------------------------------------------------
select * from public.create_found_media('c1000000-0000-4000-8000-000000000001', $$[
 {"id":"c5000000-0000-4000-8000-0000000000a1","sourceAssetId":"m4-a1"},{"id":"c5000000-0000-4000-8000-0000000000a2","sourceAssetId":"m4-a2"},{"id":"c5000000-0000-4000-8000-0000000000a3","sourceAssetId":"m4-a3"},
 {"id":"c5000000-0000-4000-8000-0000000000a4","sourceAssetId":"m4-a4"},{"id":"c5000000-0000-4000-8000-0000000000a5","sourceAssetId":"m4-a5"},{"id":"c5000000-0000-4000-8000-0000000000a6","sourceAssetId":"m4-a6"}
]$$::jsonb);
select public.triage_found_media(array['c5000000-0000-4000-8000-0000000000a4']::uuid[], 'keep');
select public.triage_found_media(array['c5000000-0000-4000-8000-0000000000a5']::uuid[], 'dismiss');
insert into public.media (id, owner_id, journey_id, kind, status, captured_at, source_asset_id, content_hash) values
('c5000000-0000-4000-8000-0000000000f1', auth.uid(), 'c1000000-0000-4000-8000-000000000001', 'photo', 'ready', '2026-06-02T11:00:00Z', 'm4-outside', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
create temp table pf_keep as select * from public.promote_found_media($$[
 {"id":"c5000000-0000-4000-8000-0000000000a1","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","keep":true},
 {"id":"c5000000-0000-4000-8000-0000000000a2","contentHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","keep":true},
 {"id":"c5000000-0000-4000-8000-0000000000a3","contentHash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"},
 {"id":"c5000000-0000-4000-8000-0000000000a4","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
 {"id":"c5000000-0000-4000-8000-0000000000a5","keep":true}
]$$::jsonb);
grant select on pf_keep to public;
select is((select string_agg(right(media_id::text, 2) || ':' || outcome, ' ' order by media_id) from pf_keep),
  'a1:duplicate a2:promoted a3:not_kept a4:duplicate a5:not_kept',
  'mi4: outcomes with keep flags');
select is((select status::text || ':' || (reviewed_at is null) from public.media where id = 'c5000000-0000-4000-8000-0000000000a1'), 'found:true', 'mi4: kept-then-duplicate: the undecided row stays undecided (not marked kept)');
select is((select status::text || ':' || (reviewed_at is not null) from public.media where id = 'c5000000-0000-4000-8000-0000000000a2'), 'pending:true', 'mi4: keep:true on a unique hash promotes and marks the row kept');
select is((select status::text || ':' || (reviewed_at is null) from public.media where id = 'c5000000-0000-4000-8000-0000000000a3'), 'found:true', 'mi4: without the flag an undecided row is still not_kept and untouched');
select is((select status::text || ':' || (reviewed_at is not null) from public.media where id = 'c5000000-0000-4000-8000-0000000000a4'), 'found:true', 'mi4: an already kept row that ends as duplicate stays kept (state before the promote)');
select is((select status::text || ':' || (reviewed_at is null) || ':' || (deleted_at is not null) from public.media where id = 'c5000000-0000-4000-8000-0000000000a5'), 'found:true:true', 'mi4: a dismissed row is never revived by keep:true');
select throws_like($$ select * from public.promote_found_media('[{"id":"c5000000-0000-4000-8000-0000000000a3"},{"id":"c5000000-0000-4000-8000-0000000000a3","keep":"yes"}]'::jsonb) $$, 'promote_found_media: invalid item 1:%', 'mi4: a non-boolean keep names the item');
-- race: the hash is taken between plan and update; the row must stay undecided
reset role;
create function public.pf_race() returns trigger language plpgsql as $f$
begin
  if new.id = 'c5000000-0000-4000-8000-0000000000a6' and new.status = 'pending' then
    update public.media set content_hash = new.content_hash where id = 'c5000000-0000-4000-8000-0000000000a3';
  end if;
  return new;
end $f$;
create trigger pf_race before update of status on public.media
for each row when (new.status = 'pending') execute function public.pf_race();
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c02","role":"authenticated"}',true);
create temp table pf_race_res as
select * from public.promote_found_media($$[{"id":"c5000000-0000-4000-8000-0000000000a6","contentHash":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","keep":true}]$$::jsonb);
grant select on pf_race_res to public;
select is((select outcome from pf_race_res), 'duplicate', 'mi4: race with keep:true ends as duplicate (the simulated holder is rolled back with the subtransaction, so duplicate_of is not asserted)');
select is((select status::text || ':' || (reviewed_at is null) from public.media where id = 'c5000000-0000-4000-8000-0000000000a6'), 'found:true', 'mi4: ... and the raced row is rolled back to undecided');
reset role;
drop trigger pf_race on public.media;
drop function public.pf_race();

select * from finish();
rollback;
