-- Phase 4f, wave 4 review fixes (PR 69): M1 status guard, M2 journey delete,
-- m1 promote race, m2 private found rows, m3 item index, m4 promote scale, m5 Trash.
-- Roles: owner (b01), editor (b02), viewer (b03).
begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000b01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fr-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000b02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fr-editor@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000b03','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fr-viewer@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000b01","role":"authenticated"}',true);
insert into public.journeys (id, creator_id, title, visibility, home_tz) values
('b1000000-0000-4000-8000-000000000001', auth.uid(), 'Review', 'private', 'Europe/Prague'),
('b1000000-0000-4000-8000-000000000002', auth.uid(), 'Doomed', 'private', 'Europe/Prague');
insert into public.journey_members (journey_id, user_id, role) values
('b1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000b02','editor'),
('b1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000b03','member'),
('b1000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000b02','editor');
insert into public.moments (id, journey_id, starts_at, ends_at, published, created_by) values
('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','2026-06-01T08:00:00Z','2026-06-01T20:00:00Z', false, auth.uid());

select * from public.create_found_media('b1000000-0000-4000-8000-000000000001', $$[
 {"id":"b4000000-0000-4000-8000-0000000000a1","sourceAssetId":"r-A1","capturedAt":"2026-06-01T10:00:00Z","capturedTz":"Europe/Prague"},
 {"id":"b4000000-0000-4000-8000-0000000000a2","sourceAssetId":"r-A2","capturedAt":"2026-06-01T11:00:00Z","capturedTz":"Europe/Prague"},
 {"id":"b4000000-0000-4000-8000-0000000000a3","sourceAssetId":"r-A3","capturedAt":"2026-06-01T12:00:00Z","capturedTz":"Europe/Prague"}
]$$::jsonb);
select public.triage_found_media(array['b4000000-0000-4000-8000-0000000000a2','b4000000-0000-4000-8000-0000000000a3']::uuid[], 'keep');

-- ---------------------------------------------------------------------------
-- M1: only promote_found_media moves a row out of 'found'
-- ---------------------------------------------------------------------------
select throws_ok($$ update public.media set status = 'pending' where id = 'b4000000-0000-4000-8000-0000000000a1' $$, '42501', null, 'M1: owner cannot promote an undecided found row by UPDATE');
select throws_ok($$ update public.media set status = 'pending' where id = 'b4000000-0000-4000-8000-0000000000a2' $$, '42501', null, 'M1: owner cannot promote a kept found row by UPDATE');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000b02","role":"authenticated"}',true);
select throws_ok($$ update public.media set status = 'pending' where id = 'b4000000-0000-4000-8000-0000000000a1' $$, '42501', null, 'M1: editor cannot move another uploader''s found row to pending by UPDATE');
select set_config('app.media_found_transition','1',true);
select throws_ok($$ update public.media set status = 'pending' where id = 'b4000000-0000-4000-8000-0000000000a1' $$, '42501', null, 'M1: a client-set flag does not open the guard');
select set_config('app.media_found_transition','',true);
select is((select status::text from public.media where id = 'b4000000-0000-4000-8000-0000000000a1'), 'found', 'M1: the row is still found');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000b01","role":"authenticated"}',true);
select is((select outcome from public.promote_found_media('[{"id":"b4000000-0000-4000-8000-0000000000a2"}]'::jsonb)), 'promoted', 'M1: promote_found_media still works');
select is((select status::text from public.media where id = 'b4000000-0000-4000-8000-0000000000a2'), 'pending', 'M1: promoted row is pending');
select throws_ok($$ update public.media set status = 'found' where id = 'b4000000-0000-4000-8000-0000000000a2' $$, '42501', null, 'M1: nothing becomes found by UPDATE');
select is((select current_setting('app.media_found_transition', true)), '', 'M1: promote cleared its flag again');
select throws_ok($$ update public.media set status = 'pending' where id = 'b4000000-0000-4000-8000-0000000000a3' $$, '42501', null, 'M1: the flag does not leak to later statements');

