begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000e01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ma-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000e02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ma-editor@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000e03','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ma-member@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000e04','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ma-stranger@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

-- owner e01, editor e02, member (read-only) e03, stranger e04
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000e01","role":"authenticated"}',true);
insert into public.journeys (id, creator_id, title, visibility, slug)
  values ('b1000000-0000-4000-8000-000000000001', auth.uid(), 'Analysis', 'public', 'ma-pub');
insert into public.journey_members (journey_id, user_id, role) values
('b1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000e02','editor'),
('b1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000e03','member');

-- owner writes analysis at import
select lives_ok($$ insert into public.media (id, owner_id, journey_id, kind, status, captured_at, phash, quality)
  values ('b1300000-0000-4000-8000-000000000001', auth.uid(), 'b1000000-0000-4000-8000-000000000001','photo','ready','2026-06-01T10:00:00Z',
  -9223372036854775808, '{"v":1,"sharp":0.8,"exposure":0.5}') $$, 'owner inserts phash and quality');
select is((select phash from public.media where id = 'b1300000-0000-4000-8000-000000000001'), '-9223372036854775808'::bigint, 'phash keeps the full signed 64-bit range');

-- shape checks
select throws_ok($$ update public.media set quality = '[1]'::jsonb where id = 'b1300000-0000-4000-8000-000000000001' $$, '23514', null, 'quality must not be an array');
select throws_ok($$ update public.media set quality = '"x"'::jsonb where id = 'b1300000-0000-4000-8000-000000000001' $$, '23514', null, 'quality must not be a scalar');
select throws_ok($$ update public.media set quality = jsonb_build_object('v', 1, 'blob', (select string_agg(md5(i::text), '') from generate_series(1, 100) i)) where id = 'b1300000-0000-4000-8000-000000000001' $$, '23514', null, 'quality over 2 kB rejected');

-- no default, no backfill
select lives_ok($$ insert into public.media (id, owner_id, journey_id, kind, status, captured_at)
  values ('b1300000-0000-4000-8000-000000000002', auth.uid(), 'b1000000-0000-4000-8000-000000000001','photo','ready','2026-06-01T11:00:00Z') $$, 'insert without analysis');
select is((select count(*)::int from public.media where phash is null and quality is null), 1, 'columns stay NULL when not provided');

-- editor can update (RLS: journey editor)
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000e02","role":"authenticated"}',true);
select lives_ok($$ update public.media set phash = 7 where id = 'b1300000-0000-4000-8000-000000000002' $$, 'editor updates phash');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000e01","role":"authenticated"}',true);
select is((select phash from public.media where id = 'b1300000-0000-4000-8000-000000000002'), 7::bigint, 'editor write is stored');

-- read-only member and stranger change nothing
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000e03","role":"authenticated"}',true);
update public.media set phash = 99 where id = 'b1300000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000e04","role":"authenticated"}',true);
update public.media set phash = 98 where id = 'b1300000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000e01","role":"authenticated"}',true);
select is((select phash from public.media where id = 'b1300000-0000-4000-8000-000000000002'), 7::bigint, 'member and stranger updates affect no row');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000e04","role":"authenticated"}',true);
select throws_ok($$ insert into public.media (owner_id, journey_id, kind, status, phash)
  values (auth.uid(), 'b1000000-0000-4000-8000-000000000001','photo','ready', 1) $$, '42501', null, 'stranger cannot insert into the journey');

-- anon
reset role;
set local role anon;
select throws_ok($$ update public.media set phash = 1 $$, '42501', null, 'anon cannot write media');

-- public read model does not expose the columns
select ok(
  public.get_public_journey((select handle from public.spaces s join public.journeys j on j.space_id = s.id where j.slug = 'ma-pub'), 'ma-pub')::text !~ 'phash|quality'
  and public.get_public_journey((select handle from public.spaces s join public.journeys j on j.space_id = s.id where j.slug = 'ma-pub'), 'ma-pub') is not null,
  'get_public_journey exposes neither phash nor quality');
reset role;

select * from finish();
rollback;
