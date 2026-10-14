-- Phase 5: hearts and comments by guests (Supabase anonymous sign-in, no registration).
--
-- Guests are `authenticated` users whose JWT has is_anonymous = true. Every auth user
-- (also anonymous) gets a row in public.profiles via the handle_new_user trigger, so the
-- existing user_id -> profiles FK keeps working and is left unchanged.
--
-- Rules
--   * guest comments start as 'pending' and become public only after a moderator approves;
--     registered users' comments are 'approved' immediately (v1 behaviour),
--   * the status is forced by a trigger, clients can never set it (no column grant),
--   * abuse limits (defense in depth, Turnstile/edge limits come on top):
--       guest comments: 5 / hour, 20 / day, body <= 500 chars, name 1..40 chars
--       registered comments: 30 / hour
--       guest hearts: at most 500 rows in total
--   * guests cannot edit or delete comments (prevents bypassing approval and the limits);
--     moderators reject/delete instead.

-- ---------------------------------------------------------------- helpers
create or replace function public.is_guest()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

revoke all on function public.is_guest() from public, anon, authenticated;
grant execute on function public.is_guest() to anon, authenticated;

create type public.comment_status as enum ('pending', 'approved', 'rejected');

alter table public.content_comments
  add column guest_name text,
  add column status public.comment_status not null default 'approved',
  add column moderated_by uuid references auth.users (id) on delete set null,
  add column moderated_at timestamptz,
  add constraint content_comments_guest_name_length check (
    guest_name is null or char_length(guest_name) between 1 and 40
  );

create index content_comments_pending_idx
  on public.content_comments (target_type, target_id)
  where status = 'pending';
create index content_comments_user_created_idx
  on public.content_comments (user_id, created_at);

