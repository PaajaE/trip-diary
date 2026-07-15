# Trip Diary

Offline-first travel journal for stories, photos, journeys, practical guides,
and map-based memories — including a nature field diary with destination checklists,
photo spotting, regional species guide (GBIF + Wikipedia), and photo bubble map pins.

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

This runs formatting, lint (web + shared packages + mobile), strict TypeScript
checks, unit tests, and the production build.

Focused lint scopes:

```bash
pnpm lint:web
pnpm lint:packages
pnpm lint:mobile
pnpm --filter mobile lint
```

See [docs/linting.md](docs/linting.md) for platform-specific rule sets and justified exceptions.

Web React Query keys and invalidation conventions: [docs/query-keys.md](docs/query-keys.md).

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
synchronization runs over Wi-Fi and mobile data by default; disable “Sync over
mobile data” in the sync panel to opt out on cellular.

See [docs/native-build.md](docs/native-build.md) for install steps on physical
devices. See [docs/native-testing.md](docs/native-testing.md) for the on-device
verification checklist.

After changing web code or Capacitor plugins, synchronize both projects:

```bash
pnpm native:sync
```

Open a platform project with `pnpm native:ios` or `pnpm native:android`.
Building iOS requires full Xcode. Building Android requires a JDK and Android
SDK. Physical devices must use a reachable HTTPS Supabase deployment rather
than the local `127.0.0.1` development URL.

## GitHub Pages deployment

The `Deploy GitHub Pages` workflow publishes the web application after every
push to `main`. Before the first deployment:

1. Create a hosted Supabase project and apply all migrations in
   `supabase/migrations`.
2. Set the Supabase Auth site URL to the production URL, for example
   `https://cestovni-denik.cz/`.
3. Add repository secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Add `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, and
   `SUPABASE_DB_PASSWORD` secrets.
5. Run the `Deploy Supabase migrations` workflow once.
6. Configure repository Pages settings to use **GitHub Actions**.

The Supabase anon/publishable key is intentionally public. Never add a service
role key to GitHub Pages or to any `VITE_` variable.

The production build is configured for the custom root domain
`https://cestovni-denik.cz/`. Configure it under repository **Settings →
Pages**, point the apex DNS records to GitHub Pages, and point `www` to
`paajae.github.io`.
