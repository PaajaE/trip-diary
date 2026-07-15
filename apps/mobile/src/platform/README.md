# Platform adapters

Native platform implementations for Trip Diary mobile. Shared business logic lives in `packages/*`; this directory holds React Native–specific adapters only.

## Structure

| Directory  | Purpose                                                                     |
| ---------- | --------------------------------------------------------------------------- |
| `storage/` | SQLite bootstrap, journey cache, journey list cache, sync queue persistence |
| `sync/`    | Durable sync queue, photo upload, production enqueue helper                 |
| `maps/`    | `@maplibre/maplibre-react-native` renderer + style resolver                 |
| `media/`   | expo-image-picker, expo-file-system, photo metadata                         |

Subdirectories hold platform adapters. Schema migrations live in `storage/migrations.ts`; only `storage/database.ts` opens the SQLite file.

## Conventions

- Obtain SQLite via `getMobileDatabase()` — never call `openDatabaseAsync()` elsewhere.
- Enqueue production sync work via `enqueueSyncOperationForApp()` (adds ownership metadata and requests lifecycle drain). Low-level `enqueueSyncOperation()` remains for tests/offline-only flows.
- Export thin adapters behind interfaces defined in `packages/storage` and `packages/maps` (Stage 7+).
- Keep UI out of this tree — platform code is testable without screens.
- Prefer `expo-file-system` document directory for local photo blobs.
