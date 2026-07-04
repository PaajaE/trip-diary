# Memory-First UX Plan

**Status:** Active — follow this plan in order; do not skip phases.  
**Supersedes for execution:** delivery sections in `journey-ux-redesign.md` (vision stays valid; this doc is the execution contract).  
**Complements:** `journey-full-remediation-plan.md` (data/sync correctness), `offline-hardening-plan.md` (sync reliability).

---

## North star

> Every save ends with the user **seeing their memory in context** on the trip timeline. Sync is background infrastructure, never a blocking step.

**Success metric (qualitative):** A traveler can add a moment in ≤4 taps and immediately see it on the trip — without modals, without hunting for sync status.

---

## Frozen product decisions

These are **not revisited** during implementation unless explicitly escalated:

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Trip is the primary workspace** | Standalone entries are secondary; dashboard unifies around trips. |
| D2 | **Save → navigate → highlight** | No interstitials on the save path (share, nature match). |
| D3 | **Share is pull, not push** | One icon per level (account, trip, moment); no post-save fullscreen share sheet. |
| D4 | **Stage/etapa is optional labeling** | Never required to save; auto-suggest later; not in create form (Phase E). |
| D5 | **Author trip = single scroll page** | Kill Overview/Map/Gallery/More tabs for authors; mirror public reader layout. |
| D6 | **Inline editing on timeline** | Daily edits happen on the trip page; `/e/$id` is deep-link / share landing, not default workflow (Phase C). |
| D7 | **Honest sync copy** | Never imply server-complete when only queued locally; per-moment indicators on cards. |
| D8 | **Local-first unchanged** | No server-first rewrites; UX changes only unless a bug forces a data fix. |

---

## Visible hierarchy (target)

```
Account (space / family diary)
  └── Trip
        └── Moment
```

Hidden from primary UI: `entry`, `stop`, `journey_link`, `photo_variant`, outbox ops.

---

## Phase overview

| Phase | Name | Est. | User-visible outcome |
|-------|------|------|----------------------|
| **A** | Save feels right | 1–2 days | Save → trip → highlighted card + toast + per-card sync |
| **B** | Trip is one page | 3–5 days | Single scroll trip; no author tabs |
| **C** | Inline moment editing | 3–5 days | Edit on timeline; `/e/$id` demoted |
| **D** | Dashboard cleanup | 1–2 days | One trip list; share icon; unsorted inbox |
| **E** | Stages as labels | later | Auto day groups; stage picker removed from create |

**Gate rule:** Phase B does not start until Phase A acceptance tests pass. Same for C→B, D→C, E→D.

---

## Phase A — Save feels right

### Goal

Tap **Save moment to trip** → land on trip timeline → new moment visible and highlighted → brief confirmation → background sync with per-card status.

### In scope

1. Remove blocking post-save modals from save path.
2. Navigate immediately after local write succeeds.
3. Scroll to and highlight the new moment card.
4. Add ephemeral save confirmation (toast).
5. Add per-moment sync indicator on timeline cards.
6. Keep nature match and share as **optional, on the card or trip header** — not on save path.

### Out of scope (Phase A)

- Tab removal (Phase B).
- Inline editing (Phase C).
- Dashboard redesign (Phase D).
- Stage/etapa UX changes (Phase E).
- New toast library if a minimal in-app component suffices.

### Tasks

#### A1 — Simplify `CreateJourneyMemoryPage` post-save flow

**File:** `src/pages/journey/CreateJourneyMemoryPage.tsx`

- [ ] Remove `ShareMomentPrompt` from save path (component stays; used from trip/moment share only).
- [ ] Remove `NatureMatchBanner` from save path (component stays; surfaced on moment card in A4).
- [ ] On `onCreated`: invalidate journey queries, then `navigate` to `/j/$journeyId?highlight=$entryId` (new search param).
- [ ] Pass `photosFailed` via existing `notice=photos_failed` search param (keep current behavior).
- [ ] Ensure `void syncPendingOperations()` still fires from form (background, non-blocking).

**Do not:** await sync before navigate (journey flow must stay fire-and-forget).

#### A2 — Router: `highlight` search param

**File:** `src/app/router.tsx`

- [ ] Add `highlight: z.uuid().optional()` to journey route `validateSearch`.
- [ ] Pass `highlight` through to `JourneyPage` props.

#### A3 — Journey page: scroll, highlight, clear param

