# Android physical device checklist

**Purpose:** Repeat Stage 3 validation on a real Android device where emulator limitations (no camera EXIF GPS, no real GPS hardware) do not apply.

**Prerequisites**

- Dev client or release build installed from `apps/mobile`
- `apps/mobile/.env` with valid `EXPO_PUBLIC_SUPABASE_*` and `EXPO_PUBLIC_MAPY_API_KEY`
- Metro running (`npx expo start --dev-client`) if using dev client
- Signed-in Supabase account with at least one journey
- Remote Supabase project has the `photos` Storage bucket and photo RLS migrations applied

## Checklist

| #   | Scenario                     | Steps                                                                                                | Pass criteria                                                                                                      | Result |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------ |
| 1   | App startup                  | Cold launch                                                                                          | No redbox; home or sign-in renders                                                                                 | ☐      |
| 2   | Session restore              | Kill app, relaunch                                                                                   | Still signed in                                                                                                    | ☐      |
| 3   | Journey list                 | Open home                                                                                            | Journeys load from API                                                                                             | ☐      |
| 4   | Journey detail               | Open any journey                                                                                     | Title, summary, dates, Map section                                                                                 | ☐      |
| 5   | MapLibre render              | Scroll to Map                                                                                        | Map shows tiles (not black canvas)                                                                                 | ☐      |
| 6   | Mapy tourist tiles           | With valid Mapy key                                                                                  | Attribution `mapy-tourist`; tiles load (outdoor mapset)                                                            | ☐      |
| 7   | OSM fallback (missing key)   | Remove `EXPO_PUBLIC_MAPY_API_KEY`, restart Metro, relaunch                                           | Attribution `osm · © OpenStreetMap`; usable map; log reason `fallback-missing-key`                                 | ☐      |
| 8   | OSM fallback (invalid key)   | Set key to `invalid`, restart Metro                                                                  | **Known gap:** config still selects Mapy; document if tiles fail                                                   | ☐      |
| 9   | Current location             | Dev checklist → Get current location                                                                 | Permission granted; lat/lon returned                                                                               | ☐      |
| 10  | Map centers on GPS           | Journey map (no journey coords in cache)                                                             | Map centers on device location + marker when GPS available; world view otherwise                                   | ☐      |
| 11  | Gallery photo with EXIF time | Pick a **real gallery photo** that has EXIF capture time                                             | Log shows non-null `EXIF capturedAt`; file under `files/photos/`                                                   | ☐      |
| 12  | Gallery upload (EXIF)        | Enqueue → Process sync queue                                                                         | Status `synced`; `Remote storage path: {userId}/{photoId}/preview.jpg`; `photos.captured_at` populated in Supabase | ☐      |
| 13  | Missing / truncated EXIF     | Pick image without EXIF date or use camera with no timestamp                                         | Log shows `EXIF capturedAt: null`; upload still `synced`; `photos.captured_at` is null                             | ☐      |
| 14  | Camera capture persist       | Dev checklist → Capture photo + persist                                                              | Photo saved; persists after app restart                                                                            | ☐      |
| 15  | Camera photo upload          | Capture photo → enqueue → process                                                                    | Same as #12 with camera source                                                                                     | ☐      |
| 16  | Camera EXIF GPS              | Capture outdoors or with GPS enabled                                                                 | EXIF latitude/longitude non-null when device provides them                                                         | ☐      |
| 17  | Normal image under limit     | Image &lt; 8 MiB (8 388 608 bytes)                                                                   | Staged size shown in dev checklist; upload `synced`                                                                | ☐      |
| 18  | Oversized image              | Use image &gt; 8 MiB if available                                                                    | Process fails with message containing limit + actual size; `retryable=false`; **Retry last upload** refuses        | ☐      |
| 19  | Oversized not retried        | After #18, tap **Retry last upload**                                                                 | Terminal failure message; operation stays `failed`                                                                 | ☐      |
| 20  | Stale queue recovery         | Enqueue upload → Process (starts `processing`) → **kill app** before completion → relaunch → Process | Orphaned `processing` resets on next drain and eventually `synced` without manual re-upload                        | ☐      |
| 21  | Offline enqueue              | Airplane mode → pick/capture → enqueue upload                                                        | Operation stays `pending`; local file remains                                                                      | ☐      |
| 22  | Online retry upload          | Disable airplane mode → **Process sync queue** (or **Retry last upload** for retryable failures)     | Operation becomes `synced`; remote path logged                                                                     | ☐      |
| 23  | Storage object exists        | Supabase dashboard → Storage → `photos`                                                              | Object at logged path exists for signed-in user                                                                    | ☐      |
| 24  | Retry idempotency            | Reset retryable failed op to pending → process again                                                 | **Same** storage path; no duplicate object for same `photoId`                                                      | ☐      |
| 25  | Offline journey cache        | Airplane mode → open cached journey                                                                  | Yellow offline banner; cached content shown                                                                        | ☐      |
| 26  | Network restore              | Disable airplane mode                                                                                | Offline banner clears; online refresh works                                                                        | ☐      |

