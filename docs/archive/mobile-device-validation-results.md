# Mobile device validation results

**Last updated:** 2026-07-29  
**Final report:** [stage-3-final-report.md](./stage-3-final-report.md)  
**Checklist:** [mobile-poc-checklist.md](./mobile-poc-checklist.md)  
**Physical device checklist:** [mobile-physical-device-checklist.md](./mobile-physical-device-checklist.md)  
**Emulator:** Pixel_9a (`emulator-5554`) · **iOS Simulator:** iPhone 17 Pro (`FEAFA6DF-492A-4972-8FFB-51EDB2ED8E5E`)

## Environment audit (mobile `.env`)

| Check                    | Result                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| Keys present             | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_MAPY_API_KEY` only |
| Forbidden server secrets | **None**                                                                                     |
| Env validation tests     | **Passing** (unit)                                                                           |

## Android build and Metro

| Item                    | Result      | Notes                                          |
| ----------------------- | ----------- | ---------------------------------------------- |
| Gradle `assembleDebug`  | ✅ Pass     | Monorepo autolinking patch                     |
| Metro bundle            | ✅ Pass     | HTTP 200; React 18 forced via `resolveRequest` |
| JS first screen         | ✅ Pass     | Sign-in → home after auth                      |
| 16 KB page-size warning | ⚠️ Observed | Non-blocking compatible mode                   |

## Mapy 404 investigation (root cause)

| Check                         | Result                                                                      |
| ----------------------------- | --------------------------------------------------------------------------- |
| API key sent                  | ✅ Yes — `apikey` query param on TileJSON URL                               |
| Auth without key              | `tourist` and `outdoor` both return **401** (key required)                  |
| `tourist/tiles.json` with key | **404** — mapset does not exist                                             |
| `outdoor/tiles.json` with key | **200** — Mapy “Tourist Map” product                                        |
| Mapy docs mapsets             | `basic`, **`outdoor`** (Tourist Map), `aerial`, `winter` — **no `tourist`** |

**Root cause:** Incorrect TileJSON path. Product id `mapy-tourist` was pointing at `/maptiles/tourist/`; Mapy REST API uses `/maptiles/outdoor/` for the tourist styling.

**Fix applied:** `packages/maps/src/providers.ts` — `MAPY_TOURIST_TILEJSON` now uses `outdoor` URL. Provider id remains `mapy-tourist` (product naming).

### Logs after fix (device)

```
[MapViewScreen] map provider: mapy-tourist
[MapViewScreen] resolution reason: primary
[MapViewScreen] tilejson url: https://api.mapy.com/v1/maptiles/outdoor/tiles.json?apikey=…&lang=cs
```

No `MapLibre error` / 404 after fix. Journey detail map renders world tiles (not black canvas).

## Android runtime checklist (device-tested 2026-07-10)

| #   | Scenario                        | Result              | Notes                                                                                                                       |
| --- | ------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | Startup (no redbox)             | ✅ Device-tested    | Sign-in / home render                                                                                                       |
| 2   | Environment validation          | ✅ Device-tested    | Valid `.env`; no configuration error screen                                                                                 |
| 3   | Supabase auth init              | ✅ Device-tested    | Client + redirect when session null                                                                                         |
| 4   | Sign-in                         | ✅ Device-tested    | User signed in; home lists journeys                                                                                         |
| 5   | Session restore                 | ✅ Device-tested    | Cold relaunch → still signed in (AsyncStorage)                                                                              |
| 6   | Journey list (API)              | ✅ Device-tested    | **Novaaa**, **Kanada 2026** from Supabase                                                                                   |
| 7   | Journey detail (API)            | ✅ Device-tested    | Title, summary, dates, Map section                                                                                          |
| 8   | SQLite offline read             | ✅ Device-tested    | Airplane mode → yellow offline banner + cached **Kanada 2026**                                                              |
| 9   | Network restore                 | ✅ Device-tested    | Airplane off → offline banner cleared; online detail reloads                                                                |
| 10  | MapLibre render                 | ✅ Device-tested    | Tiles visible after outdoor URL fix                                                                                         |
| 11  | Mapy tourist default            | ✅ Device-tested    | `mapy-tourist` attribution; TileJSON `outdoor`; no 404                                                                      |
| 12  | OSM fallback (missing key)      | ✅ Device-tested    | Dev checklist → `provider=osm`, `reason=fallback-missing-key`                                                               |
| 13  | OSM fallback (invalid key)      | ⚠️ Documented       | Non-empty invalid key still selects Mapy at config time; no auto-OSM                                                        |
| 14  | Style runtime fallback          | ☐ N/A               | Not wired in PoC UI                                                                                                         |
| 15  | Photo library pick              | ✅ Device-tested    | Emulator gallery image selected                                                                                             |
| 16  | Camera capture                  | ⚠️ Partial          | Button wired; emulator virtual camera needs manual/device validation                                                        |
| 17  | EXIF / GPS metadata             | ✅ Device-tested    | Pipeline runs; null on emulator test image (expected)                                                                       |
| 18  | Local file persist              | ✅ Device-tested    | `file://…/files/photos/dev-checklist-*.jpg`                                                                                 |
| 19  | Current location                | ⚠️ Partial          | Mock GPS injected (`adb emu geo fix`); `getCurrentPositionAsync` hung on AVD                                                |
| 20  | Map GPS center / marker         | ✅ Device-tested    | Device location centering when `useDeviceLocationFallback` (dev flows); journey detail uses stop geography (M3 unit-tested) |
| 21  | Sync queue enqueue              | ✅ Device-tested    | Upload ops enqueued via dev checklist                                                                                       |
| 21b | Sync lifecycle auto-drain       | ✅ Unit-tested      | NetInfo + AppState coordinator; not hardware-validated in Wave 2B                                                           |
| 21c | Sync status UI                  | ✅ Unit-tested      | Header indicator + detail sheet; not hardware-validated in Wave 2D                                                          |
| 21d | Journey list offline cache      | ✅ Unit-tested      | SQLite list cache + cache-first home screen; not device-validated (M1)                                                      |
| 21e | Journey stop map (M3)           | ✅ Unit-tested      | Stop fetch/cache, markers, camera; not device-validated                                                                     |
| 22  | Photo upload to Storage         | ☐ Not device-tested | Hardening applied (EXIF, stale recovery, 8 MiB pre-check); validate on physical device                                      |
| 23  | Sync retry                      | ✅ Unit-tested      | Retryable failures reset to pending; idempotent storage path                                                                |
| 24  | EXIF `capturedAt` normalization | ✅ Unit-tested      | EXIF → ISO; malformed → `null`; upload continues                                                                            |
| 25  | Stale `processing` recovery     | ✅ Unit-tested      | 5 min threshold; reset to `pending` on next process                                                                         |
| 26  | Oversized file pre-check        | ✅ Unit-tested      | Fails before Blob; `retryable=false`; limit 8388608 bytes                                                                   |

