# React Query keys (web)

Trip Diary web queries use **domain-owned key factories** under `src/entities/*/api/*-query-keys.ts` (and feature-local factories when data is not an entity resource).

## Commands

Lint and tests cover query-key factories and invalidation helpers. Run `pnpm test src/test/query-keys-convention.test.ts` to verify no new inline domain roots appear outside factory files.

## Ownership

| Domain | Factory | Notes |
| --- | --- | --- |
| Journey | `journeyQueryKeys` | Detail, local cache, public, membership, contribution |
| Entry | `entryQueryKeys` | Detail, public reader variants, photo preview scopes |
| Photo | `photoQueryKeys` | Journey gallery, locations, tag assignments |
| Checklist | `checklistQueryKeys` | Per-journey checklist lists |
| Nature | `natureQueryKeys` | Observations, regional guide, external taxon lookups |
| Dashboard | `dashboardQueryKeys` | Remote + local cache per user |
| Space | `spaceQueryKeys` | User spaces, members, invite preview |
| Profile | `profileQueryKeys` | Current + public profile |
| Sharing | `sharingQueryKeys` | Public routes, entry public share metadata |
| Translation | `translationQueryKeys` | Unchanged from Wave 3C |
| Engagement | `engagementQueryKeys` | Feature-local (`features/engagement`) |

## Hierarchy convention

Factories preserve **existing tuple shapes** for cache compatibility. Parent keys (`all`, domain root literals) support prefix invalidation within one domain:

```typescript
journeyQueryKeys.all // ['journeys']
journeyQueryKeys.detail(id) // ['journeys', id]
journeyQueryKeys.detailLocal(id) // ['journeys', id, 'local']
```

Local/offline variants use an explicit `'local'` segment on the same resource family (journey detail, dashboard, contribution).

## Invalidation principles

- Prefer **minimum scope**: detail key, then related list/aggregate keys.
- Cross-domain effects use small named helpers (no global event bus):
  - `invalidateJourneyAfterEntryMutation`
  - `invalidateAfterEntryDelete` / `invalidateAfterEntryUpdate`
  - `invalidateAfterPhotoDelete` / `invalidateAfterPhotoTagChange`
  - `invalidateAfterManualSync` (domain roots, not unfiltered `invalidateQueries()`)
- Entry delete resolves `journeyId` from `localDb.journeyLinks` when available.

## Adding a new query

1. Add a factory method next to the owning entity repository.
2. Use the factory in `useQuery` / mutations / `QueryClient` calls.
3. Add invalidation beside the mutation that changes the data.
4. Extend `src/test/query-keys-convention.test.ts` guarded roots only when a new top-level domain appears.

## Deliberate cache compatibility

No persisted React Query cache exists in the web app. Key shapes were preserved except where factories centralize existing literals (no semantic change).

Translation keys (`entry-translations`) were not changed.

## Not linted / out of scope

- Mobile query keys (`apps/mobile`) — separate slice
- Supabase Edge Functions
- Inline keys in test mocks that assert query-key behavior directly
