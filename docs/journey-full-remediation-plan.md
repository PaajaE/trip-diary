# Journey Full Remediation Plan

## Current Implementation Status

Completed in the first remediation wave:

- journey assignment is stored locally and synchronized through an idempotent,
  dependency-aware outbox operation
- stale synchronization jobs recover and one failed item no longer blocks the
  whole queue
- a saved journey moment returns to the journey immediately while sync continues
  in the background
- a journey moment always uses the journey's publishing space
- local and remote photo previews are merged instead of hiding each other
- the journey page composes linked stops and entries into one visible moment
- planned stops are displayed separately from visited moments
- journey browsing now exposes clear Story, Map, and Gallery sections
- journey-linked entries are no longer repeated as standalone dashboard entries

Completed in the second remediation wave:

- GPS/location is stored locally with the journey assignment before any network
  request and appears immediately on the journey map
- assignment, stage, optional stop, and location synchronize through one atomic
  and idempotent Supabase RPC
- journey map consumes composed moments and plans, avoids duplicate markers, and
  links moment markers back to entry detail
- journey gallery combines all journey photos into one linked grid
- server tests validate membership, stage/stop consistency, invalid GPS,
  rollback behavior, and safe retries

Still required before the remediation is fully complete:

- one batched journey photo projection instead of per-entry gallery requests
- marker/card selection and previous/next navigation between moments
- repair and move-to-stage tools for historical data
- public journey parity and production journey-flow smoke tests
- Mapy.com tiles require a configured Mapy.com API key; the current map remains
  on OpenStreetMap tiles until that integration is configured

## Outcome

The journey must become the primary home for travel content.

When a user adds a moment from inside a journey:

- it belongs to that journey from the first local write
- it belongs to the selected stage when one is selected
- it appears immediately in the journey timeline
- its photos appear immediately in the moment and journey gallery
- its location appears immediately on the journey map
- the user receives an unambiguous saved/syncing/synced result

Standalone moments remain supported, but they are an explicit secondary flow.

## Why The Current Product Fails

The implementation has three competing representations of one user action:

- `entry` holds the story and photos
- `journey_stop` holds the map location
- `entry_journey_link` decides whether the entry belongs to a journey/stage/stop

These records are created through separate local and remote operations. They can
partially succeed, are not synchronized as one unit, and are read back through
different repositories. The UI therefore cannot reliably answer the basic
question: "What belongs to this trip?"

Current P0 failure modes include:

- an offline journey moment is later synced as a standalone entry because the
  outbox has no journey-assignment operation
- a failed save can leave a standalone entry, partial photos, or an orphan stop
- retrying save can create duplicates because it generates a new entry and stop
- a moment can be published into a different space than its journey

The browse experience has the same fragmentation:

- the timeline renders entries and stops separately, often duplicating one moment
- the journey map reads only stops
- the gallery is only embedded inside individual entry cards
- the photo repository returns either local or remote photos instead of merging
  them, so photos can disappear during synchronization
- the entry detail has photos but no location context
- there is no journey-level gallery
- there is no useful map empty state or map/list interaction
- the dashboard repeats journey moments as standalone memories without journey
  context

## Target Product Model

### User-visible concepts

- **Journey**: the trip and primary content container
- **Stage**: an optional day or chapter inside the journey
- **Moment**: one place/time/story with zero or more photos

### Internal representation

Keep `entries` as the content record, but treat a journey moment as a first-class
aggregate:

```text
JourneyMoment
  entry
  journey assignment
  optional stage assignment
  optional location
  photos
  sync state
```

Do not require a separate visible stop for every moment. A stop may remain an
internal planning concept, but a visited moment's location must be readable
directly as part of the moment aggregate.

### Required invariants

1. A moment created from a journey always has `journeyId` locally before save
   resolves.
2. A moment has at most one journey assignment.
3. A stage assignment must belong to the assigned journey.
4. Latitude and longitude are either both valid finite values or both null.
5. Photos, location, entry content, and journey assignment share one sync
   lifecycle.
6. A successful save always navigates to a state where the new moment is visible.
7. Timeline, map, gallery, and public journey read from one journey-detail
   projection.
