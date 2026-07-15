# Mobile PoC — Device Validation Checklist

Reference: [expo-mobile-implementation-plan.md](./expo-mobile-implementation-plan.md) Stage 3.

This checklist is designed for **minimal user input**: copy public values from the existing web app, run the listed commands, and tick each scenario.

---

## 1. Environment variables

Create `apps/mobile/.env` from `apps/mobile/.env.example`. **Do not commit** `.env`.

| Variable                        | Required | Safe for client?      | Copy from web?             | Where to obtain                                                                                                                         |
| ------------------------------- | -------- | --------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`      | **Yes**  | Yes (public)          | **Yes** — same project URL | Root `.env.local` → `VITE_SUPABASE_URL`, or [Supabase Dashboard](https://supabase.com/dashboard) → Project Settings → API → Project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | **Yes**  | Yes (public anon key) | **Yes**                    | Root `.env.local` → `VITE_SUPABASE_ANON_KEY`, or Dashboard → API → `anon` `public` key                                                  |
| `EXPO_PUBLIC_MAPY_API_KEY`      | No       | Yes (REST tile key)   | **Yes**                    | Root `.env.local` or `.env.production.local` → `VITE_MAPY_API_KEY`, or [Mapy.com developer portal](https://developer.mapy.com/)         |

### Mapping web → mobile

```bash
# From repository root, if .env.local exists:
grep -E '^VITE_SUPABASE_URL=|^VITE_SUPABASE_ANON_KEY=|^VITE_MAPY_API_KEY=' .env.local

# Write apps/mobile/.env (example):
EXPO_PUBLIC_SUPABASE_URL=<same value as VITE_SUPABASE_URL>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<same value as VITE_SUPABASE_ANON_KEY>
EXPO_PUBLIC_MAPY_API_KEY=<same value as VITE_MAPY_API_KEY>   # optional
```

All three `EXPO_PUBLIC_*` values are **intentionally embeddable** in the client bundle. They are not service-role secrets. Never copy `SUPABASE_SERVICE_ROLE_KEY` or server-only keys into the mobile app.

### What each variable unlocks

| Variable                                                     | Validation unlocked                                                     |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Sign-in, journey list, journey detail API load, SQLite cache population |
| `EXPO_PUBLIC_MAPY_API_KEY`                                   | Mapy.com **tourist** raster tiles (`/maptiles/outdoor/` — Tourist Map mapset) |
| Omitting Mapy key                                            | OSM fallback tiles (see §6)                                             |

### Startup validation

If required vars are missing, the app shows a **Configuration error** screen (`validateExpoPublicEnv` in `app/_layout.tsx`) instead of a silent crash. Fix `.env` and restart Metro.

---

## 2. Prerequisites

- Node.js 22+ and pnpm (same as web)
- Expo dev client (`expo-dev-client` is already a dependency)
- A Supabase account with at least one journey (create via web PWA if needed)
- Physical device **or** emulator/simulator

**Do not commit:** `.env`, `apps/mobile/ios/`, `apps/mobile/android/` (gitignored generated native dirs).

---

## 3. Android setup

### One-time tooling

```bash
# Install Android Studio → SDK Platform + build-tools
# Set in ~/.zshrc or ~/.bashrc:
export ANDROID_HOME="$HOME/Library/Android/sdk"   # macOS default
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

Verify:

```bash
echo $ANDROID_HOME
adb devices
```

### Native project (already validated in CI/agent)

```bash
cd apps/mobile
npx expo prebuild --platform android --no-install
```

### Development client

```bash
cd apps/mobile
cp .env.example .env   # then fill values (§1)
pnpm install           # from repo root: pnpm install
npx expo run:android
```

**Expected:** Gradle build succeeds, app installs on emulator/device, Metro connects, home screen shows “Your journeys”.

**Permission prompts (Android):** photo library (when testing pick), location (when testing GPS), network (implicit).

---

## 4. iOS setup

### One-time tooling

```bash
# Xcode from App Store (full app, not CLI tools only)
xcode-select -p   # should point to /Applications/Xcode.app/...

# CocoaPods (required for expo run:ios)
sudo gem install cocoapods
pod --version
```

### Native project

```bash
cd apps/mobile
npx expo prebuild --platform ios --no-install
cd ios && pod install && cd ..
```

### Development client

```bash
cd apps/mobile
cp .env.example .env   # then fill values (§1)
npx expo run:ios
```

Pick a simulator or connected device when prompted.

**Permission prompts (iOS):** photo library, location when those flows are exercised.

**Signing:** Simulator builds need no Apple Developer account; physical device may require a development team in Xcode.

---

## 5. Automated checks (no device)

Run from repository root:

