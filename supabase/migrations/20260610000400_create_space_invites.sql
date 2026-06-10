create or replace function public.is_space_owner(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.space_members
    where space_id = p_space_id
      and user_id = auth.uid()
      and role = 'owner'::public.space_role
  )
$$;

revoke all on function public.is_space_owner(uuid) from public, anon, authenticated;
grant execute on function public.is_space_owner(uuid) to authenticated;

create table public.space_invites (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  email_normalized text not null,
  token_hash bytea not null unique,
  role public.space_role not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),

  constraint space_invites_email_normalized check (
    email_normalized = lower(btrim(email_normalized))
    and email_normalized ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint space_invites_role_not_owner check (role <> 'owner'::public.space_role),
  constraint space_invites_expiry_after_creation check (expires_at > created_at),
  constraint space_invites_acceptance_consistent check (
    (accepted_at is null and accepted_by is null)
    or (accepted_at is not null and accepted_by is not null)
  ),
  constraint space_invites_not_accepted_and_revoked check (
    accepted_at is null or revoked_at is null
  )
);

create unique index space_invites_one_pending_email_idx
on public.space_invites (space_id, email_normalized)
where accepted_at is null and revoked_at is null;

create index space_invites_space_idx on public.space_invites (space_id);

alter table public.space_invites enable row level security;

revoke all on table public.space_invites from public, anon, authenticated;