**Files:**
- `src/pages/journey/JourneyPage.tsx`
- `src/features/journeys/ui/JourneyStorySection.tsx` (or extract `MomentCard` if needed)

- [ ] On mount / when `highlight` is set and moment exists in composed content:
  - Scroll moment card into view (`element.scrollIntoView({ behavior: 'smooth', block: 'center' })`).
  - Apply highlight animation class for ~2s (e.g. ring / background pulse).
  - Clear `highlight` from URL via `replace` navigation (avoid back-button loop).
- [ ] If `highlight` entry not found (race): show toast "Saved" anyway; no error state.

#### A4 — Save confirmation toast

**Files:** new `src/shared/ui/Toast.tsx` + `src/shared/ui/ToastProvider.tsx` (or minimal portal), wire in `src/app/AppShell.tsx` or root.

- [ ] Toast API: `showToast({ message, variant?, duration? })`.
- [ ] On journey landing with `highlight`: show localized toast:
  - Online: `"Saved · syncing…"` / CS equivalent.
  - Offline: `"Saved · will sync when online"`.
- [ ] Auto-dismiss ~2.5s; non-blocking; `role="status"`.
- [ ] No third-party dependency required.

**i18n keys** (add to `src/shared/i18n/en.ts`, `cs.ts`):
- `moment.saved`
- `moment.savedOffline`
- `moment.savedPhotosFailed` (when `notice=photos_failed`)

#### A5 — Per-moment sync indicator on cards

**Files:**
- `src/features/journeys/ui/JourneyStorySection.tsx` (`MomentCard`)
- `src/entities/entry/model/entry.ts` (syncStatus already on entries)
- Optional: `src/features/sync/ui/MomentSyncIndicator.tsx`

- [ ] Read `moment.entry.syncStatus` (+ photo pending if needed).
- [ ] States:
  | Status | UI |
  |--------|-----|
  | `pending` / `local` | Small cloud-arrow icon + `aria-label` |
  | syncing (global + this entry pending) | Subtle spinner on card |
  | `synced` | Checkmark, fade after 3s or on next navigation |
  | `failed` | Warning icon + tap → retry single entry or open sync panel |
- [ ] Indicator is **on the card**, not only in global header.

#### A6 — Nature match chip (non-blocking)

**Files:** `MomentCard`, `src/features/nature/ui/NatureMatchBanner.tsx` (reuse logic, compact UI)

- [ ] After save, if photos exist and nature goals are active: show small chip on highlighted card: `"Spot wildlife?"` → expands inline or opens existing banner in a **sheet**, not blocking navigation.
- [ ] Chip hidden after user dismisses or spots.

#### A7 — Share from trip/moment (not save path)

**Files:**
- `src/pages/journey/JourneyPage.tsx` (trip header — already has share)
- `MomentCard` — add small share icon

- [ ] Trip header: keep single share icon (`useJourneyPublicShare`).
- [ ] Moment card: share icon; disabled or tooltip when `syncStatus !== 'synced'` OR public paths unavailable.
- [ ] On premature share tap: toast `"Syncing — try again in a moment"` (not a broken link).
- [ ] `ShareMomentPrompt` may be deleted OR repurposed as a small bottom sheet opened from share icon — **never auto-opened on save**.

### Phase A — Acceptance criteria (all must pass)

| # | Criterion | How to verify |
|---|-----------|---------------|
| A-AC1 | Save with photos → user sees trip timeline within 1 navigation, no fullscreen modal | Manual + E2E |
| A-AC2 | New moment card is scrolled into view and visually highlighted | Manual |
| A-AC3 | Toast appears with correct online/offline copy | Manual |
| A-AC4 | Moment card shows pending sync icon before server sync | Manual offline→online |
| A-AC5 | Moment card shows synced state after sync completes | Manual |
| A-AC6 | `notice=photos_failed` still shows amber banner on trip | Existing test pattern |
| A-AC7 | Share is NOT shown automatically after save | Manual |
| A-AC8 | Tapping moment share before sync shows friendly message, not dead link | Manual |
| A-AC9 | Local save still works fully offline; moment visible before sync | Unit/integration (existing merge tests) |
| A-AC10 | No regression: `pnpm test` green; add test for `highlight` param handling | CI |

### Phase A — Tests to add

- [ ] `CreateJourneyMemoryPage`: `onCreated` navigates with `highlight` entryId (mock navigate).
- [ ] `JourneyPage` or `JourneyStorySection`: renders sync indicator for `syncStatus: 'pending'`.
- [ ] Router: accepts `highlight` uuid in journey search schema.

