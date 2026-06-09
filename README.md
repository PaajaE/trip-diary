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