-- ---------------------------------------------------------------------------
-- m2: found rows are private to the uploader
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000b02","role":"authenticated"}',true);
select throws_ok($$ select public.mark_media_reviewed(array['b4000000-0000-4000-8000-0000000000a1']::uuid[]) $$, 'P0002', null, 'm2: editor cannot keep another uploader''s found row (mark_media_reviewed)');
select throws_ok($$ select public.move_media(array['b4000000-0000-4000-8000-0000000000a1']::uuid[], 'b2000000-0000-4000-8000-000000000001') $$, 'P0002', null, 'm2: editor cannot move another uploader''s found row (move_media)');
select throws_ok($$ select public.set_media_location(array['b4000000-0000-4000-8000-0000000000a1']::uuid[], 50, 14) $$, 'P0002', null, 'm2: editor cannot set the location of another uploader''s found row');
select throws_ok($$ select public.trash_media(array['b4000000-0000-4000-8000-0000000000a1']::uuid[]) $$, 'P0002', null, 'm2: editor cannot trash another uploader''s found row');
select is((select reviewed_at is null and moment_id is null and deleted_at is null and latitude is null from public.media where id = 'b4000000-0000-4000-8000-0000000000a1'), true, 'm2: the row is unchanged');
select is((select count(*)::int from public.create_found_media('b1000000-0000-4000-8000-000000000001', '[{"id":"b4000000-0000-4000-8000-0000000000e1","sourceAssetId":"r-E1"}]'::jsonb) where outcome = 'inserted'), 1, 'm2: editor creates their own found row');
select is(public.mark_media_reviewed(array['b4000000-0000-4000-8000-0000000000e1']::uuid[]), 1, 'm2: editor still organises their own found row');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000b01","role":"authenticated"}',true);
select throws_ok($$ select public.move_media(array['b4000000-0000-4000-8000-0000000000e1']::uuid[], 'b2000000-0000-4000-8000-000000000001') $$, 'P0002', null, 'm2: the owner of the journey cannot touch the editor''s found row either');
select is(public.move_media(array['b4000000-0000-4000-8000-0000000000a1']::uuid[], 'b2000000-0000-4000-8000-000000000001'), 1, 'm2: uploader organises their own found row');

-- ---------------------------------------------------------------------------
-- m5: found rows are not part of the Trash
-- ---------------------------------------------------------------------------
select is(public.triage_found_media(array['b4000000-0000-4000-8000-0000000000a1']::uuid[], 'dismiss'), 1, 'm5: dismiss through triage');
select is(public.trash_media(array['b4000000-0000-4000-8000-0000000000a1']::uuid[]), 0, 'm5: trash_media ignores found rows');
select is(public.restore_media(array['b4000000-0000-4000-8000-0000000000a1']::uuid[]), 0, 'm5: restore_media is a no-op for found rows');
select is((select count(*)::int from public.claim_media_purge(array['b4000000-0000-4000-8000-0000000000a1']::uuid[])), 0, 'm5: claim_media_purge ignores found rows');
select is((select count(*)::int from public.purge_media(array['b4000000-0000-4000-8000-0000000000a1']::uuid[])), 0, 'm5: purge_media ignores found rows');
select is((select deleted_at is not null and status = 'found' and purge_claimed_at is null from public.media where id = 'b4000000-0000-4000-8000-0000000000a1'), true, 'm5: the dismissed row stays dismissed and unclaimed');
select is(public.triage_found_media(array['b4000000-0000-4000-8000-0000000000a1']::uuid[], 'restore'), 1, 'm5: restore only through triage');

-- ---------------------------------------------------------------------------
-- m3: malformed items name their index (22023, short message)
-- ---------------------------------------------------------------------------
select throws_like($$ select * from public.create_found_media('b1000000-0000-4000-8000-000000000001', '[{"id":"b4000000-0000-4000-8000-0000000000f1","sourceAssetId":"ok"},{"id":"b4000000-0000-4000-8000-0000000000f2","sourceAssetId":"ok2"},{"id":"b4000000-0000-4000-8000-0000000000f3","sourceAssetId":"bad","latitude":10}]'::jsonb) $$, 'create_found_media: invalid item 2:%', 'm3: lone latitude names item 2');
select throws_like($$ select * from public.create_found_media('b1000000-0000-4000-8000-000000000001', ('[{"id":"b4000000-0000-4000-8000-0000000000f1","sourceAssetId":"' || repeat('x', 256) || '"}]')::jsonb) $$, 'create_found_media: invalid item 0:%', 'm3: 256-character sourceAssetId names item 0');
select throws_like($$ select * from public.create_found_media('b1000000-0000-4000-8000-000000000001', '[{"id":"b4000000-0000-4000-8000-0000000000f1","sourceAssetId":"ok"},{"id":"b4000000-0000-4000-8000-0000000000f2","sourceAssetId":"ok2","width":-5}]'::jsonb) $$, 'create_found_media: invalid item 1:%', 'm3: negative width names item 1');
select throws_like($$ select * from public.create_found_media('b1000000-0000-4000-8000-000000000001', '[{"id":"b4000000-0000-4000-8000-0000000000f1","sourceAssetId":"ok"},{"id":"b4000000-0000-4000-8000-0000000000f2","sourceAssetId":"ok2","capturedAt":"nope"}]'::jsonb) $$, 'create_found_media: invalid item 1:%', 'm3: bad timestamp names item 1');
select throws_like($$ select * from public.promote_found_media('[{"id":"b4000000-0000-4000-8000-0000000000a3"},{"id":"b4000000-0000-4000-8000-0000000000a3","contentHash":"XYZ"}]'::jsonb) $$, 'promote_found_media: invalid item 1:%', 'm3: promote names the bad item');
select is((select count(*)::int from public.media where source_asset_id in ('ok','ok2','bad')), 0, 'm3: a rejected call leaves nothing behind');

