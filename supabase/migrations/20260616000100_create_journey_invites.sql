create table public.journey_invites (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  email_normalized text not null,
  token_hash bytea not null unique,
  role public.journey_member_role not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),

  constraint journey_invites_email_normalized check (
    email_normalized = lower(btrim(email_normalized))
    and email_normalized ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint journey_invites_role_not_owner check (
    role <> 'owner'::public.journey_member_role
  ),
  constraint journey_invites_expiry_after_creation check (expires_at > created_at),
  constraint journey_invites_acceptance_consistent check (
    (accepted_at is null and accepted_by is null)
    or (accepted_at is not null and accepted_by is not null)
  ),
  constraint journey_invites_not_accepted_and_revoked check (
    accepted_at is null or revoked_at is null
  )
);

create unique index journey_invites_one_pending_email_idx
on public.journey_invites (journey_id, email_normalized)
where accepted_at is null and revoked_at is null;

create index journey_invites_journey_idx on public.journey_invites (journey_id);

alter table public.journey_invites enable row level security;

revoke all on table public.journey_invites from public, anon, authenticated;

create or replace function public.get_journey_invite_preview(p_raw_token text)
returns table (
  journey_id uuid,
  journey_title text,
  journey_summary text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    journeys.id,
    journeys.title,
    journeys.summary
  from public.journey_invites
  join public.journeys on journeys.id = journey_invites.journey_id
  where length(p_raw_token) = 64
    and journey_invites.token_hash = extensions.digest(p_raw_token, 'sha256')
    and journey_invites.accepted_at is null
    and journey_invites.revoked_at is null
    and journey_invites.expires_at > now()
$$;

create or replace function public.create_journey_invite(
  p_journey_id uuid,
  p_email text,
  p_role public.journey_member_role default 'member'::public.journey_member_role
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

  perform 1 from public.journeys where id = p_journey_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'journey not found';
  end if;
  if not public.is_journey_owner(p_journey_id) then
    raise exception using errcode = '42501', message = 'journey owner required';
  end if;
  if p_role = 'owner'::public.journey_member_role then
    raise exception using errcode = '22023', message = 'invites cannot grant owner role';
  end if;
  if v_email is null
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception using errcode = '22023', message = 'valid invite email required';
  end if;

  update public.journey_invites
  set revoked_at = now()
  where journey_id = p_journey_id
    and email_normalized = v_email
    and accepted_at is null
    and revoked_at is null;

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.journey_invites (
    journey_id,
    created_by,
    email_normalized,
    token_hash,
    role,
    expires_at
  )
  values (
    p_journey_id,
    auth.uid(),
    v_email,
    extensions.digest(v_raw_token, 'sha256'),
    p_role,
    now() + interval '7 days'
  );

  return v_raw_token;
end
$$;

create or replace function public.accept_journey_invite(p_raw_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.journey_invites%rowtype;
  v_email text;
  v_journey_id uuid;
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

  select journey_id
  into v_journey_id
  from public.journey_invites
  where token_hash = extensions.digest(p_raw_token, 'sha256');

  if not found then
    raise exception using errcode = '22023', message = 'invalid or expired invite';
  end if;

  perform 1 from public.journeys where id = v_journey_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'invalid or expired invite';
  end if;

  select *
  into v_invite
  from public.journey_invites
  where token_hash = extensions.digest(p_raw_token, 'sha256')
    and journey_id = v_journey_id
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

  insert into public.journey_members (journey_id, user_id, role)
  values (v_invite.journey_id, auth.uid(), v_invite.role)
  on conflict (journey_id, user_id) do nothing;

  update public.journey_invites
  set accepted_at = now(), accepted_by = auth.uid()
  where id = v_invite.id;

  return v_invite.journey_id;
end
$$;

revoke all on function public.create_journey_invite(uuid, text, public.journey_member_role)
from public, anon, authenticated;
revoke all on function public.get_journey_invite_preview(text)
from public, anon, authenticated;
revoke all on function public.accept_journey_invite(text)
from public, anon, authenticated;

grant execute on function public.create_journey_invite(uuid, text, public.journey_member_role)
to authenticated;
grant execute on function public.get_journey_invite_preview(text) to anon, authenticated;
grant execute on function public.accept_journey_invite(text) to authenticated;
