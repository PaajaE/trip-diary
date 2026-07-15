# Trip Diary Mobile

Expo Router app for the Trip Diary mobile client.

## Foundation layer

`src/foundation/` holds provisional cross-cutting infrastructure used by screens and platform adapters. It deliberately avoids finalizing native media, maps, or sync abstractions — those remain under `src/platform/` until later stages.

| Module            | Purpose                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `error-boundary/` | `RootErrorBoundary` + `ErrorFallback` for expo-router root crashes                       |
| `logging/`        | Structured `Logger` interface with console implementation                                |
| `env/`            | `validateExpoPublicEnv()` — throws `ConfigurationError` for missing `EXPO_PUBLIC_*` vars |
| `query-client/`   | `createQueryClient()` with mobile-friendly React Query defaults                          |
| `auth/`           | `useSessionRestore` hook pattern consumed by `AuthProvider`                              |
| `i18n/`           | `@trip-diary/i18n` init, locale detection, `I18nProvider`                                |
| `navigation/`     | Auth guard decisions, shared stack header options                                        |
| `network/`        | NetInfo-backed `NetworkProvider`, conservative online/offline/unknown semantics          |
| `sync/`           | Sync lifecycle coordinator, drain requests, observable snapshot for future UI   |
| `sqlite/`         | Numbered SQL migration runner used by `platform/storage/database.ts`            |
| `test-utils/`     | `renderWithProviders()` helper for Vitest component tests                                |
| `theme/`          | Shared color and spacing tokens                                                          |

### Startup wiring

`app/_layout.tsx` validates env on startup, wraps the tree in `RootErrorBoundary`, and provides React Query, i18n, network state, auth, and sync lifecycle.

Route groups:

- `(auth)/sign-in` — public sign-in
- `(app)/` — authenticated journeys list, journey detail, dev checklist (`__DEV__`)

User-visible copy comes from `@trip-diary/i18n` via `useTranslation()`.

Authenticated screens include a header sync status indicator (`features/sync/`) that opens a detail sheet with retry for recoverable failures.

The journeys home screen (`(app)/index.tsx`) uses a cache-first list backed by `@trip-diary/core` `JourneyListItem` schemas: saved journeys appear immediately from SQLite, refresh when online, and show localized offline/cached banners when appropriate. Pull-to-refresh reuses the same fetch path; offline refresh keeps saved data visible.

Journey detail (`(app)/journey/[id].tsx`) keeps header data (`JourneyHeader`) separate from geography. The map section (`JourneyMapSection`) loads authoritative `journey_stops` through a dedicated repository/query, validates via `@trip-diary/core`, caches snapshots in SQLite (migration 5), and renders stop markers with journey-first camera behavior — device location is not used as a journey substitute.

Required variables:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Optional:

- `EXPO_PUBLIC_MAPY_API_KEY`

Copy `.env.example` to `.env` for local development.

**Native rebuild:** After adding `@react-native-community/netinfo`, rebuild the dev client (`npx expo run:android` / `npx expo run:ios`). NetInfo is included in Expo Go for SDK 52, but this project uses a custom dev client.

### Monorepo Metro (pnpm + web React 19)

The web app uses React 19; mobile pins React 18. Without explicit resolution, Metro can bundle two React copies and crash at runtime (`Objects are not valid as a React child`).

`metro.config.js` forces `react`, `react/jsx-runtime`, and `react/jsx-dev-runtime` to `apps/mobile/node_modules/react`.

After changing `metro.config.js`, restart with cache clear:

```bash
cd apps/mobile
npx expo start --dev-client --clear
```

**Layout rule:** `app/_layout.tsx` must not throw during module evaluation. A failed import there prevents expo-router from registering the layout (symptom: `useAuth must be used within AuthProvider`).

## Platform adapters

Native implementations live in `src/platform/`. See `src/platform/README.md`.

## Scripts

```bash
pnpm --filter mobile start
pnpm --filter mobile test
pnpm --filter mobile typecheck
pnpm --filter mobile lint
```

Lint uses the root ESLint config with React Native–appropriate rules (no DOM a11y, no Vite refresh). See [docs/linting.md](../../docs/linting.md).
