# Database types generation

`src/shared/api/database.types.ts` is generated from the local Supabase schema.

## Standard workflow

```bash
pnpm supabase:start
pnpm db:reset          # applies all migrations
pnpm db:test           # pgTAP suite (301 tests incl. entry_translations)
pnpm db:types          # regenerates database.types.ts
```

`pnpm db:types` pipes through `scripts/patch-database-types.mjs` and Prettier. The file is listed in `.prettierignore` because generated output is produced by the script.

## Status (2026-07-10)

| Item                              | Status                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------- |
| Local Supabase                    | **Running**                                                                   |
| Migrations applied                | **Yes** (`db:reset`)                                                          |
| pgTAP                             | **301 tests passing**                                                         |
| `pnpm db:types`                   | **Completed**                                                                 |
| Manual `entry_translations` patch | **Removed** — generated output matches prior manual extension **identically** |

### Comparison result

The `entry_translations` table block and `translation_status` enum in regenerated `database.types.ts` are **byte-identical** to the temporary manual patch (2581 characters). No schema drift.

### Related migrations

- `20260710170000_create_entry_translations.sql`
- `20260710180000_mark_entry_translations_stale.sql`
- `20260710190000_fix_compute_source_content_hash.sql` — fixes hash parity with `@trip-diary/translation` / Edge Function
