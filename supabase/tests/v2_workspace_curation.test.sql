begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000c01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','wc-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000c02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','wc-viewer@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000c03','00000000-0000-0000-0000-000000000000','authenticated','authenticated','wc-other@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

-- Other user's journey B with media.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c03","role":"authenticated"}',true);
insert into public.journeys (id, creator_id, title, visibility)
  values ('cb000000-0000-4000-8000-000000000002', auth.uid(), 'Other', 'private');
insert into public.media (id, owner_id, journey_id, kind, status, captured_at) values
('cb300000-0000-4000-8000-000000000001', auth.uid(), 'cb000000-0000-4000-8000-000000000002','photo','ready','2026-06-01T10:00:00Z');

-- Journey A (public) as owner.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c01","role":"authenticated"}',true);
insert into public.journeys (id, creator_id, title, visibility, slug)
  values ('ca000000-0000-4000-8000-000000000001', auth.uid(), 'Mine', 'public', 'wc-mine');
insert into public.journey_members (journey_id, user_id, role)
  values ('ca000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000c02','member');
insert into public.journeys (id, creator_id, title, visibility)
  values ('ca000000-0000-4000-8000-000000000002', auth.uid(), 'Mine2', 'private');

insert into public.moments (id, journey_id, starts_at, ends_at, created_by) values
('ca200000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000001','2026-06-03T10:00:00Z','2026-06-03T11:00:00Z', auth.uid()),
('ca200000-0000-4000-8000-000000000002','ca000000-0000-4000-8000-000000000001','2026-06-03T12:00:00Z','2026-06-03T13:00:00Z', auth.uid()),
('ca200000-0000-4000-8000-000000000003','ca000000-0000-4000-8000-000000000001','2026-06-10T12:00:00Z','2026-06-10T13:00:00Z', auth.uid());
insert into public.media (id, owner_id, journey_id, kind, status, captured_at, latitude, longitude, hide_location, moment_id) values
('ca300000-0000-4000-8000-000000000001', auth.uid(), 'ca000000-0000-4000-8000-000000000001','photo','ready','2026-06-03T10:10:00Z',50,10,false,'ca200000-0000-4000-8000-000000000001'),
('ca300000-0000-4000-8000-000000000002', auth.uid(), 'ca000000-0000-4000-8000-000000000001','photo','ready','2026-06-03T10:20:00Z',52,12,false,'ca200000-0000-4000-8000-000000000001'),
('ca300000-0000-4000-8000-000000000003', auth.uid(), 'ca000000-0000-4000-8000-000000000001','photo','ready','2026-06-03T12:10:00Z',null,null,false,'ca200000-0000-4000-8000-000000000002'),
('ca300000-0000-4000-8000-000000000004', auth.uid(), 'ca000000-0000-4000-8000-000000000001','photo','ready','2026-06-10T12:10:00Z',null,null,false,'ca200000-0000-4000-8000-000000000003'),
('ca300000-0000-4000-8000-000000000005', auth.uid(), 'ca000000-0000-4000-8000-000000000001','photo','ready','2026-06-03T10:30:00Z',60,20,true,'ca200000-0000-4000-8000-000000000001'),
('ca300000-0000-4000-8000-000000000009', auth.uid(), 'ca000000-0000-4000-8000-000000000002','photo','ready','2026-06-03T10:30:00Z',null,null,false,null);
insert into public.segments (id, journey_id, kind, title, starts_at, ends_at, cover_media_id, created_by) values
('ca100000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000001','stage','S1','2026-06-01T00:00:00Z','2026-06-30T00:00:00Z','ca300000-0000-4000-8000-000000000001', auth.uid());
update public.moments set cover_media_id = 'ca300000-0000-4000-8000-000000000001' where id = 'ca200000-0000-4000-8000-000000000001';
update public.journeys set cover_media_id = 'ca300000-0000-4000-8000-000000000001' where id = 'ca000000-0000-4000-8000-000000000001';

-- ------------------------------------------------------------ grants / direct writes
select throws_ok(
  $$ update public.media set deleted_at = now() where id = 'ca300000-0000-4000-8000-000000000004' $$,
  '42501', null, 'deleted_at is not writable directly');

-- ------------------------------------------------------------ trash_media authz
select throws_ok(
  $$ select public.trash_media(array['cb300000-0000-4000-8000-000000000001']::uuid[]) $$,
  'P0002', null, 'foreign journey media: not found');
select throws_ok(
  $$ select public.trash_media(array['ca300000-0000-4000-8000-000000000001','cb300000-0000-4000-8000-000000000001']::uuid[]) $$,
  'P0002', null, 'mixed own and foreign ids rejected');
