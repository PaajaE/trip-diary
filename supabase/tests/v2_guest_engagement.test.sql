begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values
('00000000-0000-4000-8000-000000000a01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','eng-owner@example.test','',now(),'{}','{}',now(),now(),false),
('00000000-0000-4000-8000-000000000a02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','eng-guest@example.test','',now(),'{}','{}',now(),now(),true),
('00000000-0000-4000-8000-000000000a03','00000000-0000-0000-0000-000000000000','authenticated','authenticated','eng-guest2@example.test','',now(),'{}','{}',now(),now(),true),
('00000000-0000-4000-8000-000000000a04','00000000-0000-0000-0000-000000000000','authenticated','authenticated','eng-stranger@example.test','',now(),'{}','{}',now(),now(),false);

insert into public.journeys (id, creator_id, title, visibility, slug, home_tz) values
('e0000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000a01','Public','public','eng-public','Europe/Prague'),
('e0000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000a01','Private','private','eng-private','Europe/Prague');
insert into public.segments (id, journey_id, kind, title, starts_at, ends_at, created_by) values
('e1000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','stage','S','2026-05-01T00:00:00Z','2026-05-30T00:00:00Z','00000000-0000-4000-8000-000000000a01');
insert into public.moments (id, journey_id, starts_at, ends_at, published, created_by) values
('e2000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','2026-05-02T00:00:00Z','2026-05-02T01:00:00Z',true,'00000000-0000-4000-8000-000000000a01'),
('e2000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000001','2026-05-03T00:00:00Z','2026-05-03T01:00:00Z',false,'00000000-0000-4000-8000-000000000a01'),
('e2000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-000000000002','2026-05-03T00:00:00Z','2026-05-03T01:00:00Z',true,'00000000-0000-4000-8000-000000000a01');
insert into public.media (id, owner_id, journey_id, status, moment_id) values
('e3000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000a01','e0000000-0000-4000-8000-000000000001','ready','e2000000-0000-4000-8000-000000000001'),
('e3000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000a01','e0000000-0000-4000-8000-000000000001','pending',null),
('e3000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000a01','e0000000-0000-4000-8000-000000000001','ready','e2000000-0000-4000-8000-000000000002');

select is(public.is_interactable_target('moment','e2000000-0000-4000-8000-000000000001'), true, 'published moment in public journey is interactable');
select is(public.is_interactable_target('moment','e2000000-0000-4000-8000-000000000002'), false, 'unpublished moment is not');
select is(public.is_interactable_target('moment','e2000000-0000-4000-8000-000000000003'), false, 'moment in private journey is not');
select is(public.is_interactable_target('media','e3000000-0000-4000-8000-000000000001'), true, 'ready media is interactable');
select is(public.is_interactable_target('media','e3000000-0000-4000-8000-000000000002'), false, 'pending media is not');
select is(public.is_interactable_target('media','e3000000-0000-4000-8000-000000000003'), false, 'media in unpublished moment is not');
select is(public.is_interactable_target('segment','e1000000-0000-4000-8000-000000000001'), true, 'segment of public journey is interactable');

-- ------------------------------------------------------------ anon (no JWT)
set local role anon;
select throws_ok(
  $$ insert into public.content_hearts (target_type, target_id, user_id)
     values ('moment','e2000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000a02') $$,
  '42501', null, 'no-JWT anon cannot heart');
select throws_ok(
  $$ insert into public.content_comments (target_type, target_id, user_id, body, guest_name)
     values ('moment','e2000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000a02','x','X') $$,
  '42501', null, 'no-JWT anon cannot comment');
reset role;

-- ------------------------------------------------------------ guest
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000a02","role":"authenticated","is_anonymous":true}',true);

select lives_ok(
  $$ insert into public.content_hearts (target_type, target_id, user_id)
     values ('moment','e2000000-0000-4000-8000-000000000001', auth.uid()) $$,
  'guest hearts a public moment');
select throws_ok(
  $$ insert into public.content_hearts (target_type, target_id, user_id)
     values ('moment','e2000000-0000-4000-8000-000000000001', auth.uid()) $$,
  '23505', null, 'one heart per guest and target');
select throws_ok(
  $$ insert into public.content_hearts (target_type, target_id, user_id)
     values ('moment','e2000000-0000-4000-8000-000000000003', auth.uid()) $$,
  '42501', null, 'guest cannot heart a moment of a private journey');
select throws_ok(
  $$ insert into public.content_hearts (target_type, target_id, user_id)
     values ('moment','e2000000-0000-4000-8000-000000000002', auth.uid()) $$,
  '42501', null, 'guest cannot heart an unpublished moment');
select throws_ok(
  $$ insert into public.content_comments (target_type, target_id, user_id, body, guest_name, status)
     values ('moment','e2000000-0000-4000-8000-000000000001', auth.uid(), 'Krasa', 'Jana', 'approved') $$,
  '42501', null, 'guest cannot send a status (no column grant)');
