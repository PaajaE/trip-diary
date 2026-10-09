# Linting

Trip Diary uses ESLint 9 flat config from the repository root (`eslint.config.js`).
One `pnpm lint` run covers the web app and shared packages.

## Commands

| Command              | Scope                                       |
| -------------------- | ------------------------------------------- |
| `pnpm lint`          | All supported workspaces (CI default)       |
| `pnpm lint:web`      | `src/**`, root `vite.config.ts`             |
| `pnpm lint:packages` | `packages/*/src/**`, package Vitest configs |

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
- `@trip-diary/core` boundary: no React, Supabase, or Dexie imports
- Tests: relaxed `any` / non-null assertions; `require-await` off

### Tooling (no type-aware lint)

Plain `eslint.config.js` recommended rules for:

- `scripts/*.mjs`
- `packages/*/vitest.config.ts`

## Explicitly not linted

| Path                               | Reason                                  |
| ---------------------------------- | --------------------------------------- |
| `src/shared/api/database.types.ts` | Generated Supabase types                |
| `supabase/functions/**`            | Deno Edge Functions (different runtime) |
| `dist`, `coverage`, lockfiles      | Build artifacts                         |

## Justified exceptions

- `sync-coordinator.ts`: one `no-unnecessary-condition` disable on the follow-up drain loop — concurrent drain requests set the flag mid-await.
- Deprecated compatibility shims remain in source; lint blocks **new** imports of deprecated web translation paths.

## Adding an exception

1. Prefer fixing the code or tightening types first.
2. If a rule is noisy for a whole category (e.g. test mocks), add a **file-pattern override** in `eslint.config.js` with a short comment.
3. Avoid file-level `eslint-disable` in production source unless documented inline.

Configuration coverage is verified by `src/test/eslint-config.test.ts`.
