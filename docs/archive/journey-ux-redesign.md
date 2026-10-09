# Journey UX Redesign

## Goal

Turn the journey experience from a technical content editor into a simple travel
diary that works the way travelers think:

- create a trip
- add photos or a place
- let the app infer time and location when possible
- adjust on a map when needed
- see the result on a timeline and a map immediately

The primary design principle is simple: the user should never have to think in
terms of `journey`, `stage`, `stop`, `entry`, or manual GPS fields.

## Current Product Problem

The current experience is split into separate technical flows:

- `journey` uses its own composer for stage, stop, and guide creation
- `entry` is a separate place where photos are actually attached
- the map is display-only, not a tool for choosing a place
- a stop asks for manual latitude and longitude

This creates a mismatch between the product model and the user model.

User intent:

- "I want to capture what happened here."
- "I want to add photos from this place."
- "I want the location to come from the photos or the map."

Current UI expectation:

- "Create a stage."
- "Create a stop."
- "Enter GPS coordinates."
- "Use another flow for photos."

## User-Centered Product Model

### Visible concepts

- `Trip`
  - A whole vacation, road trip, city break, or hike.
- `Moment`
  - The main unit the user works with.
  - Represents a place and time with photos and a note.
- `Day` or `Stage`
  - Optional grouping of moments.
  - Useful for multi-day trips, but never required up front.

### Internal concepts

These may still exist in data or code, but should not dominate the UI:

- `entry`
- `journey_stop`
- `entry_journey_link`
- low-level photo storage variants

### Rules

- A user can create a trip without creating a stage first.
- A user can add photos directly inside a trip.
- A moment may be created from photos, from a map pin, or from a note.
- GPS is automatic first, map-assisted second, manual entry never primary.
- Stages are optional organization, not a required first step.

## Primary User Flows

### Flow A: Start a new trip

1. User taps `Create trip`.
2. User enters only:
   - trip title
   - optional date range
   - optional short description
3. After save, user lands on an empty trip detail page.
4. Empty state offers three large actions:
   - `Add photos`
   - `Add place on map`
   - `Add note`

Success condition:

- The user reaches meaningful content creation in one step after trip creation.

### Flow B: Add photos first

1. User opens a trip.
2. User taps `Add photos`.
3. User selects one or more photos.
4. App reads:
   - capture time
   - GPS if available
5. App proposes one or more moments.
6. User reviews and confirms:
   - title of place
   - assigned day/stage if relevant
   - optional short note
7. Confirmed moments appear immediately:
   - in timeline
   - on map
   - in trip gallery

Success condition:

- The user can go from camera roll to saved trip moments without touching raw
  coordinates.

### Flow C: Add place without photo GPS

1. User taps `Add place on map`.
2. App opens map picker.
3. User:
   - taps a point
   - or searches for a place
4. App creates a draft moment with that location.
5. User can then add:
   - photos
   - note
   - visit time
   - optional stage/day

Success condition:

- Missing EXIF GPS does not block the user from recording the place quickly.

### Flow D: Add a simple note

1. User taps `Add note`.
2. User creates a lightweight moment with:
   - title
   - note
   - optional time
3. User may attach location and photos later.

Success condition:

- The app supports quick journaling even with incomplete data.

## Screen-Level Wireflow

### 1. Dashboard

Purpose:

- Let the user continue an active trip or start a new one.

Primary actions:

- `Continue trip`
- `Create trip`
- `Add memory`

Changes:

- Reduce the split between journeys and entries.
- Make trips the main object on the screen.
- Reframe standalone entries as memories that may later belong to a trip.

### 2. Create Trip

Purpose:

- Create a trip with minimal friction.

Fields:

- trip title
- start date
- end date
- short description

Primary action:

- `Create trip`

Post-submit behavior:

- Always navigate directly to the new trip detail page.

### 3. Empty Trip Detail

Purpose:

- Turn an empty state into the main onboarding moment for the feature.

Content:

- trip header
- large illustrative map area or cover
- empty state explanation

Primary actions:

- `Add photos`
- `Add place on map`
- `Add note`

Secondary action:

- `Create day/stage`

Important:

- `Create day/stage` should not be the first or loudest action.

### 4. Trip Detail

Purpose:

- Show the trip as a living diary, not a form hub.

Sections:

- hero header with title, date range, status
- trip map
- timeline of days or stages
- moment cards inside each day/stage

Floating action:

- `+ Add`

`+ Add` opens:

- `Add photos`
- `Add place on map`
- `Add note`

### 5. Photo Import Review

Purpose:

- Help the user confirm imported content instead of filling a long form.

Content:

- selected photo strip
- count of photos with GPS
- count of photos without GPS
- proposed grouped moments

Actions per proposed moment:

- rename
- change time
- assign day/stage
- add note
- fix location on map

Primary action:

- `Save moments`

### 6. Map Picker

Purpose:

- Make location completion fast and visual.

Required capabilities:

- tap to drop pin
- search for a place
- confirm selected place

Optional future capabilities:

- current location
- route preview
- saved places

Primary action:

- `Use this place`

