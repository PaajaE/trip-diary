begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000e01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pd-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000e02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pd-viewer@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000e01","role":"authenticated"}',true);
insert into public.journeys (id, creator_id, title, visibility, slug, home_tz)
  values ('e1000000-0000-4000-8000-000000000001', auth.uid(), 'Delay', 'public', 'pd-pub', 'Europe/Prague');
insert into public.journey_members (journey_id, user_id, role)
  values ('e1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000e02','member');

-- old moment (30 d), recent moment (2 d); old/recent segments; media for each
insert into public.moments (id, journey_id, starts_at, ends_at, published, created_by) values
('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001', now() - interval '30 days', now() - interval '30 days' + interval '1 hour', true, auth.uid()),
('e2000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001', now() - interval '2 days', now() - interval '2 days' + interval '1 hour', true, auth.uid());
insert into public.segments (id, journey_id, kind, title, starts_at, ends_at, created_by) values
('e3000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','stage','Old', now() - interval '40 days', now() - interval '20 days', auth.uid()),
('e3000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','stage','Recent', now() - interval '3 days', now() - interval '1 day', auth.uid());
insert into public.media (id, owner_id, journey_id, kind, status, captured_at, captured_tz, width, height, moment_id) values
('e4000000-0000-4000-8000-000000000001', auth.uid(), 'e1000000-0000-4000-8000-000000000001','photo','ready', now() - interval '30 days','Europe/Prague',100,100,'e2000000-0000-4000-8000-000000000001'),
('e4000000-0000-4000-8000-000000000002', auth.uid(), 'e1000000-0000-4000-8000-000000000001','photo','ready', now() - interval '2 days','Europe/Prague',100,100,'e2000000-0000-4000-8000-000000000002'),
('e4000000-0000-4000-8000-000000000003', auth.uid(), 'e1000000-0000-4000-8000-000000000001','photo','ready', now() - interval '1 day','Europe/Prague',100,100,null),
('e4000000-0000-4000-8000-000000000004', auth.uid(), 'e1000000-0000-4000-8000-000000000001','photo','ready', now() - interval '25 days','Europe/Prague',100,100,null),
-- old photo attached to the RECENT moment: hidden with its moment
('e4000000-0000-4000-8000-000000000005', auth.uid(), 'e1000000-0000-4000-8000-000000000001','photo','ready', now() - interval '30 days','Europe/Prague',100,100,'e2000000-0000-4000-8000-000000000002'),
-- undated and unassigned: hidden while a delay is set
('e4000000-0000-4000-8000-000000000006', auth.uid(), 'e1000000-0000-4000-8000-000000000001','photo','ready', null,'Europe/Prague',100,100,null);
insert into public.media_variants (media_id, kind, storage_key, mime_type, width, height, byte_size) values
('e4000000-0000-4000-8000-000000000001','small','00000000-0000-4000-8000-000000000e01/e4000000-0000-4000-8000-000000000001/small.webp','image/webp',80,80,1000),
('e4000000-0000-4000-8000-000000000002','small','00000000-0000-4000-8000-000000000e01/e4000000-0000-4000-8000-000000000002/small.webp','image/webp',80,80,1000);
update public.journeys set cover_media_id = 'e4000000-0000-4000-8000-000000000002'
  where id = 'e1000000-0000-4000-8000-000000000001';

reset role;
create temp table pd_h as select handle from public.spaces s join public.journeys j on j.space_id = s.id where j.slug = 'pd-pub';
grant select on pd_h to anon, authenticated;

-- delay 0: everything is public (previous behaviour)
set local role anon;
select is(jsonb_array_length(public.get_public_journey((select handle from pd_h), 'pd-pub') -> 'moments'), 2, 'delay 0: both moments public');
select is(jsonb_array_length(public.get_public_journey((select handle from pd_h), 'pd-pub') -> 'media'), 6, 'delay 0: all media public');
select is(jsonb_array_length(public.get_public_journey((select handle from pd_h), 'pd-pub') -> 'segments'), 2, 'delay 0: both segments public');
select is((select count(*)::int from public.list_public_journey_paths() where journey_slug = 'pd-pub'), 1, 'delay 0: path listed');

