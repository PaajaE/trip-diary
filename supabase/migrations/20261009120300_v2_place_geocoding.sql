-- Place names from OSM Nominatim (docs/plan-v2.md, phase 3).
--
-- Nominatim usage policy: max 1 request/s for the whole app and results must
-- be cached. The resolve-place edge function (service role) uses:
--   * places.source_ref       — reuse the same OSM place across journeys,
--   * place_lookups           — cache per ~110 m grid cell, never ask twice,
--   * claim_geocoder_slot()   — app-wide spacing of requests.

alter table public.places
  add column source_ref text,
  add constraint places_source_ref_check check (
    source_ref is null or char_length(source_ref) between 1 and 200
  );

create unique index places_source_ref_unique_idx
  on public.places (source_ref) where source_ref is not null;

create table public.place_lookups (
  grid_key text primary key,
  place_id uuid references public.places (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint place_lookups_grid_key_check check (
    grid_key ~ '^-?[0-9]{1,2}\.[0-9]{3},-?[0-9]{1,3}\.[0-9]{3}$'
  )
);

create table public.geocoder_throttle (
  id smallint primary key default 1,
  next_slot_at timestamptz not null default now(),
  constraint geocoder_throttle_single_row check (id = 1)
);

insert into public.geocoder_throttle (id) values (1);

-- Reserves the next request slot and returns how long the caller must wait
-- before sending it. Row lock serialises concurrent edge function instances.
create or replace function public.claim_geocoder_slot(p_interval_ms integer default 1100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot timestamptz;
begin
  if p_interval_ms < 1000 then
    raise exception using errcode = '22023', message = 'interval must be at least 1000 ms';
  end if;

  update public.geocoder_throttle
  set next_slot_at = greatest(next_slot_at, clock_timestamp())
    + make_interval(secs => p_interval_ms / 1000.0)
  where id = 1
  returning next_slot_at - make_interval(secs => p_interval_ms / 1000.0)
  into v_slot;

  return greatest(0, ceil(extract(epoch from (v_slot - clock_timestamp())) * 1000))::integer;
end
$$;

alter table public.place_lookups enable row level security;
alter table public.geocoder_throttle enable row level security;

revoke all on table public.place_lookups, public.geocoder_throttle
  from public, anon, authenticated;
revoke all on function public.claim_geocoder_slot(integer)
  from public, anon, authenticated;
grant execute on function public.claim_geocoder_slot(integer) to service_role;
