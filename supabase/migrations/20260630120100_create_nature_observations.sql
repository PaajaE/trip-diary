create type public.observation_confidence as enum ('seen', 'heard', 'unsure');

create table public.nature_observations (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys (id) on delete cascade,
  photo_id uuid references public.photos (id) on delete set null,
  entry_id uuid references public.entries (id) on delete set null,
  checklist_item_id uuid references public.journey_checklist_items (id) on delete set null,
  creator_id uuid not null references auth.users (id) on delete cascade,
  common_name text not null,
  scientific_name text,
  category public.checklist_item_category not null default 'general',
  confidence public.observation_confidence not null default 'seen',
  notes text not null default '',
  latitude double precision,
  longitude double precision,
  external_source text,
  external_id text,
  observed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint nature_observations_common_name_length_check
    check (char_length(common_name) between 1 and 160),
  constraint nature_observations_scientific_name_length_check
    check (scientific_name is null or char_length(scientific_name) <= 160),
  constraint nature_observations_notes_length_check
    check (char_length(notes) <= 5000),
  constraint nature_observations_coordinates_pair_check check (
    (latitude is null and longitude is null)
    or (latitude is not null and longitude is not null)
  ),
  constraint nature_observations_latitude_range_check
    check (latitude is null or latitude between -90 and 90),
  constraint nature_observations_longitude_range_check
    check (longitude is null or longitude between -180 and 180)
);

create index nature_observations_journey_id_idx
  on public.nature_observations (journey_id, created_at desc);

create index nature_observations_photo_id_idx
  on public.nature_observations (photo_id)
  where photo_id is not null;

create trigger set_nature_observations_updated_at
before update on public.nature_observations
for each row execute function public.set_updated_at();

alter table public.nature_observations enable row level security;

create policy "Public and members can read nature observations"
on public.nature_observations
for select
to anon, authenticated
using (
  public.is_journey_member(journey_id)
  or exists (
    select 1
    from public.journeys j
    where j.id = nature_observations.journey_id
      and j.visibility = 'public'
  )
);

create policy "Members create their own observations"
on public.nature_observations
for insert
to authenticated
with check (
  creator_id = auth.uid()
  and public.is_journey_member(journey_id)
);

create policy "Observation creators update observations"
on public.nature_observations
for update
to authenticated
using (creator_id = auth.uid())
with check (creator_id = auth.uid() and public.is_journey_member(journey_id));

create policy "Observation creators delete observations"
on public.nature_observations
for delete
to authenticated
using (creator_id = auth.uid());

revoke all on table public.nature_observations from public, anon, authenticated;
grant select on table public.nature_observations to anon, authenticated;
grant insert, update, delete on table public.nature_observations to authenticated;
