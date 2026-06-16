create or replace function public.list_journey_pending_invites(p_journey_id uuid)
returns table (
  created_at timestamptz,
  email_normalized text,
  expires_at timestamptz,
  id uuid,
  role public.journey_member_role
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  perform 1 from public.journeys as journeys where journeys.id = p_journey_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'journey not found';
  end if;
  if not public.is_journey_owner(p_journey_id) then
    raise exception using errcode = '42501', message = 'journey owner required';
  end if;

  return query
  select
    journey_invites.created_at,
    journey_invites.email_normalized,
    journey_invites.expires_at,
    journey_invites.id,
    journey_invites.role
  from public.journey_invites
  where journey_invites.journey_id = p_journey_id
    and journey_invites.accepted_at is null
    and journey_invites.revoked_at is null
    and journey_invites.expires_at > now()
  order by journey_invites.created_at desc;
end
$$;

create or replace function public.revoke_journey_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.journey_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select *
  into v_invite
  from public.journey_invites
  where id = p_invite_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'invite not found';
  end if;

  perform 1 from public.journeys where id = v_invite.journey_id for update;
  if not public.is_journey_owner(v_invite.journey_id) then
    raise exception using errcode = '42501', message = 'journey owner required';
  end if;

  if v_invite.accepted_at is not null then
    raise exception using errcode = '22023', message = 'accepted invite cannot be revoked';
  end if;

  update public.journey_invites
  set revoked_at = now()
  where id = p_invite_id;
end
$$;

revoke all on function public.list_journey_pending_invites(uuid)
from public, anon, authenticated;
revoke all on function public.revoke_journey_invite(uuid)
from public, anon, authenticated;

grant execute on function public.list_journey_pending_invites(uuid) to authenticated;
grant execute on function public.revoke_journey_invite(uuid) to authenticated;
