-- Phase 4f, DB contract wave 4 (part 1 of 2): media that is only FOUND.
--
-- Adds the enum value 'found' = a media row that exists from metadata alone
-- (captured_at, tz, GPS, ...), before any file is uploaded. Everything that
-- uses the value lives in 20261031120100_v2_media_found.sql.
--
-- Why a separate file: a value added with ALTER TYPE ... ADD VALUE cannot be
-- used (index predicates, constraints, SQL-language functions) in the same
-- transaction, and every migration file runs as one transaction.
--
-- Additive: no existing row has this value, no existing code writes it.

alter type public.media_status add value if not exists 'found';