-- ---------------------------------------------------------------- targets
create or replace function public.is_interactable_target(
  p_target_type public.content_target_type,
  p_target_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_target_type
    when 'journey'::public.content_target_type then exists (
      select 1 from public.journeys j
      where j.id = p_target_id and j.visibility = 'public'
    )
    when 'entry'::public.content_target_type then exists (
      select 1 from public.entries e
      where e.id = p_target_id and e.status = 'published' and e.visibility = 'public'
    )
    when 'photo'::public.content_target_type then public.is_public_photo(p_target_id)
    when 'segment'::public.content_target_type then exists (
      select 1 from public.segments sg
      join public.journeys j on j.id = sg.journey_id
      where sg.id = p_target_id and j.visibility = 'public'
    )
    when 'moment'::public.content_target_type then exists (
      select 1 from public.moments mo
      join public.journeys j on j.id = mo.journey_id
      where mo.id = p_target_id and mo.published and j.visibility = 'public'
    )
    when 'media'::public.content_target_type then exists (
      select 1 from public.media m
      join public.journeys j on j.id = m.journey_id
      where m.id = p_target_id
        and m.status = 'ready'
        and j.visibility = 'public'
        and (m.moment_id is null or exists (
          select 1 from public.moments mo where mo.id = m.moment_id and mo.published
        ))
    )
    else false
  end
$$;

create or replace function public.can_moderate_target(
  p_target_type public.content_target_type,
  p_target_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- not an oracle: callers can only ask about themselves
    when p_user_id is null or p_user_id is distinct from auth.uid() then false
    when p_target_type = 'journey'::public.content_target_type then exists (
      select 1 from public.journeys j
      where j.id = p_target_id
        and (j.creator_id = p_user_id or public.has_space_publish_role(j.space_id))
    )
    when p_target_type = 'entry'::public.content_target_type then exists (
      select 1 from public.entries e
      where e.id = p_target_id
        and (e.creator_id = p_user_id or public.has_space_publish_role(e.space_id))
    )
    when p_target_type = 'photo'::public.content_target_type then (
      exists (
        select 1 from public.photos p
        where p.id = p_target_id and p.creator_id = p_user_id
      )
      or exists (
        select 1
        from public.entry_photos ep
        join public.entries e on e.id = ep.entry_id
        where ep.photo_id = p_target_id
          and (e.creator_id = p_user_id or public.has_space_publish_role(e.space_id))
      )
    )
    when p_target_type = 'segment'::public.content_target_type then exists (
      select 1 from public.segments sg
      join public.journeys j on j.id = sg.journey_id
      where sg.id = p_target_id
        and (j.creator_id = p_user_id or public.has_space_publish_role(j.space_id))
    )
    when p_target_type = 'moment'::public.content_target_type then exists (
      select 1 from public.moments mo
      join public.journeys j on j.id = mo.journey_id
      where mo.id = p_target_id
        and (j.creator_id = p_user_id or public.has_space_publish_role(j.space_id))
    )
    when p_target_type = 'media'::public.content_target_type then exists (
      select 1 from public.media m
      left join public.journeys j on j.id = m.journey_id
      where m.id = p_target_id
        and (
          m.owner_id = p_user_id
          or j.creator_id = p_user_id
          or (j.id is not null and public.has_space_publish_role(j.space_id))
        )
    )
    else false
  end
$$;

-- Both are evaluated by anon/authenticated RLS policies (invoker rights), so those roles
-- need EXECUTE; PUBLIC is revoked explicitly. can_moderate_target only answers for the caller.
revoke all on function public.is_interactable_target(public.content_target_type, uuid)
  from public, anon, authenticated;
grant execute on function public.is_interactable_target(public.content_target_type, uuid)
  to anon, authenticated;
revoke all on function public.can_moderate_target(public.content_target_type, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.can_moderate_target(public.content_target_type, uuid, uuid)
  to anon, authenticated;

-- ---------------------------------------------------------------- triggers
create or replace function public.guard_content_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guest boolean := public.is_guest();
  v_hour integer;
  v_day integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('content_comments:' || new.user_id::text, 0));

  select count(*) filter (where created_at > now() - interval '1 hour'),
         count(*) filter (where created_at > now() - interval '1 day')
    into v_hour, v_day
  from public.content_comments
  where user_id = new.user_id;

  if v_guest then
    new.guest_name := btrim(coalesce(new.guest_name, ''));
    if char_length(new.guest_name) not between 1 and 40 then
      raise exception 'guest name must have 1 to 40 characters' using errcode = '23514';
    end if;
    if char_length(new.body) > 500 then
      raise exception 'guest comment is too long' using errcode = '23514';
    end if;
    if v_hour >= 5 or v_day >= 20 then
      raise exception 'comment rate limit exceeded' using errcode = '54000';
    end if;
    new.status := 'pending';
  else
    if v_hour >= 30 then
      raise exception 'comment rate limit exceeded' using errcode = '54000';
    end if;
    new.guest_name := null;
    new.status := 'approved';
  end if;

  new.moderated_by := null;
  new.moderated_at := null;
  return new;
end;
$$;

revoke all on function public.guard_content_comment_insert() from public, anon, authenticated;

create trigger guard_content_comment_insert
before insert on public.content_comments
for each row
execute function public.guard_content_comment_insert();

create or replace function public.guard_content_heart_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_guest() then
    perform pg_advisory_xact_lock(hashtextextended('content_hearts:' || new.user_id::text, 0));
    if (select count(*) from public.content_hearts where user_id = new.user_id) >= 500 then
      raise exception 'heart limit exceeded' using errcode = '54000';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_content_heart_insert() from public, anon, authenticated;

create trigger guard_content_heart_insert
before insert on public.content_hearts
for each row
execute function public.guard_content_heart_insert();

-- Edits: authors (also upgraded ex-guests) cannot bypass moderation, and moderators can
-- only hide/unhide other users' comments, never rewrite their text. Statements without a
-- JWT user (migrations, service role) and moderate_comment (status only) are untouched.
create or replace function public.guard_content_comment_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_moderator boolean;
begin
  if v_uid is null then
    return new;
  end if;
  v_moderator := public.can_moderate_target(old.target_type, old.target_id, v_uid);

  if new.hidden_at is distinct from old.hidden_at or new.hidden_by is distinct from old.hidden_by then
    if not v_moderator then
      raise exception 'only moderators can hide comments' using errcode = '42501';
    end if;
  end if;

  if new.body is distinct from old.body then
    if old.user_id is distinct from v_uid then
      raise exception 'moderators cannot edit the text of other users' using errcode = '42501';
    end if;
    if old.guest_name is not null and not v_moderator then
      if char_length(new.body) > 500 then
        raise exception 'guest comment is too long' using errcode = '23514';
      end if;
      new.status := 'pending';
      new.moderated_by := null;
      new.moderated_at := null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_content_comment_update() from public, anon, authenticated;

create trigger guard_content_comment_update
before update of body, hidden_at, hidden_by on public.content_comments
for each row
execute function public.guard_content_comment_update();

-- ---------------------------------------------------------------- grants
revoke all on public.content_comments from anon, authenticated;
revoke all on public.content_hearts from anon, authenticated;

grant select (id, target_type, target_id, body, guest_name, status, hidden_at, created_at)
  on public.content_comments to anon;
-- moderated_by / moderated_at stay hidden; user_id stays readable (v1 isOwn + profiles embed).
grant select (id, target_type, target_id, user_id, body, guest_name, status, hidden_at, created_at, updated_at)
  on public.content_comments to authenticated;
grant insert (target_type, target_id, user_id, body, guest_name)
  on public.content_comments to authenticated;
grant update (body, hidden_at, hidden_by) on public.content_comments to authenticated;
grant delete on public.content_comments to authenticated;

grant select (target_type, target_id, created_at) on public.content_hearts to anon;
-- No user_id: signed-in users (guests included) cannot see who hearted. Own hearts via my_hearts().
grant select (target_type, target_id, created_at) on public.content_hearts to authenticated;
grant insert, delete on public.content_hearts to authenticated;

create or replace function public.my_hearts(
  p_target_type public.content_target_type default null,
  p_target_id uuid default null
)
returns table (target_type public.content_target_type, target_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select h.target_type, h.target_id
  from public.content_hearts h
  where h.user_id = auth.uid()
    and (p_target_type is null or h.target_type = p_target_type)
    and (p_target_id is null or h.target_id = p_target_id)
  limit 1000
$$;

revoke all on function public.my_hearts(public.content_target_type, uuid) from public, anon, authenticated;
grant execute on function public.my_hearts(public.content_target_type, uuid) to authenticated;

-- ---------------------------------------------------------------- policies
drop policy "Readers can view visible comments on interactable targets" on public.content_comments;
create policy "Readers can view approved comments on interactable targets"
on public.content_comments
for select
to anon, authenticated
using (
  public.is_interactable_target(target_type, target_id)
  and (
    (status = 'approved' and hidden_at is null)
    or user_id = (select auth.uid())
    or public.can_moderate_target(target_type, target_id, (select auth.uid()))
  )
);

drop policy "Authors can update their own comments" on public.content_comments;
create policy "Registered authors can update their own comments"
on public.content_comments
for update
to authenticated
using (user_id = (select auth.uid()) and not public.is_guest())
with check (user_id = (select auth.uid()) and not public.is_guest());

drop policy "Authors can delete their own comments" on public.content_comments;
create policy "Registered authors can delete their own comments"
on public.content_comments
for delete
to authenticated
using (user_id = (select auth.uid()) and not public.is_guest());

create policy "Moderators can delete comments"
on public.content_comments
for delete
to authenticated
using (public.can_moderate_target(target_type, target_id, (select auth.uid())));

-- ---------------------------------------------------------------- moderation RPCs
create or replace function public.list_pending_comments(p_journey_id uuid)
returns table (
  id uuid,
  target_type public.content_target_type,
  target_id uuid,
  guest_name text,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.target_type, c.target_id, c.guest_name, c.body, c.created_at
  from public.content_comments c
  where c.status = 'pending'
    and public.can_moderate_target('journey', p_journey_id, auth.uid())
    and (
      (c.target_type = 'journey' and c.target_id = p_journey_id)
      or (c.target_type = 'segment' and exists (
        select 1 from public.segments x where x.id = c.target_id and x.journey_id = p_journey_id))
      or (c.target_type = 'moment' and exists (
        select 1 from public.moments x where x.id = c.target_id and x.journey_id = p_journey_id))
      or (c.target_type = 'media' and exists (
        select 1 from public.media x where x.id = c.target_id and x.journey_id = p_journey_id))
    )
  order by c.created_at
$$;

create or replace function public.moderate_comment(
  p_comment_id uuid,
  p_status public.comment_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.content_target_type;
  v_target uuid;
begin
  if p_status = 'pending' then
    raise exception 'invalid moderation status' using errcode = '22023';
  end if;
  select target_type, target_id into v_type, v_target
  from public.content_comments where id = p_comment_id;
  if not found or not public.can_moderate_target(v_type, v_target, auth.uid()) then
    raise exception 'comment not found' using errcode = '42501';
  end if;
  update public.content_comments
  set status = p_status, moderated_by = auth.uid(), moderated_at = now()
  where id = p_comment_id;
end;
$$;

revoke all on function public.list_pending_comments(uuid) from public, anon, authenticated;
revoke all on function public.moderate_comment(uuid, public.comment_status) from public, anon, authenticated;
grant execute on function public.list_pending_comments(uuid) to authenticated;
grant execute on function public.moderate_comment(uuid, public.comment_status) to authenticated;

-- ---------------------------------------------------------------- public read model
create or replace function public.get_public_engagement(
  p_space_handle text,
  p_journey_slug text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with journey as (
    select j.id
    from public.journeys j
    join public.spaces s on s.id = j.space_id
    where s.handle = lower(p_space_handle)
      and j.slug = p_journey_slug
      and j.visibility = 'public'
  ),
  targets as (
    select 'journey'::public.content_target_type as target_type, j.id as target_id from journey j
    union all
    select 'segment', sg.id from public.segments sg join journey j on j.id = sg.journey_id
    union all
    select 'moment', mo.id from public.moments mo join journey j on j.id = mo.journey_id where mo.published
    union all
    select 'media', m.id
    from public.media m
    join journey j on j.id = m.journey_id
    where m.status = 'ready'
      and (m.moment_id is null or exists (
        select 1 from public.moments mo where mo.id = m.moment_id and mo.published))
  )
  select case when not exists (select 1 from journey) then null else jsonb_build_object(
    'hearts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'targetType', x.target_type, 'targetId', x.target_id, 'count', x.n
      ) order by x.target_type, x.target_id)
      from (
        select h.target_type, h.target_id, count(*)::int as n
        from public.content_hearts h
        join targets t on t.target_type = h.target_type and t.target_id = h.target_id
        group by h.target_type, h.target_id
      ) x
    ), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'targetType', c.target_type,
        'targetId', c.target_id,
        'name', coalesce(c.guest_name, p.display_name, p.username, ''),
        'body', c.body,
        'createdAt', c.created_at
      ) order by c.created_at, c.id)
      from public.content_comments c
      join targets t on t.target_type = c.target_type and t.target_id = c.target_id
      left join public.profiles p on p.id = c.user_id
      where c.status = 'approved' and c.hidden_at is null
    ), '[]'::jsonb)
  ) end
$$;

revoke all on function public.get_public_engagement(text, text) from public, anon, authenticated;
grant execute on function public.get_public_engagement(text, text) to anon, authenticated;
