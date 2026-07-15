# Mobile Platform Contracts (Stage 3 PoC)

These interfaces were validated in the Expo proof-of-concept. They inform Stage 7 storage/sync extraction but do **not** replace the web Dexie implementation yet.

**Device validation:** [mobile-device-validation-results.md](./mobile-device-validation-results.md) (Android 2026-07-10, signed-in session)

## Storage

### Database bootstrap (`apps/mobile/src/platform/storage/database.ts`)

All mobile SQLite access goes through one entry point:

```typescript
getMobileDatabase(): Promise<SQLiteDatabase>
initializeMobileDatabase(): Promise<SQLiteDatabase> // alias
```

- Opens `trip-diary.db` once per process
- Sets `PRAGMA foreign_keys = ON` and `journal_mode = WAL`
- Runs ordered migrations from `migrations.ts` before returning a connection
- Concurrent callers share one initialization promise
- After a failed initialization the in-flight promise is cleared; a later call retries

Schema version tracking uses `_schema_migrations (id, name, applied_at)`.

| Migration | Name                               | Purpose                                                          |
| --------- | ---------------------------------- | ---------------------------------------------------------------- |
| 1         | `create_journey_cache`             | Journey detail offline cache                                     |
| 2         | `create_sync_queue`                | Sync operation queue (base columns)                              |
| 3         | `add_sync_queue_status_updated_at` | Adds column if missing; backfills empty values from `created_at` |
| 4         | `create_journey_list_cache`        | Offline journey list per user                                    |
| 5         | `create_journey_stop_cache`        | Offline journey stop snapshot per user + journey                 |

**Upgrade guarantee:** Existing Stage 3 installations keep journey cache rows, queue operations, statuses, payloads, and non-empty `status_updated_at` values. Empty timestamps are backfilled from `created_at`. No app-data clear required.

**Adding a new table:** append migration `4+` in `migrations.ts`; do not call `openDatabaseAsync()` outside `database.ts`.

