-- Replace UCS-2BE iteration (unsupported in PostgreSQL) with ascii(substr(...))
-- matching JavaScript String.charCodeAt for BMP text (Czech/English entry content).
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
  code integer;
begin
  canonical := coalesce(p_title, '') || E'\n---\n' || coalesce(p_body, '');

  for index in 1..char_length(canonical) loop
    code := ascii(substr(canonical, index, 1));
    hash := (hash * 31 + code) & 4294967295;
  end loop;

  return lpad(to_hex(hash), 8, '0');
end;
$$;

revoke all on function public.compute_source_content_hash(text, text)
  from public, anon, authenticated;