| Check             | Command                                                               | Expected |
| ----------------- | --------------------------------------------------------------------- | -------- |
| Mobile TypeScript | `pnpm --filter mobile typecheck`                                      | Exit 0   |
| Mobile unit tests | `pnpm --filter mobile test`                                           | All pass |
| iOS prebuild      | `cd apps/mobile && npx expo prebuild --platform ios --no-install`     | Exit 0   |
| Android prebuild  | `cd apps/mobile && npx expo prebuild --platform android --no-install` | Exit 0   |

---

## 6. Mapy tourist tiles and fallback

### Verify Mapy tourist (key set)

1. Set `EXPO_PUBLIC_MAPY_API_KEY` in `apps/mobile/.env`.
2. Open any journey → scroll to **Map** section.
3. **Success:** Map renders with terrain/tourist styling; attribution bar shows `mapy-tourist · © Seznam.cz…`.
4. Pan/zoom — tiles load without solid grey canvas.

Tourist tile endpoint (for manual URL check): `https://api.mapy.com/v1/maptiles/outdoor/tiles.json?apikey=YOUR_KEY`  
(Mapy API mapset id is `outdoor`; there is no `tourist` mapset.)

### Intentionally trigger OSM fallback

**Method A — omit key:** Remove or comment out `EXPO_PUBLIC_MAPY_API_KEY`, restart Metro (`npx expo start --clear`).

**Method B — invalid key:** Set `EXPO_PUBLIC_MAPY_API_KEY=invalid` (Mapy provider skipped → OSM).

**Success:** Attribution shows `osm · © OpenStreetMap contributors`; standard OSM street map visible.

Resolution logic lives in `@trip-diary/maps` (`resolveMapStyle`, reason `fallback-missing-key`). Runtime tile failure recovery (`fallback-runtime`) is **not** wired in PoC UI yet — document if observed.

---

## 7. Sign-in and journey load

| Step | Action                 | Success criteria                                            |
| ---- | ---------------------- | ----------------------------------------------------------- |
| 1    | Launch dev client      | No redbox; configuration screen absent when `.env` is valid |
| 2    | Sign in via `/sign-in` | Email/password auth succeeds                                |
| 3    | Home lists journeys    | At least one journey card from Supabase                     |
| 4    | Open journey detail    | Title, summary, dates, map section render                   |
| 5    | Kill app, relaunch     | Still signed in (AsyncStorage session)                      |

---

## 8. Offline SQLite read

| Step | Action                                           | Success criteria                                               |
| ---- | ------------------------------------------------ | -------------------------------------------------------------- |
| 1    | Online: open a journey detail                    | Journey loads from API; no yellow offline banner               |
| 2    | Confirm cache                                    | Journey data visible (same title/summary)                      |
| 3    | Enable airplane mode (or disable Wi‑Fi/cellular) | —                                                              |
| 4    | Navigate back, reopen same journey               | Yellow banner: “Offline — showing cached journey from SQLite.” |
| 5    | Content matches step 1                           | Title/summary still visible without network                    |

**Failure logs:** Metro console + `npx react-native log-android` / Xcode console. Look for `expo-sqlite` or `getCachedJourney` errors.

---

## 9. Sync queue — enqueue and retry (PoC stub)

The PoC stub (`processNextSyncOperationStub`) marks operations `pending` → `processing` → `synced` without network upload. Device validation confirms SQLite persistence.

**Manual exercise (temporary dev menu or debugger):**

```typescript
import {
  enqueueSyncOperation,
  peekNextSyncOperation,
  processNextSyncOperationStub,
} from '@/platform/sync/queue'

await enqueueSyncOperation({
  id: 'test-op-1',
  operationType: 'journey.touch',
  payload: { journeyId: '<uuid>' },
})
const next = await peekNextSyncOperation()
// expect status 'pending'
await processNextSyncOperationStub()
const again = await peekNextSyncOperation()
// expect null (synced) or next pending op
```

**Success:** First peek returns the enqueued op; after stub processing, op is not pending. Re-enqueue after `markSyncOperationStatus(id, 'failed')` then `markSyncOperationStatus(id, 'pending')` to simulate retry.

---

## 10. Photo pick, EXIF, GPS, local file

| Step | Action                                            | Success criteria                                 | Permission prompt                |
| ---- | ------------------------------------------------- | ------------------------------------------------ | -------------------------------- |
| 1    | Call `pickPhoto()` from a test screen or debugger | Image selected; URI returned                     | “Allow access to photos”         |
| 2    | Inspect `metadata.capturedAt`                     | Non-null for photos with EXIF `DateTimeOriginal` | —                                |
| 3    | Inspect `metadata.latitude/longitude`             | Non-null for geotagged photos                    | —                                |
| 4    | `persistPhotoLocally(uri, 'test.jpg')`            | Returns path under `documentDirectory/photos/`   | —                                |
| 5    | `getCurrentLocation()`                            | Coordinates when granted                         | “Allow location while using app” |

