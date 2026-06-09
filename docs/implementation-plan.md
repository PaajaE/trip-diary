# Implementation Plan

## Delivery rules

- Each stage ends in a working vertical slice.
- Shared contracts, database schema, generated types, and design tokens are
  centrally reviewed before parallel work begins.
- Agents receive disjoint write scopes and must include tests.
- No stage advances while `pnpm check` or relevant Supabase security tests fail.

## Stages

1. Foundation: tooling, architecture, type safety, application shell, Supabase config.
2. Auth and profiles: email auth, public profiles, RLS, and E2E tests.
3. Offline entries: local repository, sync queue, standalone entries, public detail.
4. Photos: EXIF extraction, local variants, resilient upload, gallery.
5. Journeys: members, stages, stops, and guide sections.
6. Map and journey UX: clustering, timeline, planned and visited locations.
7. PWA and Capacitor: device storage, Wi-Fi sync, and physical-device testing.
