create type public.journey_visibility as enum ('public', 'private');
create type public.journey_status as enum ('planning', 'active', 'completed');
create type public.journey_member_role as enum ('owner', 'editor', 'member');
create type public.journey_stop_status as enum ('planned', 'visited');

create table public.journeys (
  id uuid primary key,
  creator_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  summary text not null default '',
  visibility public.journey_visibility not null default 'public',
  status public.journey_status not null default 'planning',
  starts_at date,
  ends_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint journeys_id_creator_unique unique (id, creator_id),
  constraint journeys_title_length_check check (char_length(title) between 1 and 160),
  constraint journeys_summary_length_check check (char_length(summary) <= 5000),
  constraint journeys_date_order_check check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create table public.journey_members (
  journey_id uuid not null references public.journeys (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.journey_member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (journey_id, user_id)
);

create table public.journey_stages (
  id uuid primary key,
  journey_id uuid not null references public.journeys (id) on delete cascade,
  creator_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  summary text not null default '',
  position integer not null,
  starts_at date,
  ends_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint journey_stages_id_journey_unique unique (id, journey_id),
  constraint journey_stages_position_unique unique (journey_id, position),
  constraint journey_stages_title_length_check check (char_length(title) between 1 and 160),
  constraint journey_stages_summary_length_check check (char_length(summary) <= 5000),
  constraint journey_stages_position_nonnegative_check check (position >= 0),
  constraint journey_stages_date_order_check check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create table public.journey_stops (
  id uuid primary key,
  journey_id uuid not null references public.journeys (id) on delete cascade,
  stage_id uuid,
  creator_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  notes text not null default '',
  status public.journey_stop_status not null default 'planned',
  position integer not null,
  latitude double precision,
  longitude double precision,
  planned_at timestamptz,
  visited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint journey_stops_id_journey_unique unique (id, journey_id),
  constraint journey_stops_stage_fk foreign key (stage_id, journey_id)
    references public.journey_stages (id, journey_id) on delete set null (stage_id),
  constraint journey_stops_position_unique unique (journey_id, position),
  constraint journey_stops_title_length_check check (char_length(title) between 1 and 160),
  constraint journey_stops_notes_length_check check (char_length(notes) <= 10000),
  constraint journey_stops_position_nonnegative_check check (position >= 0),
  constraint journey_stops_coordinates_pair_check check (
    (latitude is null and longitude is null) or (latitude is not null and longitude is not null)
  ),
  constraint journey_stops_latitude_range_check check (latitude is null or latitude between -90 and 90),
  constraint journey_stops_longitude_range_check check (longitude is null or longitude between -180 and 180)
);

create table public.journey_guide_sections (
  id uuid primary key,
  journey_id uuid not null references public.journeys (id) on delete cascade,
  creator_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null default '',
  position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint journey_guide_sections_id_journey_unique unique (id, journey_id),
  constraint journey_guide_sections_position_unique unique (journey_id, position),
  constraint journey_guide_sections_title_length_check check (char_length(title) between 1 and 160),
  constraint journey_guide_sections_body_length_check check (char_length(body) <= 50000),
  constraint journey_guide_sections_position_nonnegative_check check (position >= 0)
);

create table public.entry_journey_links (
  entry_id uuid primary key references public.entries (id) on delete cascade,
  journey_id uuid not null references public.journeys (id) on delete cascade,
  stage_id uuid,
  stop_id uuid,
  guide_section_id uuid,
  creator_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint entry_journey_links_stage_fk foreign key (stage_id, journey_id)
    references public.journey_stages (id, journey_id) on delete set null (stage_id),
  constraint entry_journey_links_stop_fk foreign key (stop_id, journey_id)
    references public.journey_stops (id, journey_id) on delete set null (stop_id),
  constraint entry_journey_links_guide_fk foreign key (guide_section_id, journey_id)
    references public.journey_guide_sections (id, journey_id) on delete set null (guide_section_id)
);

create index journey_members_user_idx on public.journey_members (user_id, journey_id);
create index journey_stages_journey_position_idx on public.journey_stages (journey_id, position);
create index journey_stops_stage_position_idx on public.journey_stops (stage_id, position);
create index journey_guide_sections_journey_position_idx on public.journey_guide_sections (journey_id, position);
create index entry_journey_links_journey_idx on public.entry_journey_links (journey_id);

create trigger set_journeys_updated_at before update on public.journeys
for each row execute function public.set_updated_at();
create trigger set_journey_stages_updated_at before update on public.journey_stages
for each row execute function public.set_updated_at();
create trigger set_journey_stops_updated_at before update on public.journey_stops
for each row execute function public.set_updated_at();
create trigger set_journey_guide_sections_updated_at before update on public.journey_guide_sections
for each row execute function public.set_updated_at();

create or replace function public.is_journey_member(p_journey_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (
  select 1 from public.journey_members
  where journey_id = p_journey_id and user_id = auth.uid()
) $$;

create or replace function public.is_journey_owner(p_journey_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (
  select 1 from public.journeys
  where id = p_journey_id and creator_id = auth.uid()
) $$;

revoke all on function public.is_journey_member(uuid) from public, anon, authenticated;
revoke all on function public.is_journey_owner(uuid) from public, anon, authenticated;
grant execute on function public.is_journey_member(uuid) to anon, authenticated;
grant execute on function public.is_journey_owner(uuid) to authenticated;

create or replace function public.add_journey_owner_membership()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin
  insert into public.journey_members (journey_id, user_id, role)
  values (new.id, new.creator_id, 'owner');
  return new;
end $$;
revoke all on function public.add_journey_owner_membership() from public, anon, authenticated;
create trigger add_journey_owner_membership_after_insert
after insert on public.journeys for each row execute function public.add_journey_owner_membership();

alter table public.journeys enable row level security;
alter table public.journey_members enable row level security;
alter table public.journey_stages enable row level security;
alter table public.journey_stops enable row level security;
alter table public.journey_guide_sections enable row level security;
alter table public.entry_journey_links enable row level security;

create policy "Public journeys and member journeys are readable" on public.journeys
for select to anon, authenticated using (
  visibility = 'public' or public.is_journey_member(id)
);
create policy "Creators can insert journeys" on public.journeys
for insert to authenticated with check (creator_id = auth.uid());
create policy "Owners can update journeys" on public.journeys
for update to authenticated using (creator_id = auth.uid()) with check (creator_id = auth.uid());
create policy "Owners can delete journeys" on public.journeys
for delete to authenticated using (creator_id = auth.uid());

create policy "Members can read fellow memberships" on public.journey_members
for select to authenticated using (public.is_journey_member(journey_id));
create policy "Owners manage journey memberships" on public.journey_members
for all to authenticated using (public.is_journey_owner(journey_id))
with check (public.is_journey_owner(journey_id));

create policy "Public journey stages and member stages are readable" on public.journey_stages
for select to anon, authenticated using (
  public.is_journey_member(journey_id)
  or exists (select 1 from public.journeys j where j.id = journey_id and j.visibility = 'public')
);
create policy "Members create their own stages" on public.journey_stages
for insert to authenticated with check (creator_id = auth.uid() and public.is_journey_member(journey_id));
create policy "Stage creators update stages" on public.journey_stages
for update to authenticated using (creator_id = auth.uid()) with check (creator_id = auth.uid() and public.is_journey_member(journey_id));
create policy "Stage creators delete stages" on public.journey_stages
for delete to authenticated using (creator_id = auth.uid());

create policy "Public journey stops without exact coordinates are readable" on public.journey_stops
for select to anon, authenticated using (
  public.is_journey_member(journey_id)
  or exists (select 1 from public.journeys j where j.id = journey_id and j.visibility = 'public')
);
create policy "Members create their own stops" on public.journey_stops
for insert to authenticated with check (creator_id = auth.uid() and public.is_journey_member(journey_id));
create policy "Stop creators update stops" on public.journey_stops
for update to authenticated using (creator_id = auth.uid()) with check (creator_id = auth.uid() and public.is_journey_member(journey_id));
create policy "Stop creators delete stops" on public.journey_stops
for delete to authenticated using (creator_id = auth.uid());

create policy "Public journey guides and member guides are readable" on public.journey_guide_sections
for select to anon, authenticated using (
  public.is_journey_member(journey_id)
  or exists (select 1 from public.journeys j where j.id = journey_id and j.visibility = 'public')
);
create policy "Members create their own guides" on public.journey_guide_sections
for insert to authenticated with check (creator_id = auth.uid() and public.is_journey_member(journey_id));
create policy "Guide creators update guides" on public.journey_guide_sections
for update to authenticated using (creator_id = auth.uid()) with check (creator_id = auth.uid() and public.is_journey_member(journey_id));
create policy "Guide creators delete guides" on public.journey_guide_sections
for delete to authenticated using (creator_id = auth.uid());

create policy "Readable journey entry links" on public.entry_journey_links
for select to anon, authenticated using (
  public.is_journey_member(journey_id)
  or exists (select 1 from public.journeys j where j.id = journey_id and j.visibility = 'public')
);
create policy "Entry creators manage journey links" on public.entry_journey_links
for all to authenticated using (creator_id = auth.uid())
with check (
  creator_id = auth.uid()
  and public.is_journey_member(journey_id)
  and exists (select 1 from public.entries e where e.id = entry_id and e.creator_id = auth.uid())
);

revoke all on table public.journeys, public.journey_members, public.journey_stages,
  public.journey_stops, public.journey_guide_sections, public.entry_journey_links
  from public, anon, authenticated;

grant select on table public.journeys, public.journey_members, public.journey_stages,
  public.journey_guide_sections, public.entry_journey_links to anon, authenticated;
grant select (
  id, journey_id, stage_id, creator_id, title, notes, status, position,
  planned_at, visited_at, created_at, updated_at
) on public.journey_stops to anon, authenticated;

grant insert (id, creator_id, title, summary, visibility, status, starts_at, ends_at)
  on public.journeys to authenticated;
grant update (title, summary, visibility, status, starts_at, ends_at)
  on public.journeys to authenticated;
grant delete on public.journeys to authenticated;

grant insert (journey_id, user_id, role), update (role), delete on public.journey_members to authenticated;
grant insert, update, delete on public.journey_stages to authenticated;
grant insert, update, delete on public.journey_stops to authenticated;
grant insert, update, delete on public.journey_guide_sections to authenticated;
grant insert, update, delete on public.entry_journey_links to authenticated;

create or replace function public.create_journey_stage(
  p_journey_id uuid,
  p_title text,
  p_summary text default ''
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare new_id uuid := gen_random_uuid();
begin
  perform 1 from public.journeys where id = p_journey_id for update;
  if not public.is_journey_member(p_journey_id) then
    raise exception using errcode = '42501', message = 'journey membership required';
  end if;
  insert into public.journey_stages (id, journey_id, creator_id, title, summary, position)
  select new_id, p_journey_id, auth.uid(), p_title, p_summary, coalesce(max(position) + 1, 0)
  from public.journey_stages where journey_id = p_journey_id;
  return new_id;
end $$;

create or replace function public.create_journey_stop(
  p_journey_id uuid,
  p_stage_id uuid,
  p_title text,
  p_notes text default '',
  p_status public.journey_stop_status default 'planned'
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare new_id uuid := gen_random_uuid();
begin
  perform 1 from public.journeys where id = p_journey_id for update;
  if not public.is_journey_member(p_journey_id) then
    raise exception using errcode = '42501', message = 'journey membership required';
  end if;
  insert into public.journey_stops (
    id, journey_id, stage_id, creator_id, title, notes, status, position
  )
  select new_id, p_journey_id, p_stage_id, auth.uid(), p_title, p_notes, p_status,
    coalesce(max(position) + 1, 0)
  from public.journey_stops where journey_id = p_journey_id;
  return new_id;
end $$;

create or replace function public.create_journey_guide_section(
  p_journey_id uuid,
  p_title text,
  p_body text default ''
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare new_id uuid := gen_random_uuid();
begin
  perform 1 from public.journeys where id = p_journey_id for update;
  if not public.is_journey_member(p_journey_id) then
    raise exception using errcode = '42501', message = 'journey membership required';
  end if;
  insert into public.journey_guide_sections (
    id, journey_id, creator_id, title, body, position
  )
  select new_id, p_journey_id, auth.uid(), p_title, p_body, coalesce(max(position) + 1, 0)
  from public.journey_guide_sections where journey_id = p_journey_id;
  return new_id;
end $$;

revoke all on function public.create_journey_stage(uuid, text, text) from public, anon, authenticated;
revoke all on function public.create_journey_stop(uuid, uuid, text, text, public.journey_stop_status) from public, anon, authenticated;
revoke all on function public.create_journey_guide_section(uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_journey_stage(uuid, text, text) to authenticated;
grant execute on function public.create_journey_stop(uuid, uuid, text, text, public.journey_stop_status) to authenticated;
grant execute on function public.create_journey_guide_section(uuid, text, text) to authenticated;
