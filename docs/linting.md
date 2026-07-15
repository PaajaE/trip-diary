# Linting

Trip Diary uses ESLint 9 flat config from the repository root (`eslint.config.js`).
One `pnpm lint` run covers the web app, shared packages, and the Expo mobile app.

## Commands

| Command | Scope |
| --- | --- |
| `pnpm lint` | All supported workspaces (CI default) |
| `pnpm lint:web` | `src/**`, root `vite.config.ts` |
| `pnpm lint:packages` | `packages/*/src/**`, package Vitest configs |
| `pnpm lint:mobile` | `apps/mobile/**` production + tests + tooling |
| `pnpm --filter mobile lint` | Same as `lint:mobile` via workspace script |

Runtime: ~21s locally with type-aware rules (project service).

## Scopes and rule sets

### Web (`src/**`)

- Type-aware `@typescript-eslint/strictTypeChecked` + stylistic type-checked rules
- `eslint-plugin-jsx-a11y` recommended
- React Hooks + React Refresh (Vite)
- Browser + Node globals
- Deprecated import guard: `@/features/entries/api/translation.repository` → use `@/entities/translation/api`

### Shared packages (`packages/*/src/**`)

- Type-aware strict rules without React/DOM plugins
- `@trip-diary/core` boundary: no React, Expo, Supabase, Dexie, or SQLite imports
- Tests: relaxed `any` / non-null assertions; `require-await` off

### Mobile (`apps/mobile/**`)

- Type-aware strict rules + React Hooks
- **No** jsx-a11y (DOM rules) or React Refresh (Vite-only)
- Globals: ES2021 + `__DEV__`
- Browser globals (`window`, `document`, `localStorage`) rejected via `no-restricted-globals`
- Boundary restrictions:
  - `openDatabaseAsync` only in `platform/storage/database.ts`
  - `@react-native-community/netinfo` only in `foundation/network/**`
- Compatibility barrel `features/journeys/index.ts`: `@typescript-eslint/no-deprecated` off for intentional deprecated re-exports
- Tests / test-utils: relaxed unsafe-any, empty functions, deprecated React test renderer

### Tooling (no type-aware lint)

Plain `eslint.config.js` recommended rules for:

- `scripts/*.mjs`
- `apps/mobile/{babel,metro,react-native}.config.js`, `vitest.config.ts`, `scripts/*.mjs`
- `packages/*/vitest.config.ts`

## Explicitly not linted

| Path | Reason |
| --- | --- |
| `src/shared/api/database.types.ts` | Generated Supabase types |
| `supabase/functions/**` | Deno Edge Functions (different runtime) |
| `apps/mobile/ios/**`, `android/**`, `.expo/**` | Native/generated Expo output |
| `dist`, `coverage`, lockfiles | Build artifacts |

## Justified exceptions

- `sync-coordinator.ts`: one `no-unnecessary-condition` disable on the follow-up drain loop — concurrent drain requests set the flag mid-await.
- Deprecated compatibility shims remain in source; lint blocks **new** imports of deprecated web translation paths and documents mobile deprecated exports in the journeys barrel.

## Adding an exception

1. Prefer fixing the code or tightening types first.
2. If a rule is noisy for a whole category (e.g. test mocks), add a **file-pattern override** in `eslint.config.js` with a short comment.
3. Avoid file-level `eslint-disable` in production source unless documented inline.

Configuration coverage is verified by `src/test/eslint-config.test.ts`.
