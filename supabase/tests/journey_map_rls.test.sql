begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select has_column('public', 'journey_stops', 'map_latitude', 'stops have public map latitude');
select has_column('public', 'journey_stops', 'map_longitude', 'stops have public map longitude');
select is(has_column_privilege('anon','public.journey_stops','map_latitude','SELECT'), true, 'anonymous readers can map public points');
select is(has_column_privilege('anon','public.journey_stops','latitude','SELECT'), false, 'anonymous readers cannot access precise points');

select * from finish();
rollback;
