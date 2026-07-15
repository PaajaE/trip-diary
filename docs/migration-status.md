# Migration Status

**Last updated:** 2026-07-10  
**Reference plan:** [expo-mobile-implementation-plan.md](./expo-mobile-implementation-plan.md)  
**Product polish:** [stage-4-roadmap.md](./stage-4-roadmap.md)

> **Stage numbering:** This document tracks **Mobile Migration** stages. **Product Stage 4** (cross-platform polish) is tracked separately in [stage-4-roadmap.md](./stage-4-roadmap.md). The translation feature shipped as **Mobile Migration Stage 4** below.

---

## Validation baseline (latest combined run)

| Command                          | Result      | Count                           |
| -------------------------------- | ----------- | ------------------------------- |
| `pnpm format:check`              | **Passing** |                                 |
| `pnpm lint`                      | **Passing** |                                 |
| `pnpm typecheck`                 | **Passing** | Web                             |
| `pnpm test:packages`             | **Passing** | 82                              |
| `pnpm test`                      | **Passing** | 236 + 2 expected fail           |
| `pnpm exec vite build`           | **Passing** |                                 |
| `pnpm exec cap sync`             | **Passing** |                                 |
| `pnpm db:test`                   | **Passing** | **301** pgTAP tests             |
| `pnpm db:types`                  | **Passing** | Generated; matches manual patch |
| `pnpm --filter mobile typecheck` | **Passing** |                                 |
| `pnpm --filter mobile test`      | **Passing** | 170 (includes M3 journey map) |
| Android `assembleDebug`          | **Passing** | With autolinking patch          |
| Android JS bundle + first screen | **Passing** | Pixel_9a emulator               |
| Android authenticated checklist  | **Partial** | AVD GPS hang; camera on device TBD |
| iOS runtime smoke                | **Blocked** | CocoaPods                       |

---

## Product Stage 4 — Product polish: **In progress**

Cross-platform polish tracked in [stage-4-roadmap.md](./stage-4-roadmap.md).

| Wave | Item | Status |
| ---- | ---- | ------ |
| 1 | H5 Web root error boundary | ✅ Complete |
| 1 | M10 Fix stale Mapy test | ✅ Complete |
| 1 | H10 Neutral config schema | ✅ Complete |
| 1 | M15 Stage numbering docs | ✅ Complete |
| 2 | H1 Unified SQLite bootstrap | ✅ Complete |
| 2 | H2 Sync lifecycle wiring | ✅ Complete |
| 2 | M6 Real network state (NetInfo) | ✅ Complete |
| 2 | H3 Mobile navigation shell | ✅ Complete |
| 2 | H4 Shared mobile i18n | ✅ Complete |
| 2 | M2 Mobile sync status UI | ✅ Complete |
| 2 | M1 Offline journey list cache | ✅ Complete |
| 4 | M3 Map journey geography (mobile) | ✅ Complete |
| 3 | H7 Shared journey schemas in core | ✅ Complete |
| 3 | H6 Translation React Query (web) | ✅ Complete |
| 3 | M4 Translation repo in entities layer | ✅ Complete |
| 3 | M16 Translation status polling | ✅ Complete |
| 3 | M9 ESLint for packages + mobile | ✅ Complete |
| 3 | H9 Centralized web query-key factories | ✅ Complete |

---

## Mobile Migration Stage 4 — Czech-to-English translation: **Complete**

| Item                            | Implemented | Integrated | Auto-tested       | Device-tested | Blocked       |
| ------------------------------- | ----------- | ---------- | ----------------- | ------------- | ------------- |
| `entry_translations` + RLS      | ✅          | ✅         | ✅ pgTAP          | —             | —             |
| Stale trigger                   | ✅          | ✅         | ✅ pgTAP          | —             | —             |
| `translate-entry` Edge Function | ✅          | ✅         | ✅ (42 pkg tests) | —             | —             |
| Idempotency + auth              | ✅          | ✅         | ✅ pgTAP + unit   | —             | —             |
| Uniqueness constraint           | ✅          | ✅         | ✅ pgTAP          | —             | —             |
| `database.types.ts`             | ✅          | ✅         | ✅ generated      | —             | —             |
| Web translation UI/repo         | ✅          | ✅         | ✅ (23 tests)     | —             | —             |
| Paid provider                   | ☐           | ☐          | —                 | —             | User decision |

---

## Mobile Migration Stage 3 — Expo PoC: **Implementation complete — hardware validation pending**

See [mobile-device-validation-results.md](./mobile-device-validation-results.md).

