-- Phase 4e (D4): search inside one journey.
--
-- Deliberate deviation from the plan text: no generated tsvector columns and
-- no GIN indexes. The data per journey is small (hundreds of moments, a few
-- thousand media), the search is scoped by journey_id (already indexed), and
-- the UX is "find a word I typed", i.e. a case- and accent-insensitive
-- substring match, which tsvector (word/prefix based) does not give. If a
-- journey ever outgrows this, a trigram index on search_normalize(...) can be
-- added without changing the RPC contract.
--
-- * Members only (is_journey_member). A stranger gets zero rows, no error.
-- * Unpublished moments are returned (member / owner view).
-- * Matching: search_normalize(text) = unaccent(lower(text)); LIKE
--   metacharacters in the user input are escaped, so '%' and '_' are literal.
-- * Sources: moments (title, body, place name), day_notes (body), media
--   (caption; status 'ready', not trashed). Days are local days in the
--   journey's home_tz (UTC when unset), same rule as journey_progress.
-- * No tables, no stored state.

create extension if not exists unaccent with schema extensions;

-- unaccent() is only STABLE; the two-argument form with a fixed dictionary
-- is safe to declare IMMUTABLE (the usual wrapper, also usable in indexes).
create or replace function public.search_normalize(p_text text)
returns text
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent', lower(p_text))
$$;

-- About 120 characters of p_text around the first match of the already
-- normalised needle p_nq. Whitespace is collapsed; '…' marks cut ends.
-- Normalisation may change the length of exotic characters, so the window is
-- approximate; it falls back to the start of the text when the match is not
-- found in the collapsed text.
create or replace function public.search_snippet(p_text text, p_nq text)
returns text
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  with c as (
    select btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g')) as t
  ),
  w as (
    select c.t,
           greatest(strpos(public.search_normalize(c.t), p_nq) - 30, 1) as s
      from c
  )
  select case when w.s > 1 then '…' else '' end
         || substr(w.t, w.s, 120)
         || case when w.s + 120 <= char_length(w.t) then '…' else '' end
    from w
$$;

create or replace function public.search_journey(
  p_journey_id uuid,
  p_query text,
  p_limit int default 30
)
returns table (
  kind text,
  id uuid,
  local_date date,
  title text,
  snippet text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_q text;
  v_nq text;
  v_pat text;
  v_limit int;
  v_tz text;
begin
  v_q := regexp_replace(coalesce(p_query, ''), '^\s+|\s+$', '', 'g');
  if char_length(v_q) < 2 or char_length(v_q) > 100 then
    raise exception 'search_journey: query must have 2 to 100 characters'
      using errcode = '22023';
  end if;
  v_limit := least(greatest(coalesce(p_limit, 30), 1), 50);

  if p_journey_id is null or not public.is_journey_member(p_journey_id) then
    return;
  end if;
  select coalesce(j.home_tz, 'UTC') into v_tz
    from public.journeys j where j.id = p_journey_id;

  v_nq := public.search_normalize(v_q);
  v_pat := '%'
    || replace(replace(replace(v_nq, '\', '\\'), '%', '\%'), '_', '\_')
    || '%';

  return query
  select r.kind, r.id, r.local_date, r.title, r.snippet
    from (
      select 'moment'::text as kind,
             mo.id as id,
             (mo.starts_at at time zone v_tz)::date as local_date,
             coalesce(mo.title, pl.name) as title,
             public.search_snippet(
               case
                 when public.search_normalize(mo.body) like v_pat escape '\' then mo.body
                 when public.search_normalize(mo.title) like v_pat escape '\' then mo.title
                 else pl.name
               end,
               v_nq
             ) as snippet,
             1 as prio
        from public.moments mo
        left join public.places pl on pl.id = mo.place_id
       where mo.journey_id = p_journey_id
         and (public.search_normalize(mo.body) like v_pat escape '\'
              or public.search_normalize(mo.title) like v_pat escape '\'
              or public.search_normalize(pl.name) like v_pat escape '\')
      union all
      select 'day'::text,
             dn.id,
             dn.local_date,
             null::text,
             public.search_snippet(dn.body, v_nq),
             2
        from public.day_notes dn
       where dn.journey_id = p_journey_id
         and public.search_normalize(dn.body) like v_pat escape '\'
      union all
      select 'media'::text,
             md.id,
             (md.captured_at at time zone v_tz)::date,
             null::text,
             public.search_snippet(md.caption, v_nq),
             3
        from public.media md
       where md.journey_id = p_journey_id
         and md.status = 'ready'
         and md.deleted_at is null
         and public.search_normalize(md.caption) like v_pat escape '\'
    ) r
   order by r.prio, r.local_date, r.id
   limit v_limit;
end;
$$;

revoke all on function public.search_normalize(text) from public, anon, authenticated;
revoke all on function public.search_snippet(text, text) from public, anon, authenticated;
revoke all on function public.search_journey(uuid, text, int) from public, anon, authenticated;
grant execute on function public.search_journey(uuid, text, int) to authenticated;