8. A sync failure never turns a journey moment into a standalone moment.
9. A journey moment always uses the journey's publishing space.
10. Repeating or retrying save is idempotent and cannot create duplicate
    entries, stops, links, or photos.

## Target User Flows

### Add moment inside a journey

1. User opens a journey and taps `Add moment`.
2. Journey and optional stage are already selected.
3. User adds photos, text, and location in any order.
4. Location sources are presented equally:
   - photo GPS when available
   - current device location
   - map selection
5. User taps `Save moment`.
6. The app immediately returns to the journey and highlights the saved moment.
7. A compact status communicates `Saved`, `Syncing`, or `Needs attention`.

The save action creates one local journey-moment aggregate and queues one
dependency-aware sync job. It does not create a standalone entry first.

### Add standalone moment

This remains available from the dashboard as an explicit action. It can later be
moved into a journey through `Add to journey`, but this is not the path used by
the journey composer.

### Browse a journey

Journey detail has four clear surfaces:

1. **Overview**: hero, trip facts, primary add action, recent highlights
2. **Timeline**: moments grouped by stage/day, with photo-first cards
3. **Map**: all located moments, marker/card selection, useful empty state
4. **Gallery**: all journey photos, grouped or filterable by stage/moment

Stops that are only plans appear separately from visited moments and are not
rendered as duplicate timeline cards.

The broader diary/space has dedicated `Journeys`, `Map`, and `Gallery` browsing
surfaces. Dashboard remains a working overview, not the canonical archive.

## Architecture Changes

### 1. Canonical journey projection

Create one repository contract that returns fully composed journey content:

```ts
JourneyDetail {
  journey
  stages
  moments: JourneyMoment[]
  plannedStops
  photos
}
```

Each `JourneyMoment` includes its entry, stage, location, photo summaries, and
sync state. JourneyPage, JourneyMap, JourneyGallery, public journey pages, and
sharing all consume this same projection.

A linked stop and entry must compose into one moment. A stop is rendered alone
only when it has no linked entry.

### 2. Local-first aggregate

Replace the current independent local tables/operations with a durable local
journey assignment and location for the entry. The minimum viable shape is:

- local entry
- local journey assignment
- local moment location
- local photos
- a sync operation that represents the complete journey moment

Dexie writes for this aggregate happen in one transaction.

### 3. Dependency-aware synchronization

Replace the current sequence of unrelated `entry.create` and `photo.upload`
operations with an orchestrated journey-moment sync:

1. upsert entry
2. upsert journey assignment and stage
3. upsert moment location
4. upload and link photos
5. mark the aggregate synced only after all confirmations pass

Retries must be idempotent. A failure keeps the moment visible in its journey
with `Needs attention`.

The outbox must recover abandoned `syncing` operations after a timeout and must
not let one unrelated failed operation permanently block later valid moments.

### 4. Server-side atomic command

Add a Supabase RPC for creating/updating the journey moment assignment and
location atomically after the entry exists. Prefer a single RPC that validates:

- journey membership
- stage belongs to journey
- location pair/range
- entry creator/permissions
- entry and journey belong to the same publishing space

Add pgTAP tests for membership, stage mismatch, retries, and partial failures.

### 5. Photo projection

Journey reads must include photo summaries without issuing a separate query per
card. Add a batched photo preview query/projection for all journey moments.

Local photo previews remain available until remote previews are confirmed.
Remote upload cleanup must never remove the only locally displayable preview.
Local and remote photos are merged by photo ID; finding a local photo must not
hide remote photos for the same entry.

## Delivery Phases

### Phase 0: Freeze And Tests

Goal: stop regressions while restructuring.

- Freeze further journey UX patches.
- Add end-to-end characterization tests for the currently failing scenarios.
- Add fixtures for journey with stages, moments, photos, locations, and planned
  stops.
- Add logging around save and sync failures.

Acceptance:

- tests reproduce: misplaced moment, missing photo, missing map point, and
  ambiguous save result

### Phase 1: Canonical Data Model And Sync

Goal: guarantee correct ownership and placement.

- Introduce `JourneyMoment` domain model and local aggregate.
- Add atomic local creation transaction.
- Add journey-moment sync operation and server RPC.
- Migrate existing linked entries/stops into the new projection.
- Preserve standalone entries explicitly.
- Add idempotency keys and stale-`syncing` recovery.

