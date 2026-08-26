-- Add video variant enum value (must commit before use in constraints).

alter type public.photo_variant_type add value if not exists 'video';