-- anon cannot change the delay
select throws_ok($$ update public.journeys set publish_delay_days = 5 where slug = 'pd-pub' $$, '42501', null, 'anon cannot set publish_delay_days');
reset role;

-- bad values rejected (owner)
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000e01","role":"authenticated"}',true);
select throws_ok($$ update public.journeys set publish_delay_days = -1 where slug = 'pd-pub' $$, '23514', null, 'negative delay rejected');
select throws_ok($$ update public.journeys set publish_delay_days = 366 where slug = 'pd-pub' $$, '23514', null, 'delay over 365 rejected');
select lives_ok($$ update public.journeys set publish_delay_days = 7 where slug = 'pd-pub' $$, 'owner sets a 7 day delay');
reset role;

-- delay 7: recent items disappear from the public model
set local role anon;
select is(
  (select jsonb_agg(e ->> 'id') from jsonb_array_elements(public.get_public_journey((select handle from pd_h), 'pd-pub') -> 'moments') e),
  '["e2000000-0000-4000-8000-000000000001"]'::jsonb, 'delay 7: only the old moment');
select is(
  (select jsonb_agg(e ->> 'id' order by e ->> 'id') from jsonb_array_elements(public.get_public_journey((select handle from pd_h), 'pd-pub') -> 'media') e),
  '["e4000000-0000-4000-8000-000000000001", "e4000000-0000-4000-8000-000000000004"]'::jsonb,
  'delay 7: old media (also unassigned) only');
select is(
  (select jsonb_agg(v ->> 'storageKey') from jsonb_array_elements(public.get_public_journey((select handle from pd_h), 'pd-pub') -> 'media') e,
     jsonb_array_elements(e -> 'variants') v),
  '["00000000-0000-4000-8000-000000000e01/e4000000-0000-4000-8000-000000000001/small.webp"]'::jsonb,
  'delay 7: variants of hidden media are not exposed');
select is(
  (select jsonb_agg(e ->> 'id') from jsonb_array_elements(public.get_public_journey((select handle from pd_h), 'pd-pub') -> 'segments') e),
  '["e3000000-0000-4000-8000-000000000001"]'::jsonb, 'delay 7: segment fully in the window is hidden');
select is(public.get_public_journey((select handle from pd_h), 'pd-pub') -> 'journey' -> 'coverMediaId', 'null'::jsonb, 'delay 7: hidden cover is not exposed');
select is((select count(*)::int from public.list_public_journey_paths() where journey_slug = 'pd-pub'), 1, 'delay 7: path listed (old moment exists)');
select is(
  (select count(*)::int from public.list_public_journey_paths() where journey_slug = 'pd-pub' and updated_at > now() - interval '7 days'),
  0, 'delay 7: updated_at does not reveal recent edits');
select is((select count(*)::int from public.content_hearts), 0, 'engagement tables readable but empty');
reset role;

-- the engagement target rule hides recent targets
select is(
  public.is_interactable_target('moment', 'e2000000-0000-4000-8000-000000000002'), false,
  'delay 7: recent moment is not interactable');

select is(public.is_interactable_target('media', 'e4000000-0000-4000-8000-000000000005'), false,
  'delay 7: old media of a recent moment is not interactable');
select is(public.is_interactable_target('media', 'e4000000-0000-4000-8000-000000000006'), false,
  'delay 7: undated unassigned media is not interactable');
select is(public.is_interactable_target('media', 'e4000000-0000-4000-8000-000000000001'), true,
  'delay 7: old media is interactable');
select is(public.is_interactable_target('moment', 'e2000000-0000-4000-8000-000000000001'), true,
  'delay 7: old moment is interactable');

-- members still see everything through RLS
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000e02","role":"authenticated"}',true);
select is((select count(*)::int from public.moments where journey_id = 'e1000000-0000-4000-8000-000000000001'), 2, 'member sees all moments');
select is((select count(*)::int from public.media where journey_id = 'e1000000-0000-4000-8000-000000000001'), 6, 'member sees all media');
reset role;

select * from finish();
rollback;
