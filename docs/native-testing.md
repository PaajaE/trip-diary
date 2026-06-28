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
