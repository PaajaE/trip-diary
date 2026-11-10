# Native release verification

## Prerequisites

- Use a reachable HTTPS Supabase project in `.env.local`.
- Run `pnpm native:assets` after changing the logo.
- Run `pnpm native:sync` before opening either platform project.

## iOS

1. Install full Xcode and select a signing team for `ios/App/App.xcodeproj`.
2. Run on a physical iPhone.
3. Create an account, then create an offline entry with multiple photos.
4. Confirm the photos are optimized locally and remain after restarting the app.
5. Reconnect on cellular and confirm automatic sync uploads pending entries.
6. Disable “Sync over mobile data” in the sync panel, add another offline
   entry, reconnect on cellular, and confirm automatic sync stays off until
   you tap manual sync.
7. Re-enable mobile-data sync (or reconnect on Wi-Fi) and confirm automatic
   sync completes.

### iOS: photo thumbnails (`MediaLibrary.getThumbnails`) — UNVERIFIED on device

Run on a physical iPhone with a library of about 300 assets, release build.

1. 300 assets, full access: time from opening the triage grid to the first 60
   thumbnails visible, and to all 300. Record both (and the device model).
2. Memory: Xcode memory gauge while scrolling through all 300; it must settle
   (no steady growth) and stay well below the jetsam limit.
3. iCloud-only asset ("Optimize iPhone Storage"): with `allowNetwork` off it is
   `unavailable` (placeholder, no download, no spinner stuck); with it on it loads.
4. Limited access: select 10 photos, request ids of others; they come back
   `unavailable`, the call does not fail. Access denied -> `NOT_AUTHORIZED`.
5. Videos show the poster frame; HEIC, portrait (rotated) and screenshots are upright.
6. Second open of the grid is fast (cache reuse); `Caches/media-thumbs` holds
   `<sha1>-<size>.jpg` files; `deleteThumbnails` empties it; files older than
   7 days are purged on app launch.
7. Nothing is uploaded or written to the app's own database during triage.

## Android

1. Install JDK 21 and Android Studio with the current Android SDK.
2. Open `android/` and run on a physical device.
3. Repeat the iOS offline photo and Wi-Fi synchronization scenarios.
4. Confirm the Android back gesture follows navigation history.

## Shared acceptance

- Public entries, journeys, galleries, and approximate map points open correctly.
- Exact journey coordinates are not exposed to anonymous users.
- App icon, light splash, and dark splash use the Trip Diary visual identity.
- The app recovers safely if it is terminated during photo upload.
