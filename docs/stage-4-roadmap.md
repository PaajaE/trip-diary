# Stage 4 — Product Polish Roadmap

**Last updated:** 2026-07-10  
**Status doc:** [migration-status.md](./migration-status.md)  
**Stage numbering:** see [Stage numbering](#stage-numbering) below

---

## Goal

Make Trip Diary feel like a polished product — improve architecture where it reduces future complexity, improve UX, remove friction, and keep web and mobile aligned — without redesigning working systems.

**Stage 3 (Expo PoC) is implementation complete.** GPS, camera, EXIF, and physical-device upload validation remain **pending** and must stay documented as such until explicitly completed.

---

## Constraints

- Incremental changes only; no large refactors of working sync or storage systems.
- Respect offline-first architecture and existing package boundaries.
- Do not break web compatibility or deployed environment variable names.
- Stage 7 sync/storage extraction remains deferred.
- Hardware validation is not a Stage 4 blocker.

---

## Stage numbering

The repository uses **three independent stage systems**. Always use the full label in new documentation.

| Label                        | Scope                                     | Reference                                                 |
| ---------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| **Product Stage 4**          | Cross-platform polish (this document)     | `docs/stage-4-roadmap.md`                                 |
| **Mobile Migration Stage N** | Expo app rollout (PoC → production)       | `docs/expo-mobile-implementation-plan.md`                 |
| **Translation feature**      | Czech→English entry translation (shipped) | Completed as Mobile Migration Stage 4 in migration-status |

See [migration-status.md](./migration-status.md) for current migration stage status.

---

## Implementation waves

| Wave                        | Focus                                               | Items                       |
| --------------------------- | --------------------------------------------------- | --------------------------- |
| **1 — Quick wins**          | Foundation parity, test fixes, docs                 | H5, M10, H10, M15           |
| **2 — Mobile product feel** | SQLite, sync lifecycle, nav, i18n                   | H1, H2, H3, H4, M2, M6      |
| **3 — Shared contracts**    | Core schemas, query keys, translation polish        | H7, H9, H6, H8, M5, M4, M16 |
| **4 — Depth**               | Offline list, map pins, API scaffold, quality gates | M1, M3, M7, M9, M12, M11    |

---

## Success criteria

| Criterion                          | Target                                              |
| ---------------------------------- | --------------------------------------------------- |
| Mobile feels like a product        | No dev copy, Czech i18n, working navigation         |
| Offline story is honest            | List cache, auto sync drain, visible status         |
| Shared packages are real contracts | Mobile uses core + i18n; neutral config schema      |
| Web resilience                     | Root error boundary; translation React Query polish |
| No regressions                     | All CI gates pass; pgTAP hash parity maintained     |
| Stage 3 validation                 | Documented as pending, not silently dropped         |

---

## Roadmap status

Status values: `pending` · `in progress` · `complete` · `deferred`

### Wave 1 — Quick wins

| ID  | Item                                 | Priority | Status       | Notes                                                   |
| --- | ------------------------------------ | -------- | ------------ | ------------------------------------------------------- |
| H5  | Web root error boundary              | High     | **complete** | `RootErrorBoundary` in `main.tsx`; 6 tests              |
| M10 | Fix stale Mapy map-style test        | Medium   | **complete** | Web test URL → `/outdoor/`                              |
| H10 | Neutralize `@trip-diary/config` keys | High     | **complete** | Semantic schema; adapters unchanged at deploy boundary  |
| M15 | Reconcile stage numbering in docs    | Medium   | **complete** | Labels in `migration-status.md` + cross-reference table |

### Wave 2 — Mobile product feel

| ID  | Item                                 | Priority | Status       |
| --- | ------------------------------------ | -------- | ------------ | --------------------------------------------------- |
| H1  | Unified mobile SQLite bootstrap      | High     | **complete** | `platform/storage/database.ts` + ordered migrations |
| H2  | Wire sync queue into app lifecycle   | High     | **complete** | `SyncLifecycleProvider` at app root                 |
| H3  | Mobile navigation shell + auth guard | High     | **complete** | `(auth)` / `(app)` route groups                     |
| H4  | Adopt `@trip-diary/i18n` on mobile   | High     | **complete** | Shared keys + locale persistence                    |
| M2  | Mobile sync status UI                | Medium   | **complete** | Header indicator + detail sheet                     |
| M6  | Real network state (NetInfo)         | Medium   | **complete** | Conservative online semantics                       |

### Wave 3 — Shared contracts

| ID  | Item                                           | Priority | Status       |
| --- | ---------------------------------------------- | -------- | ------------ |
| H6  | Translation React Query integration (web)      | High     | **complete** |
| H7  | Extend `@trip-diary/core` with journey schemas | High     | **complete** |
| H8  | Consolidate translation pure logic in package  | High     | pending      |
| H9  | Centralized query-key factories (web)          | High     | **complete** |
| M4  | Move translation repo to entities layer        | Medium   | **complete** |
| M5  | Extract `normalizeCapturedAt` to utils         | Medium   | pending      |
| M16 | Translation status polling                     | Medium   | **complete** |

### Wave 4 — Depth

| ID  | Item                                | Priority | Status       |
| --- | ----------------------------------- | -------- | ------------ |
| M1  | Offline journey list cache (mobile) | Medium   | **complete** |
| M3  | Map journey geography on mobile     | Medium   | **complete** |
| M7  | Scaffold `@trip-diary/api`          | Medium   | pending      |
| M9  | ESLint for packages + mobile        | Medium   | **complete** |
| M11 | Translation Playwright e2e          | Medium   | pending      |
| M12 | Mobile hook/screen tests            | Medium   | pending      |

### Deferred / not recommended in Stage 4

| ID  | Item                               | Reason                |
| --- | ---------------------------------- | --------------------- |
| NR1 | Decompose `sync.service.ts`        | Stage 7               |
| NR2 | Full `@trip-diary/storage` package | Stage 7               |
| NR3 | Global state framework             | Unnecessary           |
| NR5 | Full mobile feature parity         | Post–Stage 4          |
| L10 | Hardware validation execution      | Intentionally pending |

---

## Next slice after Wave 1

**Wave 2A (H1) complete.** **Wave 2C (H3 + H4) complete.** **Wave 2D (M2) complete.** **Wave 2E (M1) complete.** **Wave 3A (H7) complete.** **Wave 3B (M3) complete.** **Wave 3C (H6 + M4 + M16) complete.** **Wave 3D (M9) complete.** **Wave 3E (H9) complete.** Next isolated slice: **M11** — Translation Playwright E2E (recommended) or **M12** — Mobile screen/hook integration tests.