-- ---------------------------------------------------------------------------
-- m1: a racing promote ends in a per-item duplicate, not 23505. The race is
-- simulated by a trigger that gives another row the same hash inside the
-- statement, so the unique index fires exactly as in the concurrent case.
-- ---------------------------------------------------------------------------
reset role;
create function public.fr_race() returns trigger language plpgsql as $f$
begin
  if new.id = 'b4000000-0000-4000-8000-0000000000a3' and new.status = 'pending' then
    update public.media set content_hash = new.content_hash
     where id = 'b4000000-0000-4000-8000-0000000000a1';
  end if;
  return new;
end $f$;
create trigger fr_race before update of status on public.media
for each row when (new.status = 'pending') execute function public.fr_race();
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000b01","role":"authenticated"}',true);
create temp table fr_race_res as
select * from public.promote_found_media($$[
  {"id":"b4000000-0000-4000-8000-0000000000a3","contentHash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}
]$$::jsonb);
grant select on fr_race_res to public;
select is((select outcome from fr_race_res), 'duplicate', 'm1: unique violation during promote becomes outcome duplicate');
select is((select status::text from public.media where id = 'b4000000-0000-4000-8000-0000000000a3'), 'found', 'm1: the losing row stays found');
reset role;
drop trigger fr_race on public.media;
drop function public.fr_race();
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000b01","role":"authenticated"}',true);

-- ---------------------------------------------------------------------------
-- m4: promote is linear when one hash repeats 5000 times
-- ---------------------------------------------------------------------------
create temp table fr_t (t0 timestamptz, t1 timestamptz);
insert into fr_t (t0) values (clock_timestamp());
create temp table fr_big as
select * from public.create_found_media('b1000000-0000-4000-8000-000000000001',
  (select jsonb_agg(jsonb_build_object('id', ('b5000000-0000-4000-8000-' || lpad(to_hex(g), 12, '0')), 'sourceAssetId', 'rb-' || g)) from generate_series(1, 5000) g));
select public.triage_found_media((select array_agg(media_id) from fr_big), 'keep');
update fr_t set t0 = clock_timestamp();
create temp table fr_pr as
select * from public.promote_found_media(
  (select jsonb_agg(jsonb_build_object('id', media_id, 'contentHash', repeat('d', 64))) from fr_big));
update fr_t set t1 = clock_timestamp();
grant select on fr_pr, fr_t to public;
select is((select count(*)::int from fr_pr where outcome = 'promoted'), 1, 'm4: 5000 ids with one hash: exactly one is promoted');
select is((select count(*)::int from fr_pr where outcome = 'duplicate' and duplicate_of is not null), 4999, 'm4: the other 4999 are duplicates of the first');
select ok((select t1 - t0 < interval '3 seconds' from fr_t), 'm4: promote of 5000 repeated hashes takes under 3 seconds');

-- ---------------------------------------------------------------------------
-- M2: deleting a journey deletes its found rows
-- ---------------------------------------------------------------------------
select * from public.create_found_media('b1000000-0000-4000-8000-000000000002', $$[
 {"id":"b4000000-0000-4000-8000-0000000000d1","sourceAssetId":"del-1"},
 {"id":"b4000000-0000-4000-8000-0000000000d2","sourceAssetId":"del-2"}
]$$::jsonb);
select public.triage_found_media(array['b4000000-0000-4000-8000-0000000000d2']::uuid[], 'dismiss');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000b02","role":"authenticated"}',true);
select * from public.create_found_media('b1000000-0000-4000-8000-000000000002', '[{"id":"b4000000-0000-4000-8000-0000000000d3","sourceAssetId":"del-3"}]'::jsonb);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000b01","role":"authenticated"}',true);
delete from public.journeys where id = 'b1000000-0000-4000-8000-000000000002';
reset role;
select is((select count(*)::int from public.media where source_asset_id like 'del-%'), 0, 'M2: found rows (undecided, dismissed, other uploader) are gone with the journey');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000b01","role":"authenticated"}',true);
select is((select count(*)::int from public.create_found_media('b1000000-0000-4000-8000-000000000001', '[{"id":"b4000000-0000-4000-8000-0000000000d4","sourceAssetId":"del-1"},{"id":"b4000000-0000-4000-8000-0000000000d5","sourceAssetId":"del-2"}]'::jsonb) where outcome = 'inserted'), 2, 'M2: the assets can be found again in another journey');

reset role;
select * from finish();
rollback;
