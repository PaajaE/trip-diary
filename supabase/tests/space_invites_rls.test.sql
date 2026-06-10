begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

select has_table('public', 'space_invites', 'space invites table exists');
select is(
  has_table_privilege('authenticated', 'public.space_invites', 'SELECT'),
  false,
  'authenticated users cannot read invite rows directly'
);
select is(
  has_table_privilege('authenticated', 'public.space_invites', 'INSERT'),
  false,
  'authenticated users cannot insert invite rows directly'
);
select is(
  has_table_privilege('authenticated', 'public.space_invites', 'UPDATE'),
  false,
  'authenticated users cannot update invite rows directly'
);
select is(
  has_table_privilege('authenticated', 'public.space_invites', 'DELETE'),
  false,
  'authenticated users cannot delete invite rows directly'
);
select is(
  has_function_privilege('anon', 'public.create_space_invite(uuid,text,public.space_role)', 'EXECUTE'),
  false,
  'anonymous users cannot create invites'
);
select is(
  has_function_privilege('authenticated', 'public.create_space_invite(uuid,text,public.space_role)', 'EXECUTE'),
  true,
  'authenticated users can call invite RPC'
);
select is(
  has_function_privilege('anon', 'public.get_space_invite_preview(text)', 'EXECUTE'),
  true,
  'anonymous users can preview an invite'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-4000-8000-000000000071','00000000-0000-0000-0000-000000000000','authenticated','authenticated','space-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000072','00000000-0000-0000-0000-000000000000','authenticated','authenticated','invited@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000073','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stranger@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-4000-8000-000000000074','00000000-0000-0000-0000-000000000000','authenticated','authenticated','second-owner@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

insert into public.spaces (id, kind, handle, name, created_by)
values (
  '70000000-0000-4000-8000-000000000001',
  'family',
  'invite-test-family',
  'Invite Test Family',
  '00000000-0000-4000-8000-000000000071'
);
insert into public.space_members (space_id, user_id, role)
values (
  '70000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000071',
  'owner'
);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000071","role":"authenticated"}',true);

create temporary table invite_tokens (label text primary key, token text not null);
create temporary table invite_ids (label text primary key, id uuid not null);
grant select on invite_tokens to anon;
insert into invite_tokens
select 'accepted', public.create_space_invite(
  '70000000-0000-4000-8000-000000000001',
  ' Invited@Example.Test ',
  'editor'
);

select is(
  (select length(token) from invite_tokens where label = 'accepted'),
  64,
  'create invite returns a strong raw token'
);
reset role;
set local role anon;
select results_eq(
  $$ select space_handle, space_name
     from public.get_space_invite_preview(
       (select token from invite_tokens where label = 'accepted')
     ) $$,
  $$ values ('invite-test-family'::text, 'Invite Test Family'::text) $$,
  'invite preview exposes only public space identity'
);
select is_empty(
  $$ select * from public.get_space_invite_preview('invalid') $$,
  'invalid token has no preview'
);
reset role;
select is(
  (
    select encode(token_hash, 'hex') <> token
    from public.space_invites, invite_tokens
    where label = 'accepted' and email_normalized = 'invited@example.test'
  ),
  true,
  'only a hash of the raw token is persisted'
);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000071","role":"authenticated"}',true);
select throws_ok(
  $$ select public.create_space_invite(
       '70000000-0000-4000-8000-000000000001',
       'invited@example.test',
       'owner'
     ) $$,
  '22023', 'invites cannot grant owner role', 'invite cannot grant owner'
);

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000073","role":"authenticated"}',true);
select throws_ok(
  $$ select public.create_space_invite(
       '70000000-0000-4000-8000-000000000001',
       'stranger@example.test',
       'member'
     ) $$,
  '42501', 'space owner required', 'non-owner cannot create invite'
);
select throws_ok(
  $$ select public.accept_space_invite((select token from invite_tokens where label = 'accepted')) $$,
  '42501', 'invite belongs to another email', 'invite acceptance is email-bound'
);

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000072","role":"authenticated"}',true);
select lives_ok(
  $$ select public.accept_space_invite((select token from invite_tokens where label = 'accepted')) $$,
  'matching user accepts invite'
);
select results_eq(
  $$ select role from public.space_members
     where space_id = '70000000-0000-4000-8000-000000000001'
       and user_id = auth.uid() $$,
  $$ values ('editor'::public.space_role) $$,
  'accepted invite creates requested membership'
);
select throws_ok(
  $$ select public.accept_space_invite((select token from invite_tokens where label = 'accepted')) $$,
  '22023', 'invalid or expired invite', 'invite token is one-time'
);
reset role;
set local role anon;
select is_empty(
  $$ select * from public.get_space_invite_preview(
       (select token from invite_tokens where label = 'accepted')
     ) $$,
  'accepted invite no longer has a preview'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000071","role":"authenticated"}',true);
insert into invite_tokens
select 'revoked', public.create_space_invite(
  '70000000-0000-4000-8000-000000000001',
  'stranger@example.test',
  'member'
);
reset role;
insert into invite_ids
select 'revoked', id
from public.space_invites
where email_normalized = 'stranger@example.test';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000071","role":"authenticated"}',true);
select lives_ok(
  $$ select public.revoke_space_invite((select id from invite_ids where label = 'revoked')) $$,
  'owner revokes pending invite'
);

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000073","role":"authenticated"}',true);
select throws_ok(
  $$ select public.accept_space_invite((select token from invite_tokens where label = 'revoked')) $$,
  '22023', 'invalid or expired invite', 'revoked invite cannot be accepted'
);

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000071","role":"authenticated"}',true);
insert into invite_tokens
select 'expired', public.create_space_invite(
  '70000000-0000-4000-8000-000000000001',
  'stranger@example.test',
  'member'
);
reset role;
update public.space_invites
set created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
where token_hash = extensions.digest(
  (select token from invite_tokens where label = 'expired'),
  'sha256'
);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000073","role":"authenticated"}',true);
select throws_ok(
  $$ select public.accept_space_invite((select token from invite_tokens where label = 'expired')) $$,
  '22023', 'invalid or expired invite', 'expired invite cannot be accepted'
);
select throws_ok(
  $$ select public.change_space_member_role(
       '70000000-0000-4000-8000-000000000001',
       '00000000-0000-4000-8000-000000000072',
       'member'
     ) $$,
  '42501', 'space owner required', 'non-owner cannot change roles'
);

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000071","role":"authenticated"}',true);
select throws_ok(
  $$ select public.change_space_member_role(
       '70000000-0000-4000-8000-000000000001',
       '00000000-0000-4000-8000-000000000071',
       'member'
     ) $$,
  '22023', 'space must keep at least one owner', 'last owner cannot be demoted'
);
select throws_ok(
  $$ select public.remove_space_member(
       '70000000-0000-4000-8000-000000000001',
       '00000000-0000-4000-8000-000000000071'
     ) $$,
  '22023', 'space must keep at least one owner', 'last owner cannot be removed'
);
select throws_ok(
  $$ select public.leave_space('70000000-0000-4000-8000-000000000001') $$,
  '22023', 'space must keep at least one owner', 'last owner cannot leave'
);
select lives_ok(
  $$ select public.change_space_member_role(
       '70000000-0000-4000-8000-000000000001',
       '00000000-0000-4000-8000-000000000072',
       'owner'
     ) $$,
  'owner can promote another member'
);
select lives_ok(
  $$ select public.change_space_member_role(
       '70000000-0000-4000-8000-000000000001',
       '00000000-0000-4000-8000-000000000071',
       'member'
     ) $$,
  'owner can demote self after another owner exists'
);

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000071","role":"authenticated"}',true);
select lives_ok(
  $$ select public.leave_space('70000000-0000-4000-8000-000000000001') $$,
  'non-owner member can leave'
);
select results_eq(
  $$ select count(*)::bigint from public.space_members
     where space_id = '70000000-0000-4000-8000-000000000001'
       and user_id = auth.uid() $$,
  $$ values (0::bigint) $$,
  'leave removes membership'
);

reset role;
select * from finish();
rollback;
