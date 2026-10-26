-- Phase 4f (ZS-D1): kind of a moment. Additive.
--
-- * stay      a place the group stayed at (default, all existing moments)
-- * point     a single-photo stop (a lone photo is valid evidence of presence)
-- * en_route  photos taken while travelling ("Cestou")
-- * Grants follow the other moments columns (core schema): column-level insert
--   and update for authenticated; row access is decided by the moments RLS
--   policies. Reads are covered by the table-level select grant.
-- * Not changed here: public RPCs build explicit JSON from named columns and do
--   not carry kind; RPCs that insert moments (create_moment_from_media, merge,
--   split) rely on the default 'stay'.

alter table public.moments
  add column kind text not null default 'stay';

alter table public.moments
  add constraint moments_kind_check check (kind in ('stay', 'point', 'en_route'));

grant insert (kind) on public.moments to authenticated;
grant update (kind) on public.moments to authenticated;
