-- Phase 5: v2 tree nodes can receive hearts and comments. New enum values live in
-- their own migration because they cannot be used in the transaction that adds them.
alter type public.content_target_type add value if not exists 'segment';
alter type public.content_target_type add value if not exists 'moment';
alter type public.content_target_type add value if not exists 'media';