### 7. Moment Detail

Purpose:

- Make one travel memory feel complete and easy to edit.

Sections:

- photo gallery
- place title
- date and time
- note
- location preview
- stage/day assignment

Primary edit actions:

- `Add photos`
- `Change place`
- `Edit note`

### 8. Stage or Day Organizer

Purpose:

- Organize moments after capture, not before capture.

Capabilities:

- rename day/stage
- reorder moments
- move moments between days/stages

Primary action:

- `Save organization`

## Information Architecture

### User-facing IA

- Dashboard
- Trips
- Trip detail
- Moment detail
- Map picker
- Photo import review
- Trip settings

### Hidden technical IA

- Entries remain a storage and publishing concept.
- Journey stops remain a location-bearing concept.
- Entry-to-journey links remain an internal relation.
- Photo variants remain a storage optimization detail.

The user should mostly see:

- trip
- moment
- day/stage
- photos
- map

## MVP Scope

### Must have

- Minimal trip creation flow
- Empty trip onboarding state
- Trip detail with map and timeline
- One `+ Add` action sheet
- Add photos directly inside a trip
- Read capture time from photo metadata when available
- Read GPS from photo metadata when available
- Map picker for missing GPS
- Save a moment with photos, note, and location
- Optional assignment of a moment to a day/stage

### Should have

- Better place title suggestion from map search or reverse geocoding
- Auto-created day grouping based on photo date
- Cover photo for trip and day/stage
- Basic moment reordering

### Not in MVP

- Advanced multi-user collaboration flows
- Auto-clustering of moments across long trips
- Route drawing from all points
- Full public storytelling redesign
- Smart travel recommendations

## UX Writing Direction

Prefer natural language over technical labels.

Use:

- `Trip`
- `Moment`
- `Day`
- `Add photos`
- `Add place`
- `Add note`
- `Fix place on map`

Avoid exposing:

- `Stop`
- `Guide section`
- `Latitude`
- `Longitude`
- `Create stage` as the primary next action

## Delivery Plan

### Phase 1: Reframe the feature

Goal:

- Make the product understandable without changing every underlying concept yet.

Work:

- update navigation language
- redesign empty trip state
- replace technical composer entry points with one `+ Add`

### Phase 2: Photo-first capture

Goal:

- Let users create travel content through photos inside a trip.

Work:

- attach photo flow to trip detail
- propose moment creation from selected photos
- support missing GPS fallback through the map picker

### Phase 3: Moment-centric detail

Goal:

- Make each saved place feel like a real diary record.

Work:

- create moment cards
- build moment detail screen
- allow editing note, time, photos, and place

### Phase 4: Organization and polish

Goal:

- Help users shape the trip after capture.

Work:

- improve day/stage organization
- add better reordering
- improve cover imagery and summaries

## Backlog Proposal

### Epic 1: Trip entry experience

- Redesign dashboard trip actions
- Simplify create-trip completion path
- Build empty trip onboarding state
- Remove manual GPS from the primary journey composer path

### Epic 2: Trip detail redesign

- Add map-first trip detail layout
- Add timeline/day grouping layout
- Add floating `+ Add` action
- Add moment cards with photo previews

### Epic 3: Photo-first capture

- Add photo import entry point from trip detail
- Parse available time metadata
- Parse available GPS metadata
- Create confirmation UI for proposed moments
- Support mixed batches with and without GPS

### Epic 4: Map-assisted capture

- Add map picker screen
- Add place search
- Allow attaching selected place to a moment
- Allow correcting location after save

### Epic 5: Moment model in UI

- Introduce `moment` naming in UI copy
- Build moment detail page
- Add note editing
- Add stage/day assignment
- Add movement of moments between groups

## Key Product Decisions To Confirm

- `Moment` is the primary visible object for captured travel content.
- `Stage` becomes optional and organizational.
- Photo import is the main input path after trip creation.
- Location is automatic first, map-assisted second.
- The trip detail page becomes the primary workspace.
- Technical entities can remain in code, but the UI should hide them.

## References In Current Code

- Journey creation:
  - [src/features/journeys/ui/CreateJourneyForm.tsx](../src/features/journeys/ui/CreateJourneyForm.tsx)
  - [src/pages/journey/CreateJourneyPage.tsx](../src/pages/journey/CreateJourneyPage.tsx)
- Current journey detail and composer:
  - [src/pages/journey/JourneyPage.tsx](../src/pages/journey/JourneyPage.tsx)
  - [src/features/journeys/ui/JourneyComposer.tsx](../src/features/journeys/ui/JourneyComposer.tsx)
  - [src/features/journeys/ui/JourneyMap.tsx](../src/features/journeys/ui/JourneyMap.tsx)
- Current entry photo flow:
  - [src/pages/entry/CreateEntryPage.tsx](../src/pages/entry/CreateEntryPage.tsx)
  - [src/features/entries/ui/CreateEntryForm.tsx](../src/features/entries/ui/CreateEntryForm.tsx)
- Roadmap and product model:
  - [docs/implementation-plan.md](./implementation-plan.md)
