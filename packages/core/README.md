# @trip-diary/core

Platform-neutral domain schemas shared by web and mobile.

## Exports

| Module      | Contents                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------- |
| `./entry`   | Entry entity schemas, create/update inputs                                                      |
| `./journey` | Journey status, list item, detail header, stop/geography schemas, remote + legacy cache mappers |

## Journey contract (H7)

**Domain naming:** camelCase product fields (`startsAt`, `updatedAt`, `mapLatitude`).

**Dates:**

- Journey range dates (`startsAt`, `endsAt`): ISO date strings (`YYYY-MM-DD`) or `null`
- Freshness timestamps (`updatedAt`): ISO datetimes with explicit offset

**Status values:**

- Journey: `planning` \| `active` \| `completed`
- Stop: `planned` \| `visited`

**Schemas:**

- `journeyListItemSchema` — home/list UI
- `journeyHeaderSchema` — journey detail header (mobile cache + shared subset of web detail)
- `journeyStopSchema` — authoritative stop coordinates for upcoming map geography (M3)

**Persistence vs domain:**

- `@trip-diary/core` never imports Supabase, SQLite, React, or platform modules
- Mobile SQLite continues storing legacy snake_case JSON; core parsers accept both wire and domain shapes
- Web full `JourneyDetail` aggregate (entries, stages, guides) remains web-local and composes shared status/stop schemas

**Remote mapping:**

- `parseJourneyListItemFromRemoteRecord`, `parseJourneyHeaderFromRemoteRecord`, `parseJourneyStopFromRemoteRecord` — snake_case Supabase rows → domain objects
- `safeParseJourneyListItemPayload`, `safeParseJourneyHeaderPayload` — legacy cache payloads → domain objects (returns `null` on failure)

## Tests

```bash
pnpm --filter @trip-diary/core test
```
