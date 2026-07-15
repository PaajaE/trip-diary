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
| 13  | Missing / malformed EXIF     | Pick image without EXIF date or use camera with no timestamp                                         | Log shows `EXIF capturedAt: null`; upload still `synced`; `photos.captured_at` is null                             | ☐      |
| 14  | Camera capture persist       | Dev checklist → Capture photo + persist                                                              | Photo saved; persists after app restart                                                                            | ☐      |
| 15  | Camera photo upload          | Capture photo → enqueue → process                                                                    | Same as #12 with camera source                                                                                     | ☐      |
| 16  | Camera EXIF GPS              | Capture outdoors or with GPS enabled                                                                 | EXIF latitude/longitude non-null when device provides them                                                         | ☐      |
| 17  | Normal image under limit     | Image &lt; 8 MiB (8 388 608 bytes)                                                                   | Staged size shown in dev checklist; upload `synced`                                                                | ☐      |
| 18  | Oversized image              | Use image &gt; 8 MiB if available                                                                    | Process fails with message containing limit + actual size; `retryable=false`; **Retry last upload** refuses        | ☐      |
| 19  | Oversized not retried        | After #18, tap **Retry last upload**                                                                 | Terminal failure message; operation stays `failed`                                                                 | ☐      |
| 20  | Stale queue recovery         | Enqueue upload → Process (starts `processing`) → **kill app** before completion → relaunch → Process | Stale op returns to `pending` within ~5 min (or immediately if killed long enough); eventually `synced`            | ☐      |
| 21  | Offline enqueue              | Airplane mode → pick/capture → enqueue upload                                                        | Operation stays `pending`; local file remains                                                                      | ☐      |
| 22  | Online retry upload          | Disable airplane mode → **Process sync queue** (or **Retry last upload** for retryable failures)     | Operation becomes `synced`; remote path logged                                                                     | ☐      |
| 23  | Storage object exists        | Supabase dashboard → Storage → `photos`                                                              | Object at logged path exists for signed-in user                                                                    | ☐      |
| 24  | Retry idempotency            | Reset retryable failed op to pending → process again                                                 | **Same** storage path; no duplicate object for same `photoId`                                                      | ☐      |
| 25  | Offline journey cache        | Airplane mode → open cached journey                                                                  | Yellow offline banner; cached content shown                                                                        | ☐      |
| 26  | Network restore              | Disable airplane mode                                                                                | Offline banner clears; online refresh works                                                                        | ☐      |

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
- **Stale recovery:** `processing` older than 5 minutes reset to `pending` on next queue process
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

## Do not mark items passed until executed on physical hardware

Emulator results are documented separately in [mobile-device-validation-results.md](./mobile-device-validation-results.md).
