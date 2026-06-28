# Native build and install

Trip Diary ships as a Capacitor app: the same React UI runs inside a native
WebView on iOS and Android. Gallery photos with GPS and capture time only work
reliably in these native builds—not in mobile Safari or Chrome.

## Prerequisites

- Node.js 22, pnpm 11
- Production Supabase credentials in `.env.local` (phones cannot reach
  `127.0.0.1`):

  ```
  VITE_SUPABASE_URL=https://your-project.supabase.co
  VITE_SUPABASE_ANON_KEY=your-anon-key
  ```

- After any web code, env, or Capacitor plugin change:

  ```bash
  pnpm native:sync
  ```

## iOS (iPhone)

### Requirements

- Mac with full Xcode
- Apple ID (free works for personal device testing)
- Apple Developer Program ($99/year) only for TestFlight or App Store

### Install on your phone

1. Sync the web build into the iOS project:

   ```bash
   pnpm native:ios
   ```

2. In Xcode, open `ios/App/App.xcodeproj` if it is not already open.

3. Select the **App** target → **Signing & Capabilities** → choose your
   **Team**. Bundle ID: `cz.tripdiary.app`.

4. Connect your iPhone with USB (or use wireless debugging after pairing).

5. Select your iPhone as the run destination and press **Run** (▶).

6. On first launch, if iOS blocks the app: **Settings → General → VPN & Device
   Management** → trust your developer certificate.

### Free Apple ID limits

- Builds expire after about 7 days; reinstall from Xcode to refresh.
- For longer-lived installs and easy family distribution, use TestFlight with a
  paid Developer account.

### Permissions

The app requests:

- Photo library — attach travel photos with time and place
- **Location (when in use)** — fallback when photos have no GPS
- **Media location (Android only)** — read GPS from photo EXIF in the gallery
- Camera — optional, for capturing new photos

On Android, when picking photos the app will ask for location-related
permissions. Accept **Precise location** for “Use current location”, and allow
**media location** access so GPS can be read from gallery photos.

## Android

### Requirements

- JDK 21
- Android Studio with current Android SDK (min SDK 24)

### Install on your phone

1. Enable **Developer options** and **USB debugging** on the device.

2. Sync and open Android Studio:

   ```bash
   pnpm native:android
   ```

3. Connect the phone via USB, select it as the run target, and press **Run**.

4. If prompted on the phone, allow USB debugging for this computer.

### Share a debug APK (no Play Store)

```bash
pnpm native:sync
cd android && ./gradlew assembleDebug
```

Install `android/app/build/outputs/apk/debug/app-debug.apk` on any device. On
the phone, allow installation from unknown sources for the file manager or
browser you use.

For a longer-lived distributable build, create a release keystore and sign an
`assembleRelease` APK.

## Verify on device

Run through [native-testing.md](./native-testing.md):

1. Sign in with your production account.
2. Create a journey moment with multiple **gallery** photos that have GPS.
3. Confirm capture time and location are detected automatically.
4. Force-quit and reopen the app — photos and drafts should remain.
5. On cellular, confirm automatic sync runs (disable “Sync over mobile data”
   in the sync panel to opt out).
6. On Wi-Fi, confirm automatic sync runs as well.

## Troubleshooting

| Problem | Likely cause | Fix |
| ------- | ------------ | --- |
| Cannot sign in | `.env.local` points to localhost | Use production `VITE_SUPABASE_*` values, then `pnpm native:sync` |
| No GPS from photos | Using mobile browser, not native app | Install via Xcode or Android Studio |
| No GPS from photos on Android | Missing media-location permission or using system photo picker | Rebuild after update; allow location + media location when prompted |
| “Use current location” fails | Location permission missing or denied | Allow location in Android/iOS settings for Trip Diary |
| Xcode signing error | No team selected | Signing & Capabilities → pick your Team |
| Android install blocked | Unknown sources disabled | Allow installs from your file manager or adb |
| Stale UI after web changes | Native project not synced | Run `pnpm native:sync` before building |

## Useful commands

```bash
pnpm native:sync      # build web app + copy to ios/ and android/
pnpm native:ios       # sync + open Xcode
pnpm native:android   # sync + open Android Studio
pnpm native:doctor    # check Capacitor toolchain
pnpm native:assets    # regenerate app icons and splash screens
```
