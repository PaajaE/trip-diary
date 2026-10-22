-- Day notes ("zapis dne"): one free-text note per journey and local day
-- (docs/plan-v2.md phase 4c, decision 9). Additive.
--
-- local_date is the calendar day in the journey's display time zone, chosen by
-- the client. Public exposure rule: get_public_journey returns a day note only
-- for public journeys, and only when at least one published moment starts on
-- that day (starts_at converted with the journey's home_tz, UTC when unset). Notes of days
-- without a published moment stay private to members.

create table public.day_notes (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys (id) on delete cascade,
  local_date date not null,
  body text not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint day_notes_journey_date_unique unique (journey_id, local_date),
  constraint day_notes_body_length_check check (char_length(body) between 1 and 20000)
);

create trigger set_day_notes_updated_at before update on public.day_notes
for each row execute function public.set_updated_at();

alter table public.day_notes enable row level security;

create policy "Journey members read day notes" on public.day_notes
for select to authenticated using (public.is_journey_member(journey_id));
create policy "Journey editors insert day notes" on public.day_notes
for insert to authenticated
with check (created_by = auth.uid() and public.can_edit_journey(journey_id));
create policy "Journey editors update day notes" on public.day_notes
for update to authenticated
using (public.can_edit_journey(journey_id))
with check (public.can_edit_journey(journey_id));
create policy "Journey editors delete day notes" on public.day_notes
for delete to authenticated using (public.can_edit_journey(journey_id));

revoke all on table public.day_notes from public, anon, authenticated;
grant select on table public.day_notes to authenticated;
grant insert (id, journey_id, local_date, body, created_by)
  on public.day_notes to authenticated;
grant update (local_date, body) on public.day_notes to authenticated;
grant delete on public.day_notes to authenticated;

-- ---------------------------------------------------------------------------
-- Public read model: add `dayNotes` (patched in place, like earlier migrations)
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_new text;
  v_sig text := 'public.get_public_journey(text, text)';
  v_anchor text := '    ''places'', coalesce((';
  v_add text := $add$
    'dayNotes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', dn.local_date,
        'body', dn.body
      ) order by dn.local_date)
      from public.day_notes dn
      join journey j on j.id = dn.journey_id
      where exists (
        select 1 from visible_moments vm
        where (vm.starts_at at time zone coalesce(j.home_tz, 'UTC'))::date = dn.local_date
      )
    ), '[]'::jsonb),
$add$;
begin
  v_def := pg_get_functiondef(v_sig::regprocedure);
  if position(v_anchor in v_def) = 0 then
    raise exception 'anchor not found in %', v_sig;
  end if;
  v_new := replace(v_def, v_anchor, v_add || v_anchor);
  if v_new = v_def or v_new not like '%''dayNotes''%' then
    raise exception 'dayNotes patch did not apply to %', v_sig;
  end if;
  execute v_new;
end
$$;