**Tips:** Use a photo taken with the device camera (GPS + timestamp). Screenshots often lack GPS.

**Logs:** `console.log` from `extractPhotoMetadata`; watch for permission-denied errors from `expo-image-picker` / `expo-location`.

---

## 11. Device checklist summary

| #   | Scenario                  | Auto        | Android device | Blocker if failing |
| --- | ------------------------- | ----------- | -------------- | ------------------ |
| 1   | Dev build launches        | prebuild ✅ | ✅             | Signing / SDK      |
| 2   | Sign-in + session persist | —           | ✅             | Test credentials   |
| 3   | Journey detail from API   | —           | ✅             | Auth + Supabase    |
| 4   | SQLite offline read       | unit ✅     | ✅             | Auth + device      |
| 5   | MapLibre render           | —           | ✅             | Dev client         |
| 6   | Mapy tourist default      | unit ✅     | ⚠️ Partial     | Mapy key / 404     |
| 7   | OSM fallback              | unit ✅     | ☐              | Metro env change   |
| 8   | Style runtime fallback    | —           | ☐              | Not in PoC UI      |
| 9   | Photo pick                | unit ✅     | ✅             | Permission         |
| 10  | EXIF / GPS metadata       | unit ✅     | ✅ (null sample) | Sample photo     |
| 11  | Local file persist        | unit ✅     | ✅             | Photo flow         |
| 12  | Current location          | —           | ❌             | AVD location off   |
| 13  | Sync queue enqueue        | unit ✅     | ✅             | Dev checklist      |
| 14  | Sync retry stub           | unit ✅     | ✅             | Dev checklist      |
| 15  | Android prebuild          | ✅          | —              | —                  |
| 16  | iOS prebuild              | ✅          | —              | CocoaPods for run  |

### Android results (2026-07-10, Pixel_9a)

| Step | Scenario            | Status          | Notes                                        |
| ---- | ------------------- | --------------- | -------------------------------------------- |
| —    | Metro JS bundle     | ✅ Pass         | HTTP 200, React 18 resolver                  |
| 1    | Startup (no redbox) | ✅ Device-tested | Sign-in / home                               |
| 2    | Env validation      | ✅ Device-tested | No configuration error screen                |
| 3    | Supabase auth init  | ✅ Device-tested | Session null → `/sign-in` redirect           |
| 4    | Sign-in + session   | ✅ Device-tested | User auth; cold start session restore        |
| 5    | Journey load        | ✅ Device-tested | 2 journeys; **Kanada 2026** detail           |
| 6    | SQLite offline      | ✅ Device-tested | Offline banner + cached content              |
| 7–14 | See table above     | Mixed           | Mapy tiles 404; location failed on AVD      |

See [mobile-device-validation-results.md](./mobile-device-validation-results.md) for logs and Metro fix details.

---

## 12. Capturing useful logs when a step fails

### Metro (JavaScript)

```bash
cd apps/mobile
npx expo start --clear
# Reproduce failure; copy stack trace from terminal
```

### Android

```bash
adb logcat *:S ReactNative:V ReactNativeJS:V ExpoModules:V
# Or: npx react-native log-android
```

### iOS

Xcode → Open `apps/mobile/ios/TripDiary.xcworkspace` → Run → **Console** tab.

Filter: `TripDiary`, `Expo`, `MapLibre`, `SQLite`.

### Configuration screen at startup

If you see “Configuration error” with missing variables list → fix `apps/mobile/.env` (§1) and restart.

### Map tile failures

- Note attribution text (`mapy-tourist` vs `osm`)
- Network tab not available on device — use log lines from MapLibre or temporary `console.log(resolved)` in `MapViewScreen`

---

## 13. Environment blockers (agent / CI)

| Blocker                | Impact                          | User action                                                                             |
| ---------------------- | ------------------------------- | --------------------------------------------------------------------------------------- |
| Docker not running     | `pnpm db:test`, `pnpm db:types` | Start Docker Desktop → § [database-types-generation.md](./database-types-generation.md) |
| No `EXPO_PUBLIC_*`     | Mobile runtime blocked          | §1                                                                                      |
| `ANDROID_HOME` unset   | Emulator / `run:android`        | §3                                                                                      |
| CocoaPods missing      | `run:ios` after prebuild        | §4                                                                                      |
| No translation API key | Mock provider only (expected)   | No action for Stage 3                                                                   |

---

## Related docs

- [mobile-platform-contracts.md](./mobile-platform-contracts.md) — PoC interfaces (provisional until device sign-off)
- [migration-status.md](./migration-status.md) — per-item status columns
- [apps/mobile/README.md](../apps/mobile/README.md) — foundation layer (Stage 5 provisional)