select throws_ok(
  $$ select public.trash_media(array['ca300000-0000-4000-8000-000000000001','ca300000-0000-4000-8000-000000000009']::uuid[]) $$,
  '22023', null, 'ids from two own journeys rejected');
select throws_ok(
  $$ select public.trash_media(array['ca300000-0000-4000-8000-0000000000ff']::uuid[]) $$,
  'P0002', null, 'missing id rejected');
select throws_ok(
  format($$ select public.trash_media(array(select gen_random_uuid() from generate_series(1,501))) $$),
  '22023', null, 'more than 500 ids rejected');
select is(public.trash_media('{}'::uuid[]), 0, 'empty array is a no-op');

-- Read-only member cannot trash; stranger cannot.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c02","role":"authenticated"}',true);
select throws_ok(
  $$ select public.trash_media(array['ca300000-0000-4000-8000-000000000001']::uuid[]) $$,
  '42501', null, 'read-only member cannot trash');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c03","role":"authenticated"}',true);
select throws_ok(
  $$ select public.trash_media(array['ca300000-0000-4000-8000-000000000001']::uuid[]) $$,
  'P0002', null, 'other user cannot trash on a foreign journey');
select throws_ok(
  $$ select public.purge_media(array['ca300000-0000-4000-8000-000000000001']::uuid[]) $$,
  'P0002', null, 'other user cannot purge');
select throws_ok(
  $$ select public.move_media(array['ca300000-0000-4000-8000-000000000001']::uuid[], 'ca200000-0000-4000-8000-000000000002') $$,
  'P0002', null, 'other user cannot move');
select throws_ok(
  $$ select public.delete_moment('ca200000-0000-4000-8000-000000000001', 'keep_media') $$,
  'P0002', null, 'other user cannot delete a moment');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c01","role":"authenticated"}',true);

-- ------------------------------------------------------------ trash + covers
select is(public.trash_media(array['ca300000-0000-4000-8000-000000000001']::uuid[]), 1, 'trash returns number trashed');
select is(public.trash_media(array['ca300000-0000-4000-8000-000000000001']::uuid[]), 0, 'trashing twice is a no-op');
select results_eq(
  $$ select (select cover_media_id from public.journeys where id = 'ca000000-0000-4000-8000-000000000001') is null,
            (select cover_media_id from public.segments where id = 'ca100000-0000-4000-8000-000000000001') is null,
            (select cover_media_id from public.moments where id = 'ca200000-0000-4000-8000-000000000001') is null $$,
  $$ values (true, true, true) $$, 'trash clears journey, segment and moment covers');
select results_eq(
  $$ select deleted_at is not null, moment_id from public.media where id = 'ca300000-0000-4000-8000-000000000001' $$,
  $$ values (true, 'ca200000-0000-4000-8000-000000000001'::uuid) $$, 'trashed media keep their moment and stay visible to the owner');
select throws_ok(
  $$ update public.moments set cover_media_id = 'ca300000-0000-4000-8000-000000000001' where id = 'ca200000-0000-4000-8000-000000000001' $$,
  '23514', null, 'trashed media cannot become a cover');

-- ------------------------------------------------------------ public reads
select set_config('request.jwt.claims','{}',true);
set local role anon;
select is(
  (select jsonb_array_length(public.get_public_journey((select handle from public.spaces s join public.journeys j on j.space_id = s.id where j.slug = 'wc-mine'), 'wc-mine') -> 'media')),
  4, 'public journey hides trashed media (5 ready - 1 trashed)');
select is(
  (select count(*)::int from jsonb_array_elements(public.get_public_journey((select handle from public.spaces s join public.journeys j on j.space_id = s.id where j.slug = 'wc-mine'), 'wc-mine') -> 'media') e where e ->> 'id' = 'ca300000-0000-4000-8000-000000000001'),
  0, 'trashed id absent from public media');
reset role;

-- A cover pointing at trashed media (forced as superuser, triggers off) is not exposed.
set local session_replication_role = replica;
update public.moments set cover_media_id = 'ca300000-0000-4000-8000-000000000001' where id = 'ca200000-0000-4000-8000-000000000001';
update public.journeys set cover_media_id = 'ca300000-0000-4000-8000-000000000001' where id = 'ca000000-0000-4000-8000-000000000001';
set local session_replication_role = origin;
set local role anon;
select is(
  (select public.get_public_journey((select handle from public.spaces s join public.journeys j on j.space_id = s.id where j.slug = 'wc-mine'), 'wc-mine') -> 'journey' -> 'coverMediaId'),
  'null'::jsonb, 'public journey cover falls back to null for trashed media');
