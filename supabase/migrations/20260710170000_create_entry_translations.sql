create type public.translation_status as enum (
  'pending',
  'processing',
  'succeeded',
  'failed',
  'stale'
);

create table public.entry_translations (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries (id) on delete cascade,
  source_locale public.entry_language not null default 'cs',
  target_locale public.entry_language not null default 'en',
  translated_title text,
  translated_body text not null default '',
  status public.translation_status not null default 'pending',
  provider text,
  model text,
  source_content_hash text,
  source_version bigint,
  is_manually_edited boolean not null default false,
  error_message text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint entry_translations_unique_target unique (entry_id, target_locale),
  constraint entry_translations_translated_title_length_check check (
    translated_title is null or char_length(translated_title) between 1 and 160
  ),
  constraint entry_translations_translated_body_length_check check (
    char_length(translated_body) <= 50000
  ),
  constraint entry_translations_source_version_positive_check check (
    source_version is null or source_version > 0
  )
);

create index entry_translations_entry_id_idx
  on public.entry_translations (entry_id);

create index entry_translations_status_idx
  on public.entry_translations (status);

create trigger set_entry_translations_updated_at
before update on public.entry_translations
for each row
execute function public.set_updated_at();

alter table public.entry_translations enable row level security;

create policy "Authors read translations for their entries"
on public.entry_translations
for select
to authenticated
using (
  exists (
    select 1
    from public.entries e
    where e.id = entry_translations.entry_id
      and e.creator_id = (select auth.uid())
  )
);

create policy "Authors insert translations for their entries"
on public.entry_translations
for insert
to authenticated
with check (
  exists (
    select 1
    from public.entries e
    where e.id = entry_translations.entry_id
      and e.creator_id = (select auth.uid())
  )
);

create policy "Authors update translations for their entries"
on public.entry_translations
for update
to authenticated
using (
  exists (
    select 1
    from public.entries e
    where e.id = entry_translations.entry_id
      and e.creator_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.entries e
    where e.id = entry_translations.entry_id
      and e.creator_id = (select auth.uid())
  )
);

create policy "Authors delete translations for their entries"
on public.entry_translations
for delete
to authenticated
using (
  exists (
    select 1
    from public.entries e
    where e.id = entry_translations.entry_id
      and e.creator_id = (select auth.uid())
  )
);

revoke all on table public.entry_translations from public, anon, authenticated;
grant select, insert, update, delete on table public.entry_translations to authenticated;