| Item                            | Implemented | Auto-tested | Android device-tested     | iOS   |
| ------------------------------- | ----------- | ----------- | ------------------------- | ----- |
| Prebuild iOS/Android            | ✅          | ✅          | —                         | —     |
| Android APK + dev client        | ✅          | ✅          | ✅ Launcher + bundle      | —     |
| JS bundle (Metro monorepo)      | ✅          | ✅          | ✅ HTTP 200, 1314 modules | —     |
| Startup / env / auth init       | ✅          | ✅          | ✅ Sign-in screen         | —     |
| Sign-in / session restore       | ✅          | ✅ (unit)   | ✅                        | —     |
| Journey list/detail + offline   | ✅          | ✅          | ✅                        | —     |
| MapLibre + Mapy tourist         | ✅          | ✅          | ✅ outdoor mapset fix     | —     |
| Photo / sync on device          | ✅          | ✅          | ✅ Queue hardened; upload device TBD | —     |
| OSM fallback on device          | ✅          | ✅          | ✅ missing key (dev UI)   | —     |

**Android Stage 3 findings (finalized for runtime gate):**

1. Monorepo Metro must pin `react@18` — web `react@19` caused duplicate-React redbox.
2. `_layout.tsx` side-effect imports must not throw at module load (broke route registration → `useAuth` outside provider).
3. Mapy `mapy-tourist` used wrong mapset path (`/tourist/` → **404**); fixed to `/outdoor/` per [Mapy docs](https://developer.mapy.com/rest-api-mapy-cz/function/map-tiles/).
4. 16 KB page-size system dialog on Pixel_9a is non-blocking (compatible mode).
5. Mobile sync queue: `status_updated_at` column auto-migrated; stale `processing` recovery at 5 min; EXIF `capturedAt` normalization; 8 MiB pre-upload check.

**Stage 7:** Blocked until iOS parity run and physical-device photo/GPS/camera validation.

---

## Mobile Migration Stage 5 — Mobile foundation: **In progress** (provisional)

| Item              | Implemented | Auto-tested | Device-tested (Android) |
| ----------------- | ----------- | ----------- | ----------------------- |
| Error boundary    | ✅          | ✅          | ✅ No crash on startup  |
| Env validation    | ✅          | ✅          | ✅                      |
| Query client      | ✅          | ✅          | ✅ (shell loads)        |
| Logger            | ✅          | ✅          | —                       |
| Theme tokens      | ✅          | ✅          | ✅ Sign-in styling      |
| SQLite migrations | ✅          | ✅          | ✅ Unified bootstrap + upgrade tests |
| Auth lifecycle    | ✅          | ✅          | ✅ Sign-in + session    |
| Dev checklist     | ✅          | —           | ✅ Photo/sync helpers   |
| Navigation shell  | ✅          | ✅          | Route groups + native headers |
| Mobile i18n       | ✅          | ✅          | `@trip-diary/i18n` + locale persistence |
| Sync status UI    | ✅          | ✅          | Header indicator + detail sheet; unit-tested |

---

## Mobile Migration Stage 6 — Journey vertical slice: **In progress**

| Item                    | Implemented | Auto-tested | Device-tested (Android) |
| ----------------------- | ----------- | ----------- | ----------------------- |
| Journey list/detail API | ✅          | ✅          | ✅                      |
| Pull-to-refresh         | ✅          | —           | ✅ (online restore)     |
| Offline cache path      | ✅          | ✅          | ✅                      |
| Map section on detail   | ✅          | ✅          | ✅ Tiles render; M3 adds journey stop markers (unit-tested) |

---

## User action list (remaining gates)

### 1. Physical device validation

Use [mobile-physical-device-checklist.md](./mobile-physical-device-checklist.md) for GPS, camera EXIF, and full OSM Metro restart test.

### 2. Android location on AVD

Mock GPS injected; `getCurrentPositionAsync` hung on Pixel_9a — validate on physical device.

### 3. iOS CocoaPods

`sudo gem install cocoapods` → `cd apps/mobile/ios && pod install` → `npx expo run:ios`

### 4. Translation provider (optional)

`TRANSLATION_API_KEY` in Supabase Edge secrets only — see [translation-provider-contract.md](./translation-provider-contract.md)

---

## Decision log (this session)

| Date       | Decision                                                                 |
| ---------- | ------------------------------------------------------------------------ |
| 2026-07-10 | Android JS bundle fixed: Metro `resolveRequest` pins React 18            |
| 2026-07-10 | `_layout.tsx` fixed: removed module-load ErrorUtils side effect          |
| 2026-07-10 | Android checklist: sign-in, journeys, offline cache, photo, sync device-tested |
| 2026-07-10 | Mapy 404 root cause: wrong mapset (`tourist` → `outdoor`); tiles render on device |
| 2026-07-10 | Mobile upload hardening: EXIF normalization, stale queue recovery, concurrency guard, 8 MiB pre-check |