select lives_ok(
  $$ insert into public.content_comments (target_type, target_id, user_id, body, guest_name)
     values ('moment','e2000000-0000-4000-8000-000000000001', auth.uid(), 'Krasa', '  Jana ') $$,
  'guest comments');
select set_config('test.cid', (select id::text from public.content_comments where body = 'Krasa'), true);
select throws_ok(
  $$ insert into public.content_comments (target_type, target_id, user_id, body, guest_name)
     values ('moment','e2000000-0000-4000-8000-000000000003', auth.uid(), 'x', 'Jana') $$,
  '42501', null, 'guest cannot comment on a private journey');
select throws_ok(
  $$ insert into public.content_comments (target_type, target_id, user_id, body, guest_name)
     values ('moment','e2000000-0000-4000-8000-000000000001', auth.uid(), 'x', '') $$,
  '23514', null, 'guest needs a name');
select throws_ok(
  $$ insert into public.content_comments (target_type, target_id, user_id, body, guest_name)
     values ('moment','e2000000-0000-4000-8000-000000000001', auth.uid(), repeat('a', 501), 'Jana') $$,
  '23514', null, 'guest comment length is capped');
select is(
  (select status::text || '/' || guest_name from public.content_comments where id = current_setting('test.cid')::uuid),
  'pending/Jana', 'guest comment is pending with trimmed name and visible to its author');
select throws_ok(
  $$ update public.content_comments set status = 'approved' where id = current_setting('test.cid')::uuid $$,
  '42501', null, 'guest cannot touch status');
select lives_ok(
  $$ update public.content_comments set body = 'edit' where id = current_setting('test.cid')::uuid $$,
  'guest update statement is filtered by RLS');
select is(
  (select body from public.content_comments where id = current_setting('test.cid')::uuid),
  'Krasa', 'guest cannot edit own comment');
select lives_ok(
  $$ insert into public.content_comments (target_type, target_id, user_id, body, guest_name)
     select 'moment','e2000000-0000-4000-8000-000000000001', auth.uid(), 'c' || g, 'Jana' from generate_series(1, 4) g $$,
  'guest reaches the hourly limit');
select throws_ok(
  $$ insert into public.content_comments (target_type, target_id, user_id, body, guest_name)
     values ('moment','e2000000-0000-4000-8000-000000000001', auth.uid(), 'too many', 'Jana') $$,
  '54000', null, 'sixth comment within an hour is rejected');
select lives_ok(
  $$ delete from public.content_hearts where user_id = auth.uid() $$, 'guest removes own heart');

-- ------------------------------------------------------------ other guest, anon
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000a03","role":"authenticated","is_anonymous":true}',true);
select is((select count(*)::int from public.content_comments), 0, 'other guest does not see pending comments');
set local role anon;
select set_config('request.jwt.claims','',true);
select is((select count(*)::int from public.content_comments), 0, 'anon does not see pending comments');
reset role;

-- ------------------------------------------------------------ moderation
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000a04","role":"authenticated"}',true);
select throws_ok(
  $$ select public.moderate_comment(current_setting('test.cid')::uuid,'approved') $$,
  '42501', null, 'non-moderator cannot approve');
select is((select count(*)::int from public.list_pending_comments('e0000000-0000-4000-8000-000000000001')), 0, 'non-moderator lists nothing');

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000a01","role":"authenticated"}',true);
select is((select count(*)::int from public.list_pending_comments('e0000000-0000-4000-8000-000000000001')), 5, 'owner lists pending comments');
select lives_ok($$ select public.moderate_comment(current_setting('test.cid')::uuid,'approved') $$, 'owner approves');
reset role;

-- ------------------------------------------------------------ public RPC
set local role anon;
select set_config('request.jwt.claims','',true);
select is((select count(*)::int from public.content_comments), 1, 'anon sees only the approved comment');
select is(
  (select body from public.content_comments), 'Krasa', 'anon reads the approved comment body through the table');
select is(
  (select public.get_public_engagement(s.handle, 'eng-public') #>> '{comments,0,name}'
   from public.spaces s where s.personal_owner_id = '00000000-0000-4000-8000-000000000a01'),
  'Jana', 'RPC returns the approved comment');
select is(
  (select jsonb_array_length(public.get_public_engagement(s.handle, 'eng-public') -> 'comments')
   from public.spaces s where s.personal_owner_id = '00000000-0000-4000-8000-000000000a01'),
  1, 'RPC hides pending comments');
select ok(
  (select public.get_public_engagement(s.handle, 'eng-public')::text !~ '(user|moderated|a02|eng-guest)'
   from public.spaces s where s.personal_owner_id = '00000000-0000-4000-8000-000000000a01'),
  'RPC leaks no user ids or emails');
select is(
  (select public.get_public_engagement(s.handle, 'eng-private') is null
   from public.spaces s where s.personal_owner_id = '00000000-0000-4000-8000-000000000a01'),
  true, 'RPC returns null for private journeys');
reset role;

select * from finish();
rollback;