### Dev checklist helper

`app/dev-checklist.tsx` (linked from home in `__DEV__`) exercises photo, camera, location, OSM fallback resolution, and sync queue on device.

## iOS

| Item                         | Result               | Notes                                                                                                                             |
| ---------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| CocoaPods / Xcode workspace  | ✅ Available         | `ios/TripDiary.xcworkspace` builds                                                                                                |
| Simulator Debug build        | ✅ Pass (2026-07-29) | `DerivedData-Simulator` — **BUILD SUCCEEDED**                                                                                     |
| Simulator install + launch   | ✅ Pass              | iPhone 17 Pro (`FEAFA6DF…`); `cz.tripdiary.app` launched                                                                          |
| Force-kill → relaunch        | ✅ Pass              | `simctl terminate` + `launch`; process restarts                                                                                   |
| Simulator reboot → relaunch  | ✅ Pass              | `shutdown` + `boot` + `launch`; app starts without reinstall                                                                      |
| Orphan queue recovery (code) | ✅ Unit-tested       | Cold drain resets orphaned `processing` immediately (`queue.test.ts`)                                                             |
| Travel-day photo volume 50+  | ☐ Manual             | Requires interactive gallery/camera; checklist T2 in [mobile-physical-device-checklist.md](./mobile-physical-device-checklist.md) |
| Camera + Library / HEIC+JPG  | ☐ Manual / limited   | Simulator camera/EXIF GPS limited; re-run on physical iPhone when available                                                       |
| Offline + network flaps      | ☐ Manual             | Exercise via Network Link Conditioner / airplane on device                                                                        |
| Physical iPhone              | ☐ Unavailable        | Device offline at validation time; simulator used per plan                                                                        |

## Remaining blockers

1. **Interactive travel-day photo matrix on hardware** — 50+ photos, HEIC+JPG, EXIF GPS outdoors (simulator-limited).
2. **Offline / network-flap interactive pass** — needs manual Network Link Conditioner or physical radio toggles.
3. **GPS on AVD** — mock coordinates set; `expo-location` `getCurrentPositionAsync` did not return on emulator (validate on physical device).
4. **Runtime OSM fallback** — invalid key or tile failure does not switch style without Metro env change.

## Stage 3 / travel-capture recommendation

**Android PoC:** code-complete for Stage 3 scope — auth, journeys, offline SQLite, sync queue hardening, photo gallery + persist, Mapy tiles (after mapset fix), and config-time OSM fallback.

**iOS travel-capture (2026-07-29):** Simulator build/install/launch + crash/reboot relaunch verified. Critical **force-kill orphan queue recovery** fixed and unit-tested (no 5-minute wait after kill). Web/mobile `entry_photos` link semantics aligned. Remaining interactive photo-volume and GPS/HEIC scenarios stay on the physical-device checklist — do not claim Capture Reliability = 100% until T2–T7/T11–T12 are executed with real photos.

Use [mobile-physical-device-checklist.md](./mobile-physical-device-checklist.md) (Android table + iOS travel-day T1–T12) for final hardware sign-off.
