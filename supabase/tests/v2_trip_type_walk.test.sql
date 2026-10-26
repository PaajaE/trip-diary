begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

-- A new enum label cannot be used in the transaction that adds it, so only the
-- catalog is asserted here.
select enum_has_labels('public', 'trip_type', array['trek', 'day', 'transfer', 'stay', 'walk'], 'trip_type has the walk label');

select * from finish();
rollback;
