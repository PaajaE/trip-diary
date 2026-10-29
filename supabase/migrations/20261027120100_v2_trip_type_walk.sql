-- Phase 4f (ZS-D2): city walk as a trip type. Additive.
--
-- The new enum label cannot be used in the same transaction that adds it, so
-- this migration only adds it. segments.trip_type grants and checks are
-- unchanged (the check only requires trip_type to be set for kind = 'trip').

alter type public.trip_type add value if not exists 'walk';
