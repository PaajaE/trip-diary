# Offline Hardening Plan

## Problem

The product is marketed as offline-ready, and capture writes already go through
IndexedDB plus a sync outbox. Most screens still require Supabase on every load,
so turning off the network makes the app feel broken.

Current reality:

```text
writes  -> local first, sync later     (partial)
reads   -> Supabase first, cache never (broken offline)
shell   -> PWA precache + map tiles only
```

## Goal

Make the app usable on a trip with intermittent or no connectivity:

- reopen a trip you already opened
- add moments with photos and location
- see pending sync state honestly
- recover automatically when the network returns

Browsing the full dashboard, creating brand-new trips, or signing in offline
remain out of scope for the first slices.

## Delivery Slices

### Slice A: Journey read cache (P0)

- Persist the last successful `JourneyDetail` snapshot in IndexedDB
- `getJourney()` falls back to the snapshot when offline or remote fetch fails
- Always merge fresh local moments/links/photos into the returned journey
- Cache `canContributeToJourney` beside the snapshot for offline edit affordances

Acceptance:

- Open a trip online, go offline, refresh the trip page -> trip still renders
- Add moment offline -> appears in story/map/gallery from local data
- Badge shows pending/offline, not “synchronized”

### Slice B: Publishing space cache (P0)

- Persist the last `listMySpaces()` result per user in IndexedDB
- `useActiveSpace()` resolves from cache when offline
- Create-entry and create-memory forms no longer hang on “Načítám publikační prostor…”

Acceptance:

- Open create-memory once online, go offline -> form still loads with cached space

### Slice C: Resilient session and queries (P1)

- Keep Supabase session from local storage when offline
- Do not treat profile fetch failure as a hard signed-out state while offline
- Tune React Query: longer `gcTime`, no aggressive refetch while offline
- Entry detail already reads local first; document and verify

Acceptance:

- Refresh app offline while signed in -> shell and account menu remain usable

### Slice D: Offline create trip (P2)

- Queue `journey.create` in the sync outbox (like `entry.create`)
- Dashboard shows locally created trips with pending state

Acceptance:

- Create trip offline -> appears in dashboard and opens from local snapshot

### Slice E: PWA and production verification (P2)

- Precache app shell in production build
- Add Playwright offline smoke: open trip -> go offline -> add moment -> badge pending
- Document dev (`pnpm dev`) vs production (`pnpm preview`) offline behavior

Acceptance:

- CI or local script proves the primary offline capture path

## Dev vs production

| Mode               | Command                                           | Offline behavior                                    |
| ------------------ | ------------------------------------------------- | --------------------------------------------------- |
| Development        | `pnpm dev`                                        | IndexedDB caches work; service worker is unreliable |
| Production preview | `pnpm build && pnpm preview`                      | Full PWA shell precache + IndexedDB caches          |
| E2E smoke          | `pnpm test:e2e tests/e2e/offline-capture.spec.ts` | Uses dev server; proves IndexedDB offline path      |

For realistic PWA verification before release, always test with `pnpm preview`
after a production build.

## Non-goals (for now)

- Full dashboard offline
- Public pages offline
- Space invites / member management offline
- Comments, notifications, or collaboration offline

## Technical notes

- Dexie remains the on-device source of truth for drafts and snapshots
- Repository layer owns cache read/write; UI stays unaware
- No manual edits to generated Supabase types
- Each slice is a deployable vertical slice with unit tests
