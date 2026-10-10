-- Phase 4 editing, part 1: a rejected suggestion keeps its row.
--
-- A new enum value cannot be used in the transaction that adds it, so the
-- constraint change lives in the next migration (20261010120100).
-- Clients show segments with origin <> 'rejected'; automation must skip them
-- (not implemented here).

alter type public.content_origin add value if not exists 'rejected';