## iOS travel-day production readiness (simulator or device)

**Goal:** Capture Reliability = 100% and no manual recovery for a full travel day.

**Platform note:** Prefer a physical iPhone when available. When the phone is unavailable, run on the **iOS Simulator** and mark GPS/Camera EXIF items as simulator-limited (not false passes).

| #   | Scenario                    | Steps                                                      | Pass criteria                                                                         | Result            |
| --- | --------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------- |
| T1  | Cold launch                 | Install Release/Debug → launch                             | Sign-in or home; no crash                                                             | ✅ Sim 2026-07-29 |
| T2  | Volume 50+ photos           | Attach 50+ photos across one or more moments in a day      | All photos reach Storage size &gt; 0, DB links, gallery; no missing/dupes/wrong order | ☐ Manual          |
| T3  | Camera + Library            | Mix camera captures and library picks                      | Both sources upload and appear in gallery                                             | ☐ Manual          |
| T4  | HEIC + JPG                  | Include HEIC (iPhone library) and JPG                      | HEIC converted/uploaded; JPG uploaded; both viewable                                  | ☐ Manual          |
| T5  | EXIF GPS end-to-end         | Photos with GPS (real device) or documented simulator null | Lat/lon preserved through upload → DB → map when present                              | ☐ Sim-limited     |
| T6  | Offline capture             | Airplane/offline → capture/pick → enqueue                  | Ops stay `pending`; local files kept; no data loss                                    | ☐ Manual          |
| T7  | Network flaps               | Toggle Wi-Fi/cellular/airplane mid-upload                  | Queue drains when online; no permanent stuck state without retryable reason           | ☐ Manual          |
| T8  | Force-kill during upload    | Start upload → force-quit app mid-flight                   | On relaunch, orphaned `processing` resets and resumes **without** manual re-upload    | ✅ Code + sim     |
| T9  | App restart                 | Kill and relaunch after pending uploads                    | Session restored; queue drains automatically                                          | ✅ Sim terminate  |
| T10 | Phone / Simulator reboot    | Reboot device/simulator with pending queue                 | After unlock/launch, queue resumes; no manual repair                                  | ✅ Sim reboot     |
| T11 | Upload resume / idempotency | Interrupt and resume same photo                            | Single Storage object path; no duplicate `entry_photos`                               | ✅ Unit-tested    |
| T12 | Public / gallery integrity  | Open in-app gallery + public web moment after sync         | Every captured photo visible; GPS markers when coords exist                           | ☐ Manual          |

**Success gates**

- **Capture Reliability = 100%:** every captured photo completes capture → metadata → upload → storage → DB link → gallery/public view.
- **No manual recovery required:** never re-upload or hand-repair sync after crash, restart, offline, or network interruption.

## Dev checklist upload sequence

1. Pick or capture photo (stages upload with real `photoId` + journey id)
2. Confirm staged byte size vs limit (`8388608` bytes) in UI hint
3. **Enqueue staged photo upload**
4. **Process sync queue**
5. Confirm `Remote storage path:` in on-screen log (no signed URLs or tokens)
6. Verify object in Supabase Storage dashboard

## Notes

- **Storage path convention:** `{userId}/{photoId}/preview.jpg` (canonical project format; not `journeys/...`)
- **Storage limit:** 8 MiB (`8388608` bytes) per `supabase/migrations/20260609000300_create_photos.sql`
- **EXIF dates:** `YYYY:MM:DD HH:mm:ss` normalized to ISO before upsert; invalid → `null`, upload continues
- **Orphan recovery:** After force-kill, the next queue drain resets orphaned `processing` rows immediately (no live in-process owner). The 5-minute stale threshold only protects an in-flight op owned by the current process.
- **Idempotency:** Retries use `upsert: true` on the same path; safe for duplicate queue processing
- **Terminal failures:** Missing file, malformed payload, oversize file, constraint/RLS errors → `retryable: false`
- **Mapy mapset:** Product “Tourist Map” uses API mapset id `outdoor`, not `tourist`.
- **Dev checklist:** Home → “PoC dev checklist” (`__DEV__` only).

## Log tags to watch

```
EXIF capturedAt:
Remote storage path:
Processed: photo-upload-
Failure:
retryable=
Photo exceeds Storage limit
```

## Do not mark items passed until executed on physical hardware or simulator as documented

Emulator/Android results are documented separately in [mobile-device-validation-results.md](./mobile-device-validation-results.md).
