-- Phase 4f, wave 4 follow-up: dismissed-before-upload is remembered and restorable;
-- known_source_assets. Roles: owner (e01), editor (e02), viewer (e03), stranger (e04).
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000e01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fd-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000e02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fd-editor@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000e03','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fd-viewer@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000e04','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fd-stranger@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000e01","role":"authenticated"}',true);
insert into public.journeys (id, creator_id, title, visibility, home_tz) values
('e1000000-0000-4000-8000-000000000001', auth.uid(), 'Dismiss', 'private', 'Europe/Prague'),
('e1000000-0000-4000-8000-000000000002', auth.uid(), 'Other', 'private', 'Europe/Prague');
insert into public.journey_members (journey_id, user_id, role) values
('e1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000e02','editor'),
('e1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000e03','member');

-- Five found rows: A, B, C, D, E (decisions below)
create temp table fd_seed as
select * from public.create_found_media('e1000000-0000-4000-8000-000000000001', $$[
 {"id":"e4000000-0000-4000-8000-00000000000a","sourceAssetId":"asset-A","capturedAt":"2026-06-01T10:00:00Z","capturedTz":"Europe/Prague"},
 {"id":"e4000000-0000-4000-8000-00000000000b","sourceAssetId":"asset-B","capturedAt":"2026-06-01T11:00:00Z","capturedTz":"Europe/Prague"},
 {"id":"e4000000-0000-4000-8000-00000000000c","sourceAssetId":"asset-C","capturedAt":"2026-06-01T12:00:00Z","capturedTz":"Europe/Prague"},
 {"id":"e4000000-0000-4000-8000-00000000000d","sourceAssetId":"asset-D","capturedAt":"2026-06-01T13:00:00Z","capturedTz":"Europe/Prague"},
 {"id":"e4000000-0000-4000-8000-00000000000e","sourceAssetId":"asset-E","capturedAt":"2026-06-01T14:00:00Z","capturedTz":"Europe/Prague"}
]$$::jsonb);

-- (a) triage decisions: keep / star / unstar / dismiss / restore ----------------
select is(public.triage_found_media(array['e4000000-0000-4000-8000-00000000000b']::uuid[], 'keep'), 1, 'keep: 1 row changed');
select is(public.triage_found_media(array['e4000000-0000-4000-8000-00000000000d']::uuid[], 'star'), 1, 'star: 1 row changed');
select is((select reviewed_at is not null and starred and deleted_at is null from public.media where id = 'e4000000-0000-4000-8000-00000000000d'), true, 'star = kept + starred');
select is(public.triage_found_media(array['e4000000-0000-4000-8000-00000000000d']::uuid[], 'star'), 0, 'star is idempotent');
select is(public.triage_found_media(array['e4000000-0000-4000-8000-00000000000d']::uuid[], 'unstar'), 1, 'unstar: 1 row changed');
select is((select reviewed_at is not null and not starred from public.media where id = 'e4000000-0000-4000-8000-00000000000d'), true, 'unstar keeps the kept state');
select is(public.triage_found_media(array['e4000000-0000-4000-8000-00000000000c','e4000000-0000-4000-8000-00000000000e']::uuid[], 'dismiss'), 2, 'dismiss: 2 rows changed');
select is(public.triage_found_media(array['e4000000-0000-4000-8000-00000000000c']::uuid[], 'dismiss'), 0, 'dismiss is idempotent');
select is((select deleted_at is not null and status = 'found' from public.media where id = 'e4000000-0000-4000-8000-00000000000c'), true, 'dismissed row stays found with deleted_at set');
select is(public.triage_found_media(array['e4000000-0000-4000-8000-00000000000a']::uuid[], 'drop'), 1, 'drop is an alias of dismiss');
select is(public.triage_found_media(array['e4000000-0000-4000-8000-00000000000a']::uuid[], 'restore'), 1, 'restore: dismissed row comes back');
select is((select deleted_at is null and reviewed_at is null from public.media where id = 'e4000000-0000-4000-8000-00000000000a'), true, 'restored undecided row is undecided again');
select throws_ok($$select public.triage_found_media(array['e4000000-0000-4000-8000-00000000000a']::uuid[], 'bogus')$$, '22023', null, 'unknown decision is rejected');

