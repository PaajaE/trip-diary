create or replace function public.compute_source_content_hash(
  p_title text,
  p_body text
)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  canonical text;
  hash bigint := 0;
  index integer;
  character text;
  utf16 bytea;
  code integer;
begin
  canonical := coalesce(p_title, '') || E'\n---\n' || coalesce(p_body, '');

  for index in 1..char_length(canonical) loop
    character := substr(canonical, index, 1);
    utf16 := convert_to(character, 'UCS-2BE');
    code := get_byte(utf16, 0) * 256 + get_byte(utf16, 1);
    hash := (hash * 31 + code) & 4294967295;
  end loop;

  return lpad(to_hex(hash), 8, '0');
end;
$$;

create or replace function public.mark_entry_translations_stale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.title is not distinct from new.title
    and old.body is not distinct from new.body
    and old.version is not distinct from new.version then
    return new;
  end if;

  update public.entry_translations
  set status = 'stale'::public.translation_status
  where entry_id = new.id
    and status = 'succeeded'::public.translation_status
    and target_locale is distinct from source_locale;

  return new;
end;
$$;

revoke all on function public.compute_source_content_hash(text, text)
  from public, anon, authenticated;

revoke all on function public.mark_entry_translations_stale()
  from public, anon, authenticated;

create trigger mark_entry_translations_stale_after_update
after update on public.entries
for each row
execute function public.mark_entry_translations_stale();
