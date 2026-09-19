# `@trip-diary/api`

Shared Supabase client factory and small remote helpers for web and mobile.

## Surface (scaffold)

- `createTripDiaryClient(options)` — platform-neutral `createClient` wrapper
- `invokeTranslateEntry(client, request)` — validated `translate-entry` invoke

Platform code owns env resolution and auth storage adapters:

- Web: `src/shared/api/supabase.ts`
- Mobile: `apps/mobile/src/platform/supabase.ts`

Do not move full repositories here yet — grow one shared remote surface at a time.