Acceptance:

- a journey-created moment cannot appear as standalone
- offline journey moments remain inside the journey
- stage assignment survives refresh, retry, and sync
- retrying sync creates no duplicates

### Phase 2: Save Experience

Goal: make creation obvious and trustworthy.

- Replace technical form with one `Add moment` flow.
- Journey is fixed; stage is optional but prominent.
- Offer photo GPS, current location, and map selection.
- Show photo previews before save.
- Show a review summary: journey, stage, location, photos.
- Return to journey immediately with saved highlight and status toast/banner.
- Provide a visible retry action on sync failure.
- Invalidate journey/dashboard/detail queries after local save and remote
  confirmation.

Acceptance:

- user always knows where the moment will be saved
- user always sees a clear successful result
- no network state blocks local completion

### Phase 3: Journey Browsing

Goal: make the journey feel complete.

- Rebuild timeline from `JourneyMoment[]`.
- Add journey-level gallery.
- Rebuild global journey map from moment locations plus separately styled plans.
- Link map markers, gallery photos, and timeline cards to the same moment.
- Add moment detail location map and journey breadcrumb.
- Make every timeline moment openable and add previous/next navigation.
- Add clear empty states and counts.

Acceptance:

- every moment photo is visible in timeline and gallery
- every located moment is visible on the global map
- selecting a marker identifies and opens its moment
- no stop/moment duplicate cards

### Phase 4: Organization And Repair

Goal: let users correct historical and incomplete content.

- Add `Move to stage`, `Move to journey`, and `Remove from journey`.
- Add unassigned-moment inbox for explicit standalone content.
- Add repair tool for existing partial records.
- Add ordering within stages and date-based grouping.

Acceptance:

- incorrectly placed existing content can be repaired without database work
- standalone content is clearly intentional, not an accidental fallback

### Phase 5: Public Journey And Hardening

Goal: make private and public experiences agree.

- Use the same canonical journey projection for public pages.
- Add public journey gallery and map.
- Supply real covers/thumbnails to public journey and moment cards.
- Hide owner-only synchronization UI from public moment detail.
- Add responsive and accessibility checks.
- Add physical Android/iOS browser tests for file selection and geolocation.
- Add production smoke test covering create -> save -> timeline -> map -> gallery.

Acceptance:

- public journey shows the same organized content as owner view
- critical journey flow is covered in CI and production smoke testing

## Required Test Matrix

| Scenario                              | Timeline                      | Gallery             | Map                 | Assignment    | Sync        |
| ------------------------------------- | ----------------------------- | ------------------- | ------------------- | ------------- | ----------- |
| Journey moment with stage, photo, GPS | visible                       | visible             | visible             | stage         | synced      |
| Journey moment without stage          | visible in unassigned section | visible             | optional            | journey       | synced      |
| Offline journey moment                | visible                       | visible             | visible             | preserved     | pending     |
| Sync retry                            | no duplicate                  | no duplicate        | no duplicate        | preserved     | synced      |
| Interrupted sync                      | visible                       | visible             | visible             | preserved     | recoverable |
| Standalone moment                     | absent from journey           | absent from journey | absent from journey | standalone    | any         |
| Planned stop                          | plan only                     | absent              | distinct marker     | journey/stage | synced      |

## Workstream Ownership

### Agent A: Data And Sync

- domain model
- Dexie aggregate and migrations
- sync operation and Supabase RPC
- RLS/pgTAP/unit tests

### Agent B: Capture And Save UX

- add-moment flow
- photo preview and location sources
- stage assignment/review
- save feedback and retry

### Agent C: Journey Browsing

- canonical journey projection consumer
- timeline
- global map
- journey gallery
- moment detail context

### Integration Owner

- canonical contracts and acceptance tests
- public journey parity
- cross-workstream integration
- browser/E2E verification

## Definition Of Done

The remediation is complete only when a user can:

1. open a journey
2. add a moment with photos and either current or map location
3. choose or skip a stage intentionally
4. save once
5. immediately see the moment in the correct timeline section
6. immediately see its photos in the journey gallery
7. immediately see its location on the global journey map
8. refresh or reconnect without losing placement or creating duplicates