### Phase A — Definition of done

- [ ] All A-AC1–A-AC10 pass.
- [ ] i18n EN + CS for new strings.
- [ ] PR description references this doc section.
- [ ] `docs/journey-full-remediation-plan.md` updated: mark "highlight on return" and "per-moment sync" as done.

---

## Phase B — Trip is one page

### Goal

Author trip view = one continuous scroll (like public reader), not four tabs. Map, gallery, and secondary features are sections or expandables — not primary navigation.

### In scope

1. Replace `JourneySectionTabs` author navigation with single scroll layout.
2. Reuse public reader section structure where possible.
3. Sticky compact header: back/title, **share icon**, **manage gear**.
4. `TripSummaryLine` stays under title.
5. Sections in order: map teaser → story timeline → gallery strip → collapsed nature/guides.
6. FAB `+` opens bottom sheet: Add photos / Add place / Add note.
7. URL: drop `section` param for author (or map sections to scroll anchors only).

### Out of scope (Phase B)

- Inline moment editing (Phase C).
- Dashboard changes (Phase D).
- Public reader changes (already correct).
- Removing `JourneyManageSheet` — stays behind gear icon.

### Tasks

#### B1 — New author layout component

**Files:**
- New: `src/features/journeys/ui/JourneyAuthorScroll.tsx` (or refactor `JourneyOverview.tsx`)
- Reference: `src/pages/reader/JourneyReaderPage.tsx`, `src/features/journeys/lib/journey-reader-section.ts`

- [ ] Single column scroll with `id` anchors: `story`, `map`, `gallery`.
- [ ] Map: teaser card (existing overview pattern) → tap expands fullscreen sheet (keep current `JourneyMap` sheet).
- [ ] Gallery: horizontal strip or compact grid → "See all" expands or scrolls to gallery section.
- [ ] Story: `JourneyStorySection` (unchanged from Phase A).
- [ ] Nature strip: collapsed by default; expand on tap (move out of always-visible if too heavy).

#### B2 — Simplify `JourneyPage`

**File:** `src/pages/journey/JourneyPage.tsx`

- [ ] Remove `JourneySectionTabs` and `selectSection` state for author view.
- [ ] Remove `JourneyMoreSheet` as primary nav — contents move to gear menu or inline collapsed sections.
- [ ] Keep FAB linking to `/memory/new` OR wire FAB sheet (B3).
- [ ] Header: title, dates, `TripSummaryLine`, `[share]` `[gear]`.
- [ ] Remove "Show engagement" from prominent position (footer or remove — per D8 scope check with product).

#### B3 — FAB action sheet

**File:** new `src/features/journeys/ui/JourneyAddSheet.tsx`

- [ ] Three actions:
  - **Add photos** → `/j/$journeyId/memory/new`
  - **Add place** → existing `JourneyPlaceCaptureSheet`
  - **Add note** → `/j/$journeyId/memory/new` with `?mode=note` OR same form with note-first (minimal query flag).
- [ ] Replace bare FAB navigation if sheet is implemented; otherwise FAB → sheet → route.

#### B4 — Wire `showInlineCapture` empty state

**File:** `src/features/journeys/ui/JourneyOverview.tsx` → merged into B1 layout

- [ ] Empty trip shows three large CTAs (from `journey-ux-redesign.md` Flow A).
- [ ] Remove dead `showInlineCapture={false}` — enable empty state CTAs.

#### B5 — URL / scroll parity

- [ ] Optional: `?section=map` scrolls to map anchor on load (author), matching public reader behavior.
- [ ] Remove author-only tab state that doesn't sync to URL.

### Phase B — Acceptance criteria

| # | Criterion |
|---|-----------|
| B-AC1 | Author trip has no Overview/Map/Gallery/More tab bar |
| B-AC2 | User can reach map, story, and photos without leaving the page |
| B-AC3 | Share icon visible in trip header without opening a sheet |
| B-AC4 | FAB (+) presents add options in ≤1 tap |
| B-AC5 | Empty trip shows Add photos / Add place / Add note |
| B-AC6 | Public reader unchanged |
| B-AC7 | Phase A save→highlight flow still works on new layout |
| B-AC8 | `pnpm test` green; update `JourneyPage.remediation.test.tsx` |

### Phase B — Definition of done

