begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-0000000000c1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','se-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-0000000000c2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','se-editor@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-0000000000c3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','se-member@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-0000000000c4','00000000-0000-0000-0000-000000000000','authenticated','authenticated','se-stranger@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

-- places are not writable by clients; created here as the test superuser
insert into public.places (id, name, latitude, longitude, geocode_source) values
('c1100000-0000-4000-8000-000000000001', 'Ježero Krn', 46.2, 13.7, 'test'),
('c1100000-0000-4000-8000-000000000002', 'Bled', 46.4, 14.1, 'test');

-- the normalisation wrapper itself
select is(public.search_normalize('Ježero ŽLUŤOUČKÝ Příliš'), 'jezero zlutoucky prilis', 'search_normalize lower-cases and strips accents');

-- owner c1, editor c2, member (read-only) c3, stranger c4
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}',true);
-- Pacific/Auckland is UTC+12 in June: 13:00Z on 06-01 is 01:00 on 06-02 locally
insert into public.journeys (id, creator_id, title, visibility, home_tz)
  values ('c1000000-0000-4000-8000-000000000001', auth.uid(), 'Search', 'private', 'Pacific/Auckland');
insert into public.journey_members (journey_id, user_id, role) values
('c1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000c2','editor'),
('c1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000c3','member');
insert into public.moments (id, journey_id, starts_at, ends_at, title, body, place_id, published, created_by) values
('c1200000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','2026-06-01T13:00:00Z','2026-06-01T14:00:00Z','Jezero Bohinj','Krásný den u jezera.', null, true, auth.uid()),
('c1200000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001','2026-06-03T10:00:00Z','2026-06-03T11:00:00Z',null,'Oběd v horách','c1100000-0000-4000-8000-000000000001', false, auth.uid()),
('c1200000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000001','2026-06-03T11:00:00Z','2026-06-03T12:00:00Z','Procházka','Doma 100%_real text', null, true, auth.uid()),
('c1200000-0000-4000-8000-000000000004','c1000000-0000-4000-8000-000000000001','2026-06-03T12:00:00Z','2026-06-03T13:00:00Z','Neutral','Nothing relevant','c1100000-0000-4000-8000-000000000002', true, auth.uid()),
('c1200000-0000-4000-8000-000000000005','c1000000-0000-4000-8000-000000000001','2026-06-04T10:00:00Z','2026-06-04T11:00:00Z',null,repeat(E'a\n', 200) || 'needle' || repeat(E'  b', 200), null, true, auth.uid());
insert into public.day_notes (journey_id, local_date, body) values
('c1000000-0000-4000-8000-000000000001','2026-06-02','Jezero ráno mlha'),
('c1000000-0000-4000-8000-000000000001','2026-06-03','Nic zvláštního');
insert into public.media (id, owner_id, journey_id, kind, status, captured_at, caption) values
('c1300000-0000-4000-8000-000000000001', auth.uid(), 'c1000000-0000-4000-8000-000000000001','photo','ready','2026-06-01T13:30:00Z','Jezero při západu slunce'),
('c1300000-0000-4000-8000-000000000002', auth.uid(), 'c1000000-0000-4000-8000-000000000001','photo','ready','2026-06-01T14:00:00Z','Jezero smazané'),
('c1300000-0000-4000-8000-000000000003', auth.uid(), 'c1000000-0000-4000-8000-000000000001','photo','pending','2026-06-01T14:30:00Z','Jezero čeká'),
('c1300000-0000-4000-8000-000000000004', auth.uid(), 'c1000000-0000-4000-8000-000000000001','photo','ready',null,'Pohled na jezero');
select public.trash_media(array['c1300000-0000-4000-8000-000000000002']::uuid[]);
insert into public.media (id, owner_id, journey_id, kind, status, caption)
select ('c1400000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, auth.uid(), 'c1000000-0000-4000-8000-000000000001','photo','ready','Cap test'
  from generate_series(1, 60) i;

-- matching, ordering, local dates
select is((select array_agg(t.kind order by t.ord) from public.search_journey('c1000000-0000-4000-8000-000000000001', 'jezero') with ordinality as t(kind, id, local_date, title, snippet, ord)), array['moment','moment','day','media','media'], 'jezero: title, place name (accent form), day note and captions; ordered moment, day, media');
select is((select array_agg(t.local_date order by t.ord) from public.search_journey('c1000000-0000-4000-8000-000000000001', 'jezero') with ordinality as t(kind, id, local_date, title, snippet, ord)), array['2026-06-02','2026-06-03','2026-06-02','2026-06-02',null]::date[], 'local dates in home_tz (moment at 13:00Z is the next local day); undated media last');
select is((select count(*)::int from public.search_journey('c1000000-0000-4000-8000-000000000001', 'JEŽERO')), 5, 'case- and accent-insensitive query');
select is((select count(*)::int from public.search_journey('c1000000-0000-4000-8000-000000000001', 'ezer')), 5, 'substring match');
select is((select count(*)::int from public.search_journey('c1000000-0000-4000-8000-000000000001', '  jezero  ')), 5, 'query is trimmed');
select is((select local_date from public.search_journey('c1000000-0000-4000-8000-000000000001', 'jezero') where id = 'c1200000-0000-4000-8000-000000000001'), '2026-06-02'::date, 'moment day uses home_tz, not the UTC date');
select is((select title from public.search_journey('c1000000-0000-4000-8000-000000000001', 'jezero') where id = 'c1200000-0000-4000-8000-000000000002'), 'Ježero Krn', 'moment without title shows the place name');
select is((select snippet from public.search_journey('c1000000-0000-4000-8000-000000000001', 'jezero') where id = 'c1200000-0000-4000-8000-000000000002'), 'Ježero Krn', 'place name match: snippet is the place name');
select is((select count(*)::int from public.search_journey('c1000000-0000-4000-8000-000000000001', 'jezero') where id = 'c1200000-0000-4000-8000-000000000002'), 1, 'unpublished moment is returned to members');
select is((select array_agg(id order by id) from public.search_journey('c1000000-0000-4000-8000-000000000001', 'jezero') where kind = 'media'), array['c1300000-0000-4000-8000-000000000001','c1300000-0000-4000-8000-000000000004']::uuid[], 'captions: only ready, non-trashed media');
select is((select count(*)::int from public.search_journey('c1000000-0000-4000-8000-000000000001', 'jezero') where kind = 'day' and title is null and local_date = '2026-06-02'), 1, 'day note row has no title and its own local date');
select is((select id from public.search_journey('c1000000-0000-4000-8000-000000000001', 'krasny')), 'c1200000-0000-4000-8000-000000000001'::uuid, 'body match without diacritics');
select ok((select snippet like '%Krásný%' from public.search_journey('c1000000-0000-4000-8000-000000000001', 'krasny')), 'snippet keeps the original text');
select is((select id from public.search_journey('c1000000-0000-4000-8000-000000000001', 'OBED V HORACH')), 'c1200000-0000-4000-8000-000000000002'::uuid, 'multi-word accent-insensitive body match');
select is((select snippet from public.search_journey('c1000000-0000-4000-8000-000000000001', 'obed')), 'Oběd v horách', 'body match: snippet comes from the body');
-- LIKE metacharacters are literal
select is((select array_agg(id) from public.search_journey('c1000000-0000-4000-8000-000000000001', '0%')), array['c1200000-0000-4000-8000-000000000003']::uuid[], 'percent in the query is literal');
select is((select array_agg(id) from public.search_journey('c1000000-0000-4000-8000-000000000001', '%_')), array['c1200000-0000-4000-8000-000000000003']::uuid[], 'percent and underscore together are literal');
select is((select count(*)::int from public.search_journey('c1000000-0000-4000-8000-000000000001', 'j_zero')), 0, 'underscore is not a single-character wildcard');
select is((select count(*)::int from public.search_journey('c1000000-0000-4000-8000-000000000001', 'e%l')), 0, 'percent is not a multi-character wildcard');
select is((select count(*)::int from public.search_journey('c1000000-0000-4000-8000-000000000001', 'l\')), 0, 'backslash is literal and does not break the pattern');
-- snippet
select ok((select length(snippet) <= 140 from public.search_journey('c1000000-0000-4000-8000-000000000001', 'needle')), 'snippet is at most about 140 characters');
select ok((select snippet like '%needle%' from public.search_journey('c1000000-0000-4000-8000-000000000001', 'needle')), 'snippet contains the match');
select ok((select snippet !~ '\s\s' and snippet !~ E'\n' from public.search_journey('c1000000-0000-4000-8000-000000000001', 'needle')), 'snippet has collapsed whitespace');
select ok((select snippet like '…%needle%…' from public.search_journey('c1000000-0000-4000-8000-000000000001', 'needle')), 'snippet marks both cut ends');
-- limit
select is((select count(*)::int from public.search_journey('c1000000-0000-4000-8000-000000000001', 'jezero', 2)), 2, 'limit 2');
select is((select count(*)::int from public.search_journey('c1000000-0000-4000-8000-000000000001', 'jezero', 0)), 1, 'limit 0 is clamped to 1');
select is((select count(*)::int from public.search_journey('c1000000-0000-4000-8000-000000000001', 'jezero', -5)), 1, 'negative limit is clamped to 1');
select is((select count(*)::int from public.search_journey('c1000000-0000-4000-8000-000000000001', 'jezero', null)), 5, 'null limit uses the default');
select is((select count(*)::int from public.search_journey('c1000000-0000-4000-8000-000000000001', 'cap test', null)), 30, 'null limit is 30');
select is((select count(*)::int from public.search_journey('c1000000-0000-4000-8000-000000000001', 'cap test')), 30, 'default limit is 30');
select is((select count(*)::int from public.search_journey('c1000000-0000-4000-8000-000000000001', 'cap test', 1000)), 50, 'limit is capped at 50');
-- query length
select throws_ok($$ select * from public.search_journey('c1000000-0000-4000-8000-000000000001', '') $$, '22023', null, 'empty query rejected');
select throws_ok($$ select * from public.search_journey('c1000000-0000-4000-8000-000000000001', 'a') $$, '22023', null, 'one character rejected');
select throws_ok($$ select * from public.search_journey('c1000000-0000-4000-8000-000000000001', '  a  ') $$, '22023', null, 'one character after trim rejected');
select throws_ok($$ select * from public.search_journey('c1000000-0000-4000-8000-000000000001', null) $$, '22023', null, 'null query rejected');
select throws_ok($$ select * from public.search_journey('c1000000-0000-4000-8000-000000000001', repeat('a', 101)) $$, '22023', null, '101 characters rejected');
select lives_ok($$ select * from public.search_journey('c1000000-0000-4000-8000-000000000001', repeat('a', 100)) $$, '100 characters accepted');
select lives_ok($$ select * from public.search_journey('c1000000-0000-4000-8000-000000000001', 'ab') $$, 'two characters accepted');
-- roles
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000c2","role":"authenticated"}',true);
select is((select count(*)::int from public.search_journey('c1000000-0000-4000-8000-000000000001', 'jezero')), 5, 'editor can search');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}',true);
select is((select count(*)::int from public.search_journey('c1000000-0000-4000-8000-000000000001', 'jezero')), 5, 'read-only member can search');
select throws_ok($$ select public.search_normalize('x') $$, '42501', null, 'helper search_normalize is not callable by clients');
select throws_ok($$ select public.search_snippet('x', 'x') $$, '42501', null, 'helper search_snippet is not callable by clients');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000c4","role":"authenticated"}',true);
select is((select count(*)::int from public.search_journey('c1000000-0000-4000-8000-000000000001', 'jezero')), 0, 'stranger gets zero rows, no error');
select is((select count(*)::int from public.search_journey('c1000000-0000-4000-8000-0000000000ff', 'jezero')), 0, 'unknown journey returns zero rows');
select is((select count(*)::int from public.search_journey(null, 'jezero')), 0, 'null journey returns zero rows');
reset role;
set local role anon;
select throws_ok($$ select * from public.search_journey('c1000000-0000-4000-8000-000000000001', 'jezero') $$, '42501', null, 'anon cannot execute');
reset role;

select * from finish();
rollback;