-- (b) bulk-create does not resurrect a dismissed row ------------------------------
select is((select outcome from public.create_found_media('e1000000-0000-4000-8000-000000000001',
  '[{"id":"e4000000-0000-4000-8000-0000000000c1","sourceAssetId":"asset-C","capturedAt":"2030-01-01T00:00:00Z"}]'::jsonb)), 'existing', 'repeat bulk-create: dismissed asset is reported existing');
select is((select dropped from public.create_found_media('e1000000-0000-4000-8000-000000000001',
  '[{"id":"e4000000-0000-4000-8000-0000000000c2","sourceAssetId":"asset-C"}]'::jsonb)), true, 'repeat bulk-create reports dropped = true');
select is((select deleted_at is not null and status = 'found' and captured_at = '2026-06-01T12:00:00Z' from public.media where id = 'e4000000-0000-4000-8000-00000000000c'), true, 'dismissed row untouched by repeat bulk-create');
select is((select count(*)::int from public.media where source_asset_id = 'asset-C'), 1, 'no second row for the dismissed asset');
select is((select outcome from public.create_found_media('e1000000-0000-4000-8000-000000000002',
  '[{"id":"e4000000-0000-4000-8000-0000000000c3","sourceAssetId":"asset-C"}]'::jsonb)), 'existing', 'same asset offered into another journey is still existing');

-- the Trash flow cannot make a dismissed asset "new" again
select is((select count(*)::int from public.claim_media_purge(array['e4000000-0000-4000-8000-00000000000c','e4000000-0000-4000-8000-00000000000e']::uuid[])), 0, 'claim_media_purge skips dismissed found rows');
select is((select count(*)::int from public.purge_media(array['e4000000-0000-4000-8000-00000000000c','e4000000-0000-4000-8000-00000000000e']::uuid[])), 0, 'purge_media skips dismissed found rows');
select is((select count(*)::int from public.media where source_asset_id in ('asset-C','asset-E')), 2, 'dismissed rows still exist after purge attempts');

-- (c) known_source_assets ----------------------------------------------------------
create temp table fd_known as
select * from public.known_source_assets('e1000000-0000-4000-8000-000000000001',
  array['asset-A','asset-B','asset-C','asset-D','asset-Z']);
grant select on fd_known to public;
select is((select count(*)::int from fd_known), 4, 'unknown ids are absent');
select is((select state from fd_known where source_asset_id = 'asset-A'), 'found', 'state found');
select is((select state from fd_known where source_asset_id = 'asset-B'), 'kept', 'state kept');
select is((select state from fd_known where source_asset_id = 'asset-C'), 'dismissed', 'state dismissed');
select count(*) from public.promote_found_media('[{"id":"e4000000-0000-4000-8000-00000000000b"}]'::jsonb);
select is((select state from public.known_source_assets('e1000000-0000-4000-8000-000000000001', array['asset-B'])), 'uploaded', 'state uploaded after promote to pending');
select throws_ok($$select * from public.known_source_assets('e1000000-0000-4000-8000-000000000001', (select array_agg('x' || g) from generate_series(1, 1001) g))$$, '22023', null, 'more than 1000 ids rejected');

-- a read-only member may call it (sees only their own rows = none); a stranger may not
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000e03","role":"authenticated"}',true);
select is((select count(*)::int from public.known_source_assets('e1000000-0000-4000-8000-000000000001', array['asset-A','asset-C'])), 0, 'member sees only their own known assets (none)');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000e04","role":"authenticated"}',true);
select throws_ok($$select * from public.known_source_assets('e1000000-0000-4000-8000-000000000001', array['asset-A'])$$, 'P0002', null, 'stranger: journey not found');
reset role;
set local role anon;
select throws_ok($$select * from public.known_source_assets('e1000000-0000-4000-8000-000000000001', array['asset-A'])$$, '42501', null, 'anon cannot execute');
reset role;

select * from finish();
rollback;