select is(
  (select e -> 'coverMediaId' from jsonb_array_elements(public.get_public_journey((select handle from public.spaces s join public.journeys j on j.space_id = s.id where j.slug = 'wc-mine'), 'wc-mine') -> 'moments') e where e ->> 'id' = 'ca200000-0000-4000-8000-000000000001'),
  'null'::jsonb, 'public moment cover falls back to null for trashed media');
select is(
  public.is_interactable_target('media', 'ca300000-0000-4000-8000-000000000001'),
  false, 'trashed media is not an interactable public target');
reset role;
update public.moments set cover_media_id = null where id = 'ca200000-0000-4000-8000-000000000001';
update public.journeys set cover_media_id = null where id = 'ca000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c01","role":"authenticated"}',true);
set local role authenticated;

-- ------------------------------------------------------------ restore
select is(public.restore_media(array['ca300000-0000-4000-8000-000000000001','ca300000-0000-4000-8000-000000000002']::uuid[]), 1, 'restore counts only trashed rows');
select results_eq(
  $$ select deleted_at is null, moment_id from public.media where id = 'ca300000-0000-4000-8000-000000000001' $$,
  $$ values (true, 'ca200000-0000-4000-8000-000000000001'::uuid) $$, 'restore puts media back into the moment');
-- restore after the moment is gone: moment_id stays null
select public.trash_media(array['ca300000-0000-4000-8000-000000000004']::uuid[]);
select public.delete_moment('ca200000-0000-4000-8000-000000000003', 'keep_media');
select public.restore_media(array['ca300000-0000-4000-8000-000000000004']::uuid[]);
select results_eq(
  $$ select deleted_at is null, moment_id is not null from public.media where id = 'ca300000-0000-4000-8000-000000000004' $$,
  $$ values (true, true) $$, 'media of a deleted moment were moved to a neighbour (keep_media), restore leaves them there');

-- ------------------------------------------------------------ purge
select results_eq(
  $$ select public.purge_media(array['ca300000-0000-4000-8000-000000000001','ca300000-0000-4000-8000-000000000002']::uuid[]) $$,
  $$ select null::uuid where false $$, 'purge does not delete live media');
