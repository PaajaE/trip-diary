begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select has_table('public', 'place_lookups', 'place lookup cache exists');
select has_column('public', 'places', 'source_ref', 'places carry a source reference');

select results_eq(
  $$ select public.claim_geocoder_slot() $$,
  $$ values (0) $$,
  'first slot is immediate'
);
-- Evaluate each claim once (BETWEEN would call the function twice).
select ok(wait_ms between 1000 and 1100, 'second slot waits about one interval')
from (select public.claim_geocoder_slot() as wait_ms) claim;
select ok(wait_ms between 2100 and 2200, 'third slot queues behind the second')
from (select public.claim_geocoder_slot() as wait_ms) claim;
select throws_ok(
  $$ select public.claim_geocoder_slot(500) $$,
  '22023', null, 'interval below one second is refused'
);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000091","role":"authenticated"}',true);
select throws_ok(
  $$ select public.claim_geocoder_slot() $$,
  '42501', null, 'signed-in users cannot claim geocoder slots'
);
select throws_ok(
  $$ select count(*) from public.place_lookups $$,
  '42501', null, 'signed-in users cannot read the lookup cache'
);

select * from finish();
rollback;