**M3 stop cache:** migration **5** stores one validated `JourneyStop[]` snapshot per `(user_id, journey_id)`. See [Journey stop cache](#journey-stop-cache-appsmobilesrcplatformstoragejourney-stop-cachets) below.

## Network state (`apps/mobile/src/foundation/network/`)

Product code reads network state through `NetworkProvider` / `useNetworkState()`. NetInfo is encapsulated in `createNetInfoNetworkStateProvider()`.

| Status    | Semantics                                                     |
| --------- | ------------------------------------------------------------- |
| `online`  | `isConnected === true` **and** `isInternetReachable === true` |
| `offline` | disconnected **or** explicit `isInternetReachable === false`  |
| `unknown` | connected but reachability not yet confirmed (`null`)         |

Sync processing waits until status is `online`. Unknown is treated conservatively as not online.

## Sync lifecycle (`apps/mobile/src/foundation/sync/`)

`SyncLifecycleProvider` (mounted in `app/_layout.tsx`) coordinates queue drains.

**Triggers:**

1. App launch once prerequisites are ready (`startup`)
2. App returns to foreground (`app_foreground`)
3. Network transitions to `online` (`network_online`)
4. Production enqueue via `enqueueSyncOperationForApp()` (`enqueue`)
5. Session becomes available after restore (via startup/network re-evaluation)

**Gating (all required):** app active, authenticated session, network online, database reachable.

**Drain rules:**

- Sequential processing via `drainSyncQueue(max=10)` per invocation
- Failed operations stay `failed`; reconnect does **not** auto-reset them (manual retry contract preserved)
- Retryable failures are not retried within the same drain
- Terminal failures do not block later pending operations
- Concurrent drain requests collapse through an in-flight guard

**Production enqueue:** use `enqueueSyncOperationForApp({ ..., userId })` from `platform/sync/enqueue-operation.ts`. Stores optional `enqueuedByUserId` for ownership checks at upload time.

**Observability (M2 prep):** `useSyncCoordinatorSnapshot()` exposes phase, pending/failed counts, last drain metadata.

**Deferred:** background fetch, headless tasks, automatic failed→pending reset, sync status UI.

Device note: lifecycle integration is auto-tested; not hardware-validated in this wave.

## Navigation (`app/` + `foundation/navigation/`)

Expo Router uses two route groups:

| Group    | Path examples                                      | Guard                                   |
| -------- | -------------------------------------------------- | --------------------------------------- |
| `(auth)` | `/sign-in`                                         | Redirects to `/` when session exists    |
| `(app)`  | `/`, `/journey/[id]`, `/dev-checklist` (`__DEV__`) | Redirects to `/sign-in` when signed out |

Auth ownership: `resolveAuthNavigation()` in `(auth)/_layout.tsx` and `(app)/_layout.tsx`. Screens do not duplicate redirect logic.

Headers: native stack titles via `Stack.Screen` options; journey detail sets title from loaded journey name. Shared styling in `appStackScreenOptions`.

Deep links unchanged: `/`, `/sign-in`, `/journey/:id`.

## Localization (`foundation/i18n/`)

| Piece               | Role                                              |
| ------------------- | ------------------------------------------------- |
| `@trip-diary/i18n`  | Single translation source (same keys as web)      |
| `I18nProvider`      | Loads persisted/device locale, wraps app          |
| `locale-storage.ts` | AsyncStorage persistence (`trip-diary.locale`)    |
| `expo-localization` | Device language detection (`cs` vs fallback `en`) |

Product screens use `useTranslation()`. Configuration errors before providers mount read `en` directly.

Formatting: `@trip-diary/utils` — `formatJourneyDateRange`, `formatLocalizedDate`, `resolveDateLocale`.

## Sync status UI (`apps/mobile/src/features/sync/`)

Authenticated screens show a compact header indicator via `SyncStatusHeaderButton` (wired in `(app)/_layout.tsx`).

**User-facing states (priority):**

1. Failed items need attention
2. Synchronizing
3. Waiting for internet (with pending items)
4. Changes waiting to sync
5. Waiting for sign-in
6. All changes synchronized

**Detail sheet shows:** status label, next-step explanation, pending/failed counts, localized last-sync time, safe error copy, contextual guidance, retry when applicable.

**Retry:** `resetRetryableFailedOperations()` resets only `retryable !== false` failures to `pending`, then requests one `manual_retry` drain. Terminal failures stay failed. Retry disabled while processing.

**Not exposed to users:** queue payloads, local URIs, raw API/JWT errors (raw errors only in `__DEV__`).

Device note: sync status UI is unit-tested; not hardware-validated.

**Deferred:** per-operation browser, cancellation, background sync, automatic backoff.

### Journey cache (`apps/mobile/src/platform/storage/sqlite.ts`)

Domain type: `@trip-diary/core` `JourneyHeader` (alias `CachedJourney` in mobile storage).

SQLite persists legacy snake_case JSON via `serializeJourneyHeaderToLegacyCachePayload`; reads accept pre-H7 payloads through `safeParseJourneyHeaderPayload`.

```typescript
cacheJourney(journey: JourneyHeader): Promise<void>
getCachedJourney(journeyId: string): Promise<JourneyHeader | null>
clearJourneyCache(journeyId: string): Promise<void>
```

| Status        | Android (2026-07-10)                                           |
| ------------- | -------------------------------------------------------------- |
| Implemented   | ✅                                                             |
| Auto-tested   | ✅ (mocked SQLite)                                             |
| Device-tested | ✅ Offline banner + **Kanada 2026** from cache (airplane mode) |

### Journey list cache (`apps/mobile/src/platform/storage/journey-list-cache.ts`)

Migration **4** — `journey_list_cache` table: one row per journey per authenticated user.

| Column                  | Purpose                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `user_id`, `journey_id` | Composite primary key; isolates cache by account                                       |
| `payload`               | JSON legacy snake_case wire format validated into `@trip-diary/core` `JourneyListItem` |
| `sort_order`            | Preserves remote list order                                                            |
| `cached_at`             | Snapshot freshness marker (ISO string)                                                 |

```typescript
readCachedJourneyList(userId: string): Promise<CachedJourneyListSnapshot>
replaceCachedJourneyList(userId: string, journeys: JourneyListItem[]): Promise<void>
clearCachedJourneyListForUser(userId: string): Promise<void>
```

**Why one row per journey (not one blob per user):** supports replace-by-snapshot (delete all rows for user, insert fresh set), removes stale journeys when remote list shrinks, and skips corrupt individual rows without failing the whole list.

**Cache/network read strategy (`loadJourneyList` + `useJourneysQuery`):**

1. Hydrate SQLite cache into React Query immediately when rows exist (fast paint).
2. When online, fetch remote list; success replaces SQLite + visible data.
3. When offline or refresh fails with existing cache, retain saved journeys and show localized banner.
4. When offline with no cache, show offline-unavailable — not “no journeys”.
5. When remote returns an empty list successfully, clear cached rows and show real empty state.

**Account isolation:** all reads/writes scoped by `session.user.id`. Query key: `journeyQueryKeys.list(userId)`. Sign-out does not clear SQLite (cache may serve the same user on re-sign-in). Switching accounts uses a different query key so the previous user’s list is never shown.

**Journey detail interaction:** list and detail caches are independent. A cached list item may open a journey whose detail is not cached; detail screen shows existing offline-unavailable state. No transactional coupling in M1.

**Deferred:** automatic cache eviction, background refresh, pagination.

| Status        | Notes                                                            |
| ------------- | ---------------------------------------------------------------- |
| Implemented   | ✅                                                               |
| Auto-tested   | ✅ migration upgrade, repository isolation, hook semantics, i18n |
| Device-tested | ☐ Not hardware-validated in this slice                           |

### Journey stop cache (`apps/mobile/src/platform/storage/journey-stop-cache.ts`)

Migration **5** — `journey_stop_cache` table: one snapshot row per journey per authenticated user.

| Column                  | Purpose                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `user_id`, `journey_id` | Composite primary key; isolates cache by account                                    |
| `payload`               | JSON array of validated `@trip-diary/core` `JourneyStop` objects (camelCase domain) |
| `cached_at`             | Snapshot freshness marker (ISO string)                                              |

```typescript
readCachedJourneyStops(userId: string, journeyId: string): Promise<CachedJourneyStopsSnapshot>
replaceCachedJourneyStops(userId: string, journeyId: string, stops: JourneyStop[]): Promise<void>
clearCachedJourneyStopsForUser(userId: string, journeyId: string): Promise<void>
```

**Data source:** Supabase `journey_stops` via `fetchJourneyStopsRemote` — selects `id, stage_id, title, notes, status, map_latitude, map_longitude, position`, ordered by `position`. Rows map through `parseJourneyStopFromRemoteRecord` in `@trip-diary/core`; malformed rows and duplicate IDs are skipped (dev-only diagnostics). Null or invalid coordinates remain in the stop list but are excluded from map markers.

**Cache/network read strategy (`loadJourneyStops` + `useJourneyStopsQuery`):**

1. Hydrate SQLite cache into React Query when rows exist (fast paint).
2. When online, fetch remote stops; success replaces SQLite snapshot.
3. When offline or refresh fails with existing cache, retain saved stops and show localized banner.
4. When offline with no cache, show “map data unavailable offline” — **not** device location as a journey substitute.
5. When remote returns an empty list successfully, clear cached stops and show authoritative empty state.

**Query key:** `journeyQueryKeys.stops(userId, journeyId)`. Invalidation on reconnect; pull-to-refresh on journey detail refetches header and stops together. Future stop editing should invalidate this key.

**Account isolation:** all reads/writes scoped by `session.user.id`. Query key includes user ID to prevent account-switch leakage.

**Journey header interaction:** stops are intentionally separate from `JourneyHeader` / detail cache. Detail header and map geography can refresh independently.

| Status        | Notes                                                                            |
| ------------- | -------------------------------------------------------------------------------- |
| Implemented   | ✅ M3                                                                            |
| Auto-tested   | ✅ repository, cache, presentation, camera helper, MapViewScreen location policy |
| Device-tested | ☐ Not hardware-validated in M3                                                   |

## Sync queue (`apps/mobile/src/platform/sync/queue.ts` + `photo-upload.ts`)

```typescript
enqueueSyncOperation({ id, operationType, payload }): Promise<SyncOperation>
processNextSyncOperation(): Promise<SyncProcessResult | null>
recoverStaleProcessingOperations(thresholdMs?, excludeOperationIds?): Promise<number>
getSyncOperation(operationId): Promise<SyncOperation | null>
```

| Operation type  | Behavior                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| `photo.upload`  | Size check → normalize `capturedAt` → upsert `photos` + `photo_variants` → Storage upload → `synced` |
| `journey.touch` | Legacy no-op marker (PoC)                                                                            |

**Photo upload payload:** `photoId` (UUID), `journeyId`, `localUri`, `mimeType`, `originalFilename`, `width`, `height`, `byteSize`, optional `capturedAt`, optional `variant` (default `preview`).

**Storage:** bucket `photos`, path `{userId}/{photoId}/preview.jpg` (or `.webp`). Upload uses authenticated session + `upsert: true` for retry idempotency.

**Bucket file size limit:** `8_388_608` bytes (8 MiB) from `supabase/migrations/20260609000300_create_photos.sql`, exported as `PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES` in `photo-storage-limits.ts`. Mobile checks persisted file size **before** reading into a `Blob`; oversize failures are terminal (`retryable: false`).

### `capturedAt` normalization (`normalize-captured-at.ts`)

| Input                               | Output                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Valid ISO-8601                      | Canonical `toISOString()`                                                                                 |
| EXIF `YYYY:MM:DD HH:mm:ss`          | Local wall-clock components → `Date` → `toISOString()` (aligned with web `new Date(value).toISOString()`) |
| Missing / invalid / impossible date | `null` (upload continues)                                                                                 |

No fabricated timezone: EXIF strings without offset are interpreted as device-local wall clock, then stored as UTC ISO — same semantics as web `normalizeCapturedAt`.

### Stale `processing` recovery

SQLite column `status_updated_at` on `sync_queue` (migration 3).

| Constant                        | Value     | Rationale                                                                            |
| ------------------------------- | --------- | ------------------------------------------------------------------------------------ |
| `STALE_PROCESSING_THRESHOLD_MS` | 5 minutes | Longer than a slow preview upload; short enough to recover after app kill mid-upload |

On each `processNextSyncOperation()` call, operations in `processing` with `status_updated_at` older than the threshold are reset to `pending`, except the operation currently being processed in the same invocation.

### Concurrency guard

`processNextSyncOperation()` chains work on a module-level promise so concurrent callers cannot upload the same operation twice.

### Error classification (`classifySupabaseError`)

| Non-retryable (terminal)                                               | Retryable                                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| Invalid UUID / malformed payload                                       | Network unavailable                                          |
| Postgres constraint / invalid timestamp (`22P02`, `22007`, `235xx`, …) | Timeout / transient 5xx                                      |
| Storage file-size rejection (local pre-check or HTTP 413)              | Expired / invalid JWT (401)                                  |
| RLS / permission denial (403)                                          | Unknown errors (insufficient structure — documented default) |
| Missing local file                                                     |                                                              |

| Status        | Android (2026-07-10)                                                        |
| ------------- | --------------------------------------------------------------------------- |
| Implemented   | ✅ Real Storage upload via sync queue + hardening                           |
| Auto-tested   | ✅ `photo-upload.test.ts`, `queue.test.ts`, `normalize-captured-at.test.ts` |
| Device-tested | ☐ Requires physical device + online Supabase                                |

## Maps (`@trip-diary/maps` + `MapViewScreen.tsx`)

```typescript
resolveMapStyle({ apiKey, language, defaultProvider, fallbackOrder }): ResolvedMapStyle
computeJourneyStopMapCamera(points): JourneyMapCamera | null // @trip-diary/utils
```

**Journey detail map (M3):** `JourneyMapSection` loads validated stops, computes camera via `computeJourneyStopMapCamera`, and passes `markers` + `camera` to `MapViewScreen`. Journey mode does **not** request device location or fall back to world view when stops are missing.

**MapViewScreen props (intent-explicit):**

| Prop                        | Role                                                  |
| --------------------------- | ----------------------------------------------------- |
| `markers`                   | Validated journey stop markers (`PointAnnotation`)    |
| `camera`                    | Center+zoom (one stop) or bounds fit (multiple stops) |
| `useDeviceLocationFallback` | Explicit opt-in for dev/location flows only           |
| `latitude` / `longitude`    | Optional fixed center when not in journey mode        |

**Camera semantics:** one stop → center at zoom 12; multiple stops → bounds with padding, max zoom 14, antimeridian handled via longitude unwrapping in `@trip-diary/utils`. Identical coordinates use a small pad around the point.

**Markers:** planned = hollow ring; visited = filled dot. Status and title exposed via callout title + accessibility label (`mobile.journeyMapStopLabel`).

**Empty/offline/error:** localized states in `JourneyMapSection` — loading, no stops, stops without coordinates, offline without cache, offline/cached banner, refresh failed with cache, safe remote error + retry.

| Status        | Android (2026-07-10)                                                        |
| ------------- | --------------------------------------------------------------------------- |
| Implemented   | ✅ Journey stop markers + camera (M3); tiles via MapLibre                   |
| Auto-tested   | ✅ provider resolution, camera helper, location policy, presentation states |
| Device-tested | ✅ MapLibre renders tiles; stop markers **not** hardware-validated in M3    |

Runtime style failure → OSM via `onDidFailLoadingMap` in `MapViewScreen` (`fallback-runtime`). Raster source TileJSON errors may not trigger this callback — deferred to Stage 4.

## Media (`apps/mobile/src/platform/media/photo.ts`)

```typescript
pickPhoto(): Promise<PickedPhoto | null>
capturePhoto(): Promise<PickedPhoto | null>
persistPhotoLocally(sourceUri, filename): Promise<string>
getCurrentLocation(): Promise<{ latitude, longitude } | null>
normalizePhotoCapturedAt(value): string | null
```

| Status        | Android (2026-07-10)                                                              |
| ------------- | --------------------------------------------------------------------------------- |
| Implemented   | ✅                                                                                |
| Auto-tested   | ✅                                                                                |
| Device-tested | ✅ Pick + persist; EXIF/GPS **null** on emulator asset; location **failed** (AVD) |

## Auth (`apps/mobile/src/platform/auth/AuthProvider.tsx`, `supabase.ts`)

| Status        | Android (2026-07-10)                                     |
| ------------- | -------------------------------------------------------- |
| Implemented   | ✅                                                       |
| Auto-tested   | ✅                                                       |
| Device-tested | ✅ Sign-in, session restore on cold start, sign-out link |

## Environment (`apps/mobile/src/foundation/env/validate-expo-public-env.ts`)

| Status        | Android (2026-07-10) |
| ------------- | -------------------- |
| Implemented   | ✅                   |
| Auto-tested   | ✅                   |
| Device-tested | ✅ Valid `.env` path |

## Dev-only validation surface

`app/dev-checklist.tsx` — linked from home when `__DEV__` — exercises photo, location, and sync queue on device. Shows staged byte size vs Storage limit; oversized failures log `retryable=false`.

## Stage 3 gate status

| Gate                        | Status                                         |
| --------------------------- | ---------------------------------------------- |
| Android JS runtime          | ✅ Pass                                        |
| Android authenticated flows | ✅ Pass (physical GPS/camera/upload pending)   |
| iOS runtime                 | 🚫 Blocked on CocoaPods                        |
| Contracts finalized         | **Provisional** until physical-device sign-off |

## Non-goals in PoC (Stage 4+)

- Shared `packages/sync` extraction
- Parity with web `sync.service.ts` operation types
- Automatic sync on network restore
- Image compression / multiple variants
- `entry_photos` linking
- Background workers / post-upload file cleanup
- Journey-list offline cache beyond detail
- Runtime Mapy TileJSON preflight
- iOS parity
- Capacitor code changes
- Production push notifications