create or replace function public.get_space_invite_preview(p_raw_token text)
returns table (
  space_id uuid,
  space_handle text,
  space_name text,
  space_avatar_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    spaces.id,
    spaces.handle,
    spaces.name,
    spaces.avatar_url
  from public.space_invites
  join public.spaces on spaces.id = space_invites.space_id
  where length(p_raw_token) = 64
    and space_invites.token_hash = extensions.digest(p_raw_token, 'sha256')
    and space_invites.accepted_at is null
    and space_invites.revoked_at is null
    and space_invites.expires_at > now()
$$;

create or replace function public.create_space_invite(
  p_space_id uuid,
  p_email text,
  p_role public.space_role default 'member'::public.space_role
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_raw_token text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  perform 1 from public.spaces where id = p_space_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'space not found';
  end if;
  if not public.is_space_owner(p_space_id) then
    raise exception using errcode = '42501', message = 'space owner required';
  end if;
  if p_role = 'owner'::public.space_role then
    raise exception using errcode = '22023', message = 'invites cannot grant owner role';
  end if;
  if v_email is null
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception using errcode = '22023', message = 'valid invite email required';
  end if;

  update public.space_invites
  set revoked_at = now()
  where space_id = p_space_id
    and email_normalized = v_email
    and accepted_at is null
    and revoked_at is null;

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.space_invites (
    space_id,
    created_by,
    email_normalized,
    token_hash,
    role,
    expires_at
  )
  values (
    p_space_id,
    auth.uid(),
    v_email,
    extensions.digest(v_raw_token, 'sha256'),
    p_role,
    now() + interval '7 days'
  );

  return v_raw_token;
end
$$;

create or replace function public.accept_space_invite(p_raw_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.space_invites%rowtype;
  v_email text;
  v_space_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_raw_token is null or length(p_raw_token) <> 64 then
    raise exception using errcode = '22023', message = 'invalid invite token';
  end if;

  select lower(btrim(email))
  into v_email
  from auth.users
  where id = auth.uid();

  select space_id
  into v_space_id
  from public.space_invites
  where token_hash = extensions.digest(p_raw_token, 'sha256');

  if not found then
    raise exception using errcode = '22023', message = 'invalid or expired invite';
  end if;

  perform 1 from public.spaces where id = v_space_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'invalid or expired invite';
  end if;

  select *
  into v_invite
  from public.space_invites
  where token_hash = extensions.digest(p_raw_token, 'sha256')
    and space_id = v_space_id
  for update;

  if not found
    or v_invite.accepted_at is not null
    or v_invite.revoked_at is not null
    or v_invite.expires_at <= now()
  then
    raise exception using errcode = '22023', message = 'invalid or expired invite';
  end if;
  if v_email is null or v_email <> v_invite.email_normalized then
    raise exception using errcode = '42501', message = 'invite belongs to another email';
  end if;

  insert into public.space_members (space_id, user_id, role)
  values (v_invite.space_id, auth.uid(), v_invite.role)
  on conflict (space_id, user_id) do nothing;

  update public.space_invites
  set accepted_at = now(), accepted_by = auth.uid()
  where id = v_invite.id;

  return v_invite.space_id;
end
$$;

create or replace function public.revoke_space_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.space_invites%rowtype;
  v_space_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select space_id
  into v_space_id
  from public.space_invites
  where id = p_invite_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'invite not found';
  end if;

  perform 1 from public.spaces where id = v_space_id for update;
  if not public.is_space_owner(v_space_id) then
    raise exception using errcode = '42501', message = 'space owner required';
  end if;

  select *
  into v_invite
  from public.space_invites
  where id = p_invite_id and space_id = v_space_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'invite not found';
  end if;
  if v_invite.accepted_at is not null then
    raise exception using errcode = '22023', message = 'accepted invite cannot be revoked';
  end if;

  update public.space_invites set revoked_at = now() where id = p_invite_id;
end
$$;

create or replace function public.change_space_member_role(
  p_space_id uuid,
  p_user_id uuid,
  p_role public.space_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_role public.space_role;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  perform 1 from public.spaces where id = p_space_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'space not found';
  end if;
  if not public.is_space_owner(p_space_id) then
    raise exception using errcode = '42501', message = 'space owner required';
  end if;

  select role into v_current_role
  from public.space_members
  where space_id = p_space_id and user_id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'space member not found';
  end if;

  if v_current_role = 'owner'::public.space_role
    and p_role <> 'owner'::public.space_role
    and not exists (
      select 1 from public.space_members
      where space_id = p_space_id
        and role = 'owner'::public.space_role
        and user_id <> p_user_id
    )
  then
    raise exception using errcode = '22023', message = 'space must keep at least one owner';
  end if;

  update public.space_members
  set role = p_role
  where space_id = p_space_id and user_id = p_user_id;
end
$$;

create or replace function public.remove_space_member(p_space_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.space_role;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  perform 1 from public.spaces where id = p_space_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'space not found';
  end if;
  if not public.is_space_owner(p_space_id) then
    raise exception using errcode = '42501', message = 'space owner required';
  end if;

  select role into v_role
  from public.space_members
  where space_id = p_space_id and user_id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'space member not found';
  end if;

  if v_role = 'owner'::public.space_role
    and not exists (
      select 1 from public.space_members
      where space_id = p_space_id
        and role = 'owner'::public.space_role
        and user_id <> p_user_id
    )
  then
    raise exception using errcode = '22023', message = 'space must keep at least one owner';
  end if;

  delete from public.space_members
  where space_id = p_space_id and user_id = p_user_id;
end
$$;

create or replace function public.leave_space(p_space_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.space_role;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  perform 1 from public.spaces where id = p_space_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'space not found';
  end if;

  select role into v_role
  from public.space_members
  where space_id = p_space_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'space membership not found';
  end if;

  if v_role = 'owner'::public.space_role
    and not exists (
      select 1 from public.space_members
      where space_id = p_space_id
        and role = 'owner'::public.space_role
        and user_id <> auth.uid()
    )
  then
    raise exception using errcode = '22023', message = 'space must keep at least one owner';
  end if;

  delete from public.space_members
  where space_id = p_space_id and user_id = auth.uid();
end
$$;

revoke all on function public.create_space_invite(uuid, text, public.space_role) from public, anon, authenticated;
revoke all on function public.get_space_invite_preview(text) from public, anon, authenticated;
revoke all on function public.accept_space_invite(text) from public, anon, authenticated;
revoke all on function public.revoke_space_invite(uuid) from public, anon, authenticated;
revoke all on function public.change_space_member_role(uuid, uuid, public.space_role) from public, anon, authenticated;
revoke all on function public.remove_space_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.leave_space(uuid) from public, anon, authenticated;

grant execute on function public.create_space_invite(uuid, text, public.space_role) to authenticated;
grant execute on function public.get_space_invite_preview(text) to anon, authenticated;
grant execute on function public.accept_space_invite(text) to authenticated;
grant execute on function public.revoke_space_invite(uuid) to authenticated;
grant execute on function public.change_space_member_role(uuid, uuid, public.space_role) to authenticated;
grant execute on function public.remove_space_member(uuid, uuid) to authenticated;
grant execute on function public.leave_space(uuid) to authenticated;