select public.trash_media(array['ca300000-0000-4000-8000-000000000002']::uuid[]);
-- An editor who did not upload the media cannot purge it (R2 objects are the uploader's).
reset role;
update public.journey_members set role = 'editor'
 where journey_id = 'ca000000-0000-4000-8000-000000000001' and user_id = '00000000-0000-4000-8000-000000000c02';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c02","role":"authenticated"}',true);
select throws_ok(
  $$ select public.purge_media(array['ca300000-0000-4000-8000-000000000002']::uuid[]) $$,
  '42501', null, 'editor who is not the uploader cannot purge');
select throws_ok(
  $$ select public.claim_media_purge(array['ca300000-0000-4000-8000-000000000002']::uuid[]) $$,
  '42501', null, 'editor who is not the uploader cannot claim');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c01","role":"authenticated"}',true);
select results_eq(
  $$ select public.purge_media(array['ca300000-0000-4000-8000-000000000002']::uuid[]) $$,
  $$ select null::uuid where false $$, 'purge requires a prior claim');
select results_eq(
  $$ select public.claim_media_purge(array['ca300000-0000-4000-8000-000000000001','ca300000-0000-4000-8000-000000000002']::uuid[]) $$,
  $$ values ('ca300000-0000-4000-8000-000000000002'::uuid) $$, 'claim returns only trashed own ids');
select results_eq(
  $$ select public.claim_media_purge(array['ca300000-0000-4000-8000-000000000002']::uuid[]) $$,
  $$ values ('ca300000-0000-4000-8000-000000000002'::uuid) $$, 'claim is idempotent');
select is(public.restore_media(array['ca300000-0000-4000-8000-000000000002']::uuid[]), 0, 'restore skips claimed rows (race)');
select is((select deleted_at is not null from public.media where id = 'ca300000-0000-4000-8000-000000000002'), true, 'claimed row is still trashed after restore attempt');
select results_eq(
  $$ select public.purge_media(array['ca300000-0000-4000-8000-000000000001','ca300000-0000-4000-8000-000000000002']::uuid[]) $$,
  $$ values ('ca300000-0000-4000-8000-000000000002'::uuid) $$, 'purge deletes only trashed and claimed rows');
select is((select count(*)::int from public.media where id in ('ca300000-0000-4000-8000-000000000001','ca300000-0000-4000-8000-000000000002')), 1, 'live media survived purge');

-- ------------------------------------------------------------ move_media
select is(public.move_media(array['ca300000-0000-4000-8000-000000000003']::uuid[], 'ca200000-0000-4000-8000-000000000001'), 1, 'move_media moves one medium');
select results_eq(
  $$ select moment_id, (select locked and origin = 'manual' from public.moments where id = 'ca200000-0000-4000-8000-000000000001'),
            (select locked and origin = 'manual' from public.moments where id = 'ca200000-0000-4000-8000-000000000002') from public.media where id = 'ca300000-0000-4000-8000-000000000003' $$,
  $$ values ('ca200000-0000-4000-8000-000000000001'::uuid, true, true) $$, 'target and source become manual and locked');
select throws_ok(
  $$ select public.move_media(array['ca300000-0000-4000-8000-000000000003']::uuid[], 'ca200000-0000-4000-8000-0000000000ff') $$,
  '22023', null, 'unknown target moment rejected');
select throws_ok(
  $$ select public.move_media(array['ca300000-0000-4000-8000-000000000003']::uuid[], null) $$,
  '22023', null, 'null target rejected');
select is(public.move_media(array['ca300000-0000-4000-8000-000000000003']::uuid[], 'ca200000-0000-4000-8000-000000000002'), 1, 'move back to the second moment');

-- ------------------------------------------------------------ create_moment_from_media
select is(public.create_moment_from_media(array['ca300000-0000-4000-8000-000000000003','ca300000-0000-4000-8000-000000000005']::uuid[], 'ca200000-0000-4000-8000-0000000000aa'), 'ca200000-0000-4000-8000-0000000000aa'::uuid, 'create_moment_from_media returns the new id');
select results_eq(
  $$ select starts_at, ends_at, latitude, origin::text, locked from public.moments where id = 'ca200000-0000-4000-8000-0000000000aa' $$,
  $$ values ('2026-06-03T10:30:00Z'::timestamptz, '2026-06-03T12:10:00Z'::timestamptz, null::double precision, 'manual', true) $$,
  'new moment spans media; hidden-location media do not set the centroid');

-- ------------------------------------------------------------ delete_moment
select throws_ok($$ select public.delete_moment('ca200000-0000-4000-8000-000000000001', 'bogus') $$, '22023', null, 'bad mode rejected');
select public.delete_moment('ca200000-0000-4000-8000-0000000000aa', 'trash_media');
select results_eq(
  $$ select deleted_at is not null, moment_id is null from public.media where id = 'ca300000-0000-4000-8000-000000000005' $$,
  $$ values (true, true) $$, 'delete_moment trash_media trashes its media');

-- ------------------------------------------------------------ delete_moment privacy
-- Unpublished moment U1 with media, published moments P1 (near), unpublished U2 (far).
insert into public.moments (id, journey_id, starts_at, ends_at, published, created_by) values
('ca200000-0000-4000-8000-0000000000b1','ca000000-0000-4000-8000-000000000001','2026-07-01T10:00:00Z','2026-07-01T11:00:00Z', false, auth.uid()),
('ca200000-0000-4000-8000-0000000000b2','ca000000-0000-4000-8000-000000000001','2026-07-01T12:00:00Z','2026-07-01T13:00:00Z', true, auth.uid()),
('ca200000-0000-4000-8000-0000000000b3','ca000000-0000-4000-8000-000000000001','2026-08-01T12:00:00Z','2026-08-01T13:00:00Z', false, auth.uid());
insert into public.media (id, owner_id, journey_id, kind, status, captured_at, moment_id) values
('ca300000-0000-4000-8000-0000000000b1', auth.uid(), 'ca000000-0000-4000-8000-000000000001','photo','ready','2026-07-01T10:10:00Z','ca200000-0000-4000-8000-0000000000b1');
select public.delete_moment('ca200000-0000-4000-8000-0000000000b1', 'keep_media');
select is((select moment_id from public.media where id = 'ca300000-0000-4000-8000-0000000000b1'), 'ca200000-0000-4000-8000-0000000000b3'::uuid, 'keep_media skips the nearer published moment and uses the same-state neighbour');
select throws_ok(
  $$ select public.delete_moment('ca200000-0000-4000-8000-0000000000b3', 'keep_media') $$,
  '22023', 'delete_moment: no neighbour with the same visibility', 'unpublished source without same-state neighbour raises');
select is((select count(*)::int from public.moments where id = 'ca200000-0000-4000-8000-0000000000b3'), 1, 'moment survives the failed delete');
select is((select count(*)::int from public.media where id = 'ca300000-0000-4000-8000-0000000000b1' and moment_id is not null), 1, 'media stay assigned after the failed delete');

select * from finish();
rollback;
