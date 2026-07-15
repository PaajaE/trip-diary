# Stage 3 final report

**Date:** 2026-07-10  
**Scope:** Android Expo PoC (`apps/mobile`)  
**Reference:** [expo-mobile-implementation-plan.md §13](./expo-mobile-implementation-plan.md)

---

## 1. Acceptance criteria review

| # | Criterion (§13) | Status | Notes |
| --- | --- | --- | --- |
| 1 | Dev build on Android | ✅ Verified | Pixel_9a, `cz.tripdiary.app` |
| 2 | Sign in with Supabase | ✅ Verified | Manual sign-in |
| 3 | Session persists | ✅ Verified | Cold relaunch stays signed in |
| 4 | Journey list ≥1 | ✅ Verified | Novaaa, Kanada 2026 |
| 5 | Journey detail | ✅ Verified | Title, summary, dates, map |
| 6 | SQLite offline read | ✅ Verified | Airplane mode + cache banner |
| 7 | Mapy tourist when key set | ✅ Verified | `outdoor` mapset; tiles render |
| 8 | OSM when key unset | ✅ Verified | Config-time + dev checklist |
| 9 | Pick or capture photo | ⚠️ Partial | Gallery ✅; camera button wired, not E2E on AVD |
| 10 | GPS/timestamp metadata | ⚠️ Partial | Pipeline ✅; emulator asset null EXIF (expected) |
| 11 | Local file persist | ✅ Verified | `files/photos/` |
| 12 | Photo upload on reconnect | ⚠️ Hardened | Real Storage upload + EXIF/stale/size guards; **physical validation pending** |
| 13 | Current location | ⚠️ Partial | Permission flow ✅; `getCurrentPositionAsync` hung on AVD |
| 14 | Offline mutation queued | ✅ Verified | SQLite queue + upload/retry semantics (unit-tested) |

### Pre–physical-device hardening (2026-07-10)

| Fix | Status |
| --- | --- |
| `capturedAt` EXIF → ISO normalization | ✅ `normalizePhotoCapturedAt`; invalid → `null` |
| Stale `processing` recovery | ✅ `status_updated_at` + 5 min threshold |
| `processNextSyncOperation` concurrency guard | ✅ Module-level promise chain |
| Pre-upload 8 MiB size check | ✅ Before `Blob` read; terminal error |
| Permanent-error classification | ✅ Postgres codes, 403, 413, missing file |

### Classification

**Required before Stage 3 sign-off (Android)**

| Gap | Action |
| --- | --- |
| Photo upload (#12) | Physical device: gallery EXIF, oversize, stale recovery |
| Physical-device GPS (#13) | Checklist item 9 on hardware |
| Camera capture E2E (#9) | Checklist items 14–15 on hardware |

**Nice-to-have / Stage 4+**

| Item | Rationale |
| --- | --- |
| Journey-bound map pins from photo/stop data | Web `JourneyMap` feature; journey cache has no coordinates |
| Invalid-key runtime OSM (tile source 404/401) | `onDidFailLoadingMap` covers style-level failure only |
| Full gallery domain / thumbnails / entry linking | Web pipeline creates variants + `entry_photos` links |
| Automatic sync on network restore | Explicitly out of Stage 3 scope |
| Image compression / resizing | Deferred; oversize fails clearly instead |
| iOS simulator/device parity | Separate gate; CocoaPods blocked |
| Photo preview UI | Checklist says log/URI sufficient for PoC |

**Known emulator limitations**

| Item | Behavior |
| --- | --- |
| `getCurrentPositionAsync` | Hangs or times out on Pixel_9a despite mock GPS |
| Camera capture | Virtual camera needs scene/webcam; automation incomplete |
| Gallery EXIF GPS | Null on stock emulator images |
| 16 KB page-size dialog | Non-blocking compatible mode |

---

## 2. Map location UX

**Finding:** Unfinished PoC implementation — props existed but were unused; journey model has no lat/lon.

**Implemented (minimal):**

- `MapViewScreen` centers on `latitude`/`longitude` props when supplied.
- Otherwise requests device location (8s timeout); shows marker when available.
- Default world view when no center (emulator case).

Journey detail does not pass coordinates (not in `CachedJourney`). Map uses device location as PoC stand-in until Stage 6+ photo/stop data is available.

---

## 3. Runtime fallback

**Config-time:** Missing/empty Mapy key → OSM (`fallback-missing-key`). ✅

**Runtime:** `onDidFailLoadingMap` → OSM (`fallback-runtime`) when Mapy style fails to load. Implemented in `MapViewScreen`.

**Deferred to Stage 4:** Raster TileJSON/source failures (401/404 on valid-looking keys) are logged via MapLibre native `Logger` and do **not** reliably trigger `onDidFailLoadingMap`.

---

## 4. Physical-device checklist audit

[mobile-physical-device-checklist.md](./mobile-physical-device-checklist.md) — executable without further code changes.

New hardware-only scenarios: gallery EXIF upload, malformed EXIF, stale `processing` recovery, under/over 8 MiB limit, oversized non-retry.

---

## 5. Cleanup

| Kept | Removed |
| --- | --- |
| `__DEV__` one-line provider/reason logs | Full TileJSON URL logs (exposed API key) |
| Dev checklist UI log lines | Verbose `console.log(resolved)` objects |
| `__DEV__` dev checklist | — |

---

## 6. Sign-off recommendation

| Metric | Value |
| --- | --- |
| Android migration production-ready confidence | **~70%** — upload hardening complete; hardware validation + iOS remain |
| Stage 3 closable after physical-device validation? | **Yes, with documented exceptions** |

**Close Stage 3 when:**

1. Physical device confirms photo upload (#12) including EXIF, oversize, and stale recovery.
2. Physical device confirms GPS (#13) and camera (#9).
3. Checklist items recorded in [mobile-device-validation-results.md](./mobile-device-validation-results.md).

**Do not block Stage 3 on:** iOS CocoaPods, emulator GPS hang, runtime TileJSON source fallback, full web photo pipeline parity, compression, background sync.

**Stop implementation** after this hardening pass; await physical-device validation results before Stage 4.
