create type public.checklist_item_category as enum (
  'wildlife',
  'flora',
  'geology',
  'landmark',
  'general'
);

create table public.journey_checklist_items (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys (id) on delete cascade,
  template_slug text not null,
  item_slug text not null,
  creator_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  notes text not null default '',
  category public.checklist_item_category not null default 'general',
  position integer not null,
  checked_at timestamptz,
  stop_id uuid,
  entry_id uuid references public.entries (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint journey_checklist_items_journey_template_item_unique
    unique (journey_id, template_slug, item_slug),
  constraint journey_checklist_items_title_length_check
    check (char_length(title) between 1 and 160),
  constraint journey_checklist_items_notes_length_check
    check (char_length(notes) <= 5000),
  constraint journey_checklist_items_position_nonnegative_check
    check (position >= 0),
  constraint journey_checklist_items_stop_fk
    foreign key (stop_id, journey_id)
    references public.journey_stops (id, journey_id) on delete set null
);

create index journey_checklist_items_journey_id_idx
  on public.journey_checklist_items (journey_id, position);

create trigger set_journey_checklist_items_updated_at
before update on public.journey_checklist_items
for each row execute function public.set_updated_at();

alter table public.journey_checklist_items enable row level security;

create policy "Public and members can read journey checklist items"
on public.journey_checklist_items
for select
to anon, authenticated
using (
  public.is_journey_member(journey_id)
  or exists (
    select 1
    from public.journeys j
    where j.id = journey_checklist_items.journey_id
      and j.visibility = 'public'
  )
);

create policy "Members create their own checklist items"
on public.journey_checklist_items
for insert
to authenticated
with check (
  creator_id = auth.uid()
  and public.is_journey_member(journey_id)
);

create policy "Checklist item creators update items"
on public.journey_checklist_items
for update
to authenticated
using (creator_id = auth.uid())
with check (creator_id = auth.uid() and public.is_journey_member(journey_id));

create policy "Checklist item creators delete items"
on public.journey_checklist_items
for delete
to authenticated
using (creator_id = auth.uid());

revoke all on table public.journey_checklist_items from public, anon, authenticated;
grant select on table public.journey_checklist_items to anon, authenticated;
grant insert, update, delete on table public.journey_checklist_items to authenticated;
