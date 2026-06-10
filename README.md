# Trip Diary

Offline-first travel journal for stories, photos, journeys, practical guides,
and map-based memories.

## Requirements

- Node.js 22
- pnpm 11
- Supabase CLI
- Docker Desktop for local Supabase

## Development

```bash
pnpm install
pnpm dev
```

Copy `.env.example` to `.env.local` after starting or linking Supabase.

## Quality Gate

```bash
pnpm check
```

This runs formatting, lint, strict TypeScript checks, unit tests, and the
production build.

## Supabase

```bash
pnpm supabase:start
pnpm db:reset
pnpm db:lint
pnpm db:test
pnpm db:types
```

Database migrations are the source of truth. The generated
`src/shared/api/database.types.ts` file must never be edited manually.

## Architecture

See [docs/architecture.md](docs/architecture.md).

## Native applications

The Capacitor projects live in `ios/` and `android/`. IndexedDB provides
persistent on-device storage inside the native WebView. Automatic native
synchronization only runs over Wi-Fi; the explicit synchronization button can
still be used on any connection.

After changing web code or Capacitor plugins, synchronize both projects:

```bash
pnpm native:sync
```

Open a platform project with `pnpm native:ios` or `pnpm native:android`.
Building iOS requires full Xcode. Building Android requires a JDK and Android
SDK. Physical devices must use a reachable HTTPS Supabase deployment rather
than the local `127.0.0.1` development URL.
