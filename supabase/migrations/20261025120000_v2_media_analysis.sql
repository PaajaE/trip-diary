-- Phase 4e (D1): on-device image analysis results stored on media.
--
-- * phash: 49-bit dHash (8x7 comparisons, so it stays a safe JS integer when
--   read back through PostgREST; stored in a bigint), used to derive "series of similar
--   photos" on the client. Series themselves are never stored.
-- * quality: small JSON object {v, sharp, exposure, eyesClosed?}, < 2 kB.
-- * Both columns are nullable, have no default and are NOT backfilled: NULL =
--   not analysed yet. No index (clusters are computed on the client).
-- * Grants follow the other media metadata (core schema): column-level insert
--   and update for authenticated. Row access is still decided by the media RLS
--   policies (insert: owner only; update: owner or journey editor).
-- * Public RPCs (get_public_journey) build explicit JSON objects from named
--   columns and do not expose these columns; nothing is changed there.

alter table public.media
  add column phash bigint,
  add column quality jsonb,
  add constraint media_quality_check check (
    quality is null
    or (jsonb_typeof(quality) = 'object' and pg_column_size(quality) < 2048)
  );

grant insert (phash, quality) on public.media to authenticated;
grant update (phash, quality) on public.media to authenticated;
