begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

select has_table('public', 'journey_invites', 'journey invites table exists');
select is(
  has_table_privilege('authenticated', 'public.journey_invites', 'SELECT'),
  false,
  'authenticated users cannot read journey invite rows directly'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.create_journey_invite(uuid,text,public.journey_member_role)',
    'EXECUTE'
  ),
  true,
  'authenticated users can create journey invites'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.list_journey_pending_invites(uuid)',
    'EXECUTE'
  ),
  true,
  'authenticated users can list pending journey invites'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.revoke_journey_invite(uuid)',
    'EXECUTE'
  ),
  true,
  'authenticated users can revoke journey invites'
);
select is(
  has_function_privilege('anon', 'public.get_journey_invite_preview(text)', 'EXECUTE'),
  true,
  'anonymous users can preview a journey invite'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000081','00000000-0000-0000-0000-000000000000','authenticated','authenticated','journey-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000082','00000000-0000-0000-0000-000000000000','authenticated','authenticated','journey-invited@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

insert into public.journeys (
  id, creator_id, title, summary, visibility, status
) values (
  '50000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000081',
  'Journey Invite Test',
  'Fixture journey for invite acceptance',
  'public',
  'planning'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000081","role":"authenticated"}',
  true
);

create temporary table journey_invite_tokens (token text not null);
create temporary table accept_invite_token (token text not null);
grant select on journey_invite_tokens to anon;
grant select on accept_invite_token to anon;
insert into journey_invite_tokens
select public.create_journey_invite(
  '50000000-0000-4000-8000-000000000010',
  ' Journey-Invited@Example.Test ',
  'editor'
);

select is(
  (select length(token) from journey_invite_tokens),
  64,
  'journey invite token has expected length'
);

create temporary table journey_invite_ids (invite_id uuid not null);
insert into journey_invite_ids
select id
from public.list_journey_pending_invites('50000000-0000-4000-8000-000000000010');

select is(
  (select count(*)::int from journey_invite_ids),
  1,
  'journey owner can list a pending invite'
);

select results_eq(
  $$ select email_normalized from public.list_journey_pending_invites(
       '50000000-0000-4000-8000-000000000010'
     ) $$,
  $$ values ('journey-invited@example.test') $$,
  'pending invite list returns normalized email'
);

select lives_ok(
  $$ select public.revoke_journey_invite(
       (select invite_id from journey_invite_ids)
     ) $$,
  'journey owner can revoke a pending invite'
);

select is(
  (
    select count(*)::int
    from public.list_journey_pending_invites('50000000-0000-4000-8000-000000000010')
  ),
  0,
  'revoked invite no longer appears in pending list'
);

insert into accept_invite_token
select public.create_journey_invite(
  '50000000-0000-4000-8000-000000000010',
  'journey-invited@example.test',
  'editor'
);

set local role anon;
select is(
  (
    select journey_title
    from public.get_journey_invite_preview((select token from accept_invite_token))
  ),
  'Journey Invite Test',
  'anonymous users can preview a valid journey invite'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000082","role":"authenticated"}',
  true
);

select is(
  public.accept_journey_invite((select token from accept_invite_token)),
  '50000000-0000-4000-8000-000000000010'::uuid,
  'invited user can accept a journey invite'
);

select results_eq(
  $$ select role::text from public.journey_members
     where journey_id = '50000000-0000-4000-8000-000000000010'
       and user_id = '00000000-0000-4000-8000-000000000082' $$,
  $$ values ('editor') $$,
  'accepted invite grants the invited journey role'
);

select throws_ok(
  $$ select public.accept_journey_invite((select token from accept_invite_token)) $$,
  '22023',
  'invalid or expired invite',
  'accepted journey invite cannot be reused'
);

select finish();
rollback;