- [ ] B-AC1–B-AC8 pass.
- [ ] `JourneySectionTabs` unused in author path (may remain for transitional period behind flag — remove before closing B).

---

## Phase C — Inline moment editing

### Goal

Edit title, note, photos, and location from the trip timeline without routing to `/e/$entryId` for everyday changes.

### In scope

1. Expandable moment card (tap → expand).
2. Inline edit mode on expanded card.
3. `/e/$entryId` retained for share links, deep links, and full-screen edit when needed.
4. "Open full page" link on expanded card (secondary).

### Out of scope (Phase C)

- Drag-and-drop reorder (Phase E).
- Rich text / markdown.
- New entry types.

### Tasks

#### C1 — Expandable `MomentCard`

**File:** `src/features/journeys/ui/JourneyStorySection.tsx` (extract `MomentCard` to own file if >200 lines)

- [ ] Collapsed: photo thumb, title, excerpt, location pin, sync icon, share icon.
- [ ] Expanded: full body, photo grid (reuse `EntryPhotoGrid`), edit button.
- [ ] Single expanded card at a time (accordion).

#### C2 — Inline edit form

**Files:** new `src/features/journeys/ui/InlineMomentEditor.tsx`; reuse validators from `EditEntryForm`.

- [ ] Fields: title, body, event date (optional).
- [ ] Save → local write + outbox (same repos as `EditEntryForm`).
- [ ] Cancel → revert expanded view.
- [ ] On save: toast `"Updated"`; no navigation.

#### C3 — Demote `/e/$entryId` in author flows

**Files:** `JourneyStorySection`, `JourneyGallery`, `JourneyMap` popups

- [ ] Replace `onOpenEntry` default with expand card where `returnTo` is trip.
- [ ] Keep `/e/$entryId` for: shared URLs, gallery if user taps "Open full page", map marker if preferred.

#### C4 — Entry page role

**File:** `src/pages/entry/EntryPage.tsx`

- [ ] Add banner when opened with `returnTo`: "Editing on trip page is faster" with link back (optional, subtle).
- [ ] Entry page remains for delete, visibility, type changes.

### Phase C — Acceptance criteria

| # | Criterion |
|---|-----------|
| C-AC1 | User can edit moment title/body from trip without route change |
| C-AC2 | Photo add/delete on trip still works (existing `EntryPhotoGrid`) |
| C-AC3 | Shared `/e/$slug` links still work |
| C-AC4 | Inline save triggers background sync + card sync indicator |
| C-AC5 | Phase A and B flows unaffected |

---

## Phase D — Dashboard cleanup

### Goal

One mental model on login: **your trips**. Share family diary from header. Orphan moments in small "Unsorted" section.

### In scope

1. Merge journeys + entries columns into one trip-first layout.
2. Continue-trip hero stays (primary CTA).
3. Account-level share icon → public space URL.
4. "Unsorted" section for entries not linked to any journey (count badge).
5. Remove or demote standalone "Add entry" to account menu / unsorted section.

### Out of scope (Phase D)

- Deleting standalone entry flow entirely.
- Space management redesign.

### Tasks

#### D1 — Dashboard layout

**File:** `src/pages/dashboard/DashboardPage.tsx`

- [ ] Single "Your trips" grid/list.
- [ ] `ContinueTripHero` at top.
- [ ] Unsorted entries: compact list below, only if count > 0.
- [ ] Remove side-by-side journeys | entries columns.

#### D2 — Header share

**File:** `src/pages/dashboard/DashboardPage.tsx` or `AppShell.tsx`

- [ ] Share icon for active space public URL (reuse `getJourneyPublicPaths` pattern for space — or space-level share API).
- [ ] One icon, native share sheet on tap.

#### D3 — Copy / i18n

- [ ] Update dashboard strings: trips-first language.
- [ ] "Quick note" → account menu or unsorted inline add.

#### D4 — Dashboard data

**File:** `src/entities/dashboard/api/dashboard.repository.ts`

- [ ] Ensure journey-linked entries excluded from unsorted (already per remediation — verify).

### Phase D — Acceptance criteria

| # | Criterion |
|---|-----------|
| D-AC1 | Dashboard shows one trip list, not two competing columns |
| D-AC2 | Share icon shares space/diary link |
| D-AC3 | Unsorted moments visible and attachable to trip (link to create memory or assign — minimal: link to entry) |
| D-AC4 | Continue hero works |

---

## Phase E — Stages as labels (later)

### Goal

Remove etapa friction from create flow; auto-group moments by date; manual reorganize in manage sheet.

### In scope

1. Remove stage picker from `CreateJourneyMemoryForm` (or hide behind "Organize" advanced).
2. Auto-create day groups from `eventDate` / photo EXIF date.
3. `JourneyManageSheet` → Organize: drag moments between day groups.
4. Rename "Stage" → "Day" in UI copy (i18n).

### Out of scope (Phase E)

- ML clustering across trips.
- Route drawing.

### Tasks (high level)

- [x] E1: Auto-group algorithm in `composeJourneyContent` or presentation layer.
- [x] E2: Remove stage select from create form.
- [x] E3: Reorder / move UI in organize panel.
- [x] E4: Migration: existing stages remain; new moments default to auto day.

**Gate:** Only start after Phases A–D shipped and stable for 1 week in real use.

---

## Cross-cutting requirements (all phases)

### i18n

- Every new user-facing string in `en.ts` and `cs.ts`.
- No hardcoded Czech in touched files (fix `SpacesRoutePage`, `CreateEntryPage` if touched).

### Accessibility

- Toast: `role="status"`, `aria-live="polite"`.
- Sync indicators: `aria-label` per state.
- Highlight animation: respect `prefers-reduced-motion` (instant scroll, no pulse).

### Sync behavior (unchanged)

- Local write first; outbox second.
- `syncPendingOperations()` background; never block navigate on journey save.
- Cellular sync respects `sync-preferences.ts`.

### Testing discipline

- Unit tests for new components and navigation params.
- Update `JourneyPage.remediation.test.tsx` when journey layout changes.
- Manual smoke script (below) before closing each phase.

---

## Manual smoke script (run before merging each phase)

```
1. Sign in.
2. Open active trip (or create minimal trip).
3. Add moment with 1 photo + short note.
   → Expect: land on trip, card highlighted, toast, sync icon on card.
4. Toggle airplane mode; add another moment.
   → Expect: card appears, toast says offline variant, pending icon.
5. Go online; wait for sync.
   → Expect: card shows synced; header sync badge OK.
6. Tap trip share icon.
   → Expect: share sheet or copy link (no error).
7. Tap moment share before sync (if testable).
   → Expect: friendly wait message, not 404 link.
8. Refresh page on trip.
   → Expect: moments still present (local + remote).
```

---

## File map (quick reference)

| Area | Primary files |
|------|----------------|
| Save flow | `CreateJourneyMemoryPage.tsx`, `CreateJourneyMemoryForm.tsx` |
| Router | `src/app/router.tsx` |
| Trip author | `JourneyPage.tsx`, `JourneyOverview.tsx`, `JourneyStorySection.tsx` |
| Public reader (reference) | `JourneyReaderPage.tsx`, `journey-reader-section.ts` |
| Sync UI | `SyncStatusControl.tsx`, `use-sync-status.ts`, new `MomentSyncIndicator.tsx` |
| Share | `ShareMomentPrompt.tsx`, `ShareActions.tsx`, `use-journey-public-share.ts` |
| Dashboard | `DashboardPage.tsx`, `dashboard.repository.ts` |
| Local merge | `journey-local-merge.ts`, `journey-content.ts` |
| i18n | `src/shared/i18n/en.ts`, `cs.ts` |
| Tests | `JourneyPage.remediation.test.tsx`, `journey-assignment.remediation.test.ts` |

---

## What we explicitly do NOT do in this plan

- Rewrite Supabase schema or RPCs (unless sync bug blocks UX).
- Add push notifications.
- Redesign public reader (already aligned with target).
- Add social feed / likes prominence.
- Auto-cluster photos across multiple trips.
- Replace Dexie/outbox architecture.
- New native Capacitor screens.

---

## Progress tracker

Update checkboxes in this file as tasks complete.

| Phase | Status | Completed |
|-------|--------|-----------|
| A — Save feels right | ✅ Done | 2026-07-03 |
| B — Trip is one page | ✅ Done | 2026-07-03 |
| C — Inline editing | ✅ Done | 2026-07-03 |
| D — Dashboard cleanup | ✅ Done | 2026-07-03 |
| E — Stages as labels | ✅ Done | 2026-07-03 |

---

## Related documents

- Vision & wireflows: `docs/journey-ux-redesign.md`
- Data/sync remediation: `docs/journey-full-remediation-plan.md`
- Offline policy: `docs/offline-hardening-plan.md`
- Architecture: `docs/architecture.md`
