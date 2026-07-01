# Nature Field Diary — Review & Implementation Plan

## Executive summary

The first slice added **database tables**, **bundled checklist templates**, a **Checklist tab**,
**checkbox → planned stop** wiring, a **lightbox observation form**, and a **GBIF panel**.
That is a useful scaffold, but it is **not yet a coherent product experience**.

More importantly: layered on top of an already **dense trip UI**, the nature feature makes the
app feel **heavier** — more tabs, more panels, more forms, more uppercase labels. That is the
opposite of what a field diary on a trail should feel like.

This document:

1. Audits **why the UI feels hard** (whole trip shell + nature add-on).
2. Defines a **soft, seamless** target — calm surfaces, one primary action, nature woven into
   the trip home screen, not bolted on as a checklist app.
3. Breaks work into **agent-ready phases** where **UI softness comes before feature depth**.

> **Principle:** If a screen needs a paragraph of explanation, it is too complex.
> Nature should feel like a gentle layer on the diary, not a second product inside it.

---

## Part 0 — Soft UI audit (why it feels hard today)

### The trip page stacks weight

On a single trip, the user currently hits — in order:

| Layer                              | What it feels like                                           |
| ---------------------------------- | ------------------------------------------------------------ |
| Hero header                        | Large title, gradients, status chips, manage + share buttons |
| **6 solid pill tabs**              | Must choose a mode before doing anything                     |
| **Engagement box**                 | Hearts/comments — another bordered card                      |
| Section eyebrow + H2 + body        | Repeated for every tab                                       |
| Overview **4 stat cards**          | Dashboard metrics (counts in bold)                           |
| **3 capture tiles**                | Another decision grid                                        |
| Recent moments, photos, map teaser | More sections                                                |

That is **seven visual “systems”** before the user adds one photo. No wonder it feels strong.

### Nature made it worse

| Pattern                                         | Why it hurts                                |
| ----------------------------------------------- | ------------------------------------------- |
| New **Checklist tab**                           | +1 tab in an already crowded bar            |
| **Primary green button** “Add nature checklist” | Shouts for attention; feels like setup work |
| **Full-screen sheet** for templates             | Context switch; 3 dense cards with metadata |
| **Checkbox rows** in bordered cards             | Task manager, not a family hike             |
| **UPPERCASE category headers**                  | Admin UI                                    |
| **Observation form in lightbox**                | 4 fields on a black overlay — high friction |
| **GBIF panel** at bottom                        | Another bordered box of lists               |

### Tone mismatch

`docs/journey-ux-redesign.md` already says: _one `+ Add` action, photo-first, never expose
stops/GPS_. The built UI still behaves like a **structured CMS** (tabs → sections → forms).

Nature should follow the **diary** metaphor:

- “We hoped to see a falcon” → soft wish, not a checkbox task.
- “We saw one!” → a photo moment, not a form submission.
- Regional facts → whispered context when online, not a data panel.

### Soft UI principles (binding for all phases)

```text
1. One calm home      — Trip opens to a scroll, not a tab grid.
2. One primary action — Floating + or single “Add moment”; rest is secondary.
3. Progressive depth  — Show a line + photo first; details on tap.
4. Soft affordances   — Tinted rows, gentle chips; avoid solid green blocks & checkboxes.
5. Inline not modal   — Prefer expand-in-place over full-screen sheets.
6. Quiet chrome       — Fewer eyebrows, smaller headings, collapse engagement by default.
7. Suggest, don’t ask — After photo: “Falcon?” chip, not empty form.
8. Offline = normal   — No error tone when GBIF unavailable; simply hidden.
```

### Visual tokens (light touch)

Keep existing palette; **use it more quietly**:

| Today                                   | Softer                                                 |
| --------------------------------------- | ------------------------------------------------------ |
| Active tab = solid `bg-primary` pill    | Active = soft underline or `bg-primary/8` text-primary |
| `font-semibold` everywhere              | Semibold for titles only; body `font-normal`           |
| `rounded-2xl border shadow-soft` cards  | Prefer borderless `bg-background/60` rows with spacing |
| Primary buttons for secondary actions   | `ghost` / text link for “Add goals”, “Show map”        |
| `text-accent` eyebrows on every section | One eyebrow per screen max                             |
| 4-up stat grid                          | One quiet summary line: “12 moments · 8 on map”        |

---

## Part 0b — Proposed trip UI flow (soft & seamless)

### A. Default trip view = calm scroll (“Home”)

**Remove the feeling of “pick a tab first”.** Default section stays overview-like but richer:

```text
┌────────────────────────────────────────┐
│  [smaller header — title + dates only] │
│                                        │
│  ┌─ floating + ─────────────────────┐  │  ← single primary FAB or bottom bar
│  │  Add moment (photos)             │  │
│  └────────────────────────────────┘  │
│                                        │
│  · 12 moments · 8 on map · 4/12 příroda │  ← one line, not 4 stat cards
│                                        │
│  ┌ Příroda na cestě ────────────────┐  │  ← inline strip, NOT a tab
│  │ ○ Sokol  ○ Orchidej  ● Pravčická │  │     horizontal chips, tap = detail
│  │ [+ Přidat cíle]                  │  │
│  └──────────────────────────────────┘  │
│                                        │
│  [story timeline preview…]             │
│  [photo filmstrip…]                    │
│  [map peek — tap expands]              │
│                                        │
└────────────────────────────────────────┘
```

**Navigation simplification:**

| Keep                                    | Change                                               |
| --------------------------------------- | ---------------------------------------------------- |
| Map (full screen deserves its own mode) | Merge Overview + Story → **Home** scroll             |
| Gallery                                 | Move Tips + deep nature guide under **⋯ More** sheet |
| —                                       | **Remove Checklist tab** — nature lives on Home      |

Target: **3 visible modes** — Home · Map · Photos — plus overflow.

### B. Nature on Home (not a tab)

**Empty state** — horizontal scroll of 3 destination cards (illustration + one line).
No dashed box, no “Add nature checklist” button.

Copy: _„Kam jedete? Vyberte park a my přidáme tipy, co stojí za povšimnutí.“_

**With goals** — compact chip row:

- Empty circle = not yet
- Filled soft green = spotted
- Tap chip → **bottom sheet** (not new page): hint, map link, “Přidat fotku”

**No checkboxes.** Tap chip toggles “spotted” only with confirmation if no photo linked:
_„Označit bez fotky?“_ with gentle secondary action.

### C. Photo-first spotting (zero form by default)

```text
User adds moment with photos (existing flow)
        ↓
If GPS + trip has nature goals:
  soft banner under photos:
  „Možná jste viděli: [Sokol] [Orchidej] [Jiné…]“
        ↓
Tap chip → saves observation + checks goal + done
        ↓
Optional „Upravit“ expands name/notes (collapsed by default)
```

Lightbox: **no form visible by default**. Only:

- Tags (existing, chip style)
- One line: “Zapsat druh” → opens sheet if needed

### D. Template picker — inline, not full screen

Replace `ApplyChecklistTemplateSheet` with:

- Horizontal cards on Home (empty state), or
- **Half-height bottom sheet** with swipe-to-dismiss
- Single tap applies — no “configuration” step

### E. Field guide — collapsed by default

On Home nature strip, small text link: _„Co žije v okolí“_ (online only).

Expands inline accordion — 3 species max, not a full panel.
GBIF/Wikipedia never compete with the diary content.

### F. Trip creation — one optional line

Do **not** add a wizard step. Under summary field:

_„Jedete do parku?“_ → optional chip row (České Švýcarsko · Krkonoše · Šumava).

Untouched = fine. Selected = template applied after create, land on Home with chips visible.

---

## Part 0c — Immediate changes to current UI (before new features)

These are **low-risk softness wins** agents can do in one pass on existing code:

| Change                                                   | File(s)                                                  | Effect                 |
| -------------------------------------------------------- | -------------------------------------------------------- | ---------------------- |
| Softer tab active state (tint not solid fill)            | `JourneySectionTabs.tsx`, `JourneyReaderSectionTabs.tsx` | Less “control panel”   |
| Collapse `ContentEngagement` behind “Reakce” link        | `JourneyPage.tsx`                                        | Removes mid-page box   |
| Smaller trip header (drop `text-5xl`, lighter gradient)  | `JourneyPage.tsx`                                        | Less landing-page hero |
| Replace checklist checkboxes with tap rows + soft circle | `JourneyChecklistSection.tsx`                            | Warmer interaction     |
| Secondary style for “Add template” (ghost, not primary)  | `JourneyChecklistSection.tsx`                            | Less shouting          |
| Hide observation form until “Zapsat druh” tapped         | `PhotoLightbox.tsx`                                      | Calmer gallery         |
| Remove uppercase category labels                         | `JourneyChecklistSection.tsx`                            | Softer hierarchy       |
| Merge stat grid → one summary line on overview           | `JourneyOverview.tsx`                                    | Less dashboard         |

**Agent prompt (soften pass):**

```text
Implement Part 0c of docs/nature-field-diary-plan.md — UI softness on existing trip
and checklist UI. No new features. Match journey-ux-redesign calm tone.
```

---

## Part 1 — Honest review of current state

### What works

| Area            | Status                                                             |
| --------------- | ------------------------------------------------------------------ |
| Schema          | `journey_checklist_items`, `nature_observations` with RLS          |
| Templates       | 3 Czech destinations in `src/entities/checklist/data/templates.ts` |
| Offline writes  | Local IndexedDB + sync ops for checklist & observations            |
| Checklist apply | Copies template items; map items create `journey_stops`            |
| Check toggle    | Marks linked stop `visited` / `planned`                            |
| Photo path      | Wildlife/flowers/geology tag → observation form in lightbox        |
| Regional data   | GBIF occurrence search + Wikipedia summary (online)                |

### Critical UX problems

#### 1. Tab sprawl + hard chrome (navigation fatigue)

Trip detail has **6 tabs** with **solid green active pills**, plus engagement box, stat grid,
and section headers. Public reader has **7** tabs.

Users should not pick a “mode” before living the trip. **Nature must live on Home**, not as
another tab between Gallery and Tips.

**Fix direction:** **Home scroll** + Map + Photos; nature as an **inline strip**; guide
collapsed; details in bottom sheets.

#### 1b. UI tone too strong (visual weight)

See **Part 0**. Even without nature, the trip page is dense. Nature features copied patterns
(checkboxes, primary CTAs, full sheets) that amplify the problem.

**Fix direction:** Part 0c soften pass first; all new nature UI uses soft principles.

#### 2. Disconnected flows (the core product bug)

Today these are separate silos:

```
Checklist checkbox  ✗  Observation  ✗  Photo moment  ✗  Map pin
```

A user checking “Sokol stěhovavý” gets no prompt to add a photo, no link to
their moment, and `checklist_item_id` on observations is **never set**.

The diary’s strength is **photos + place + story**. Nature features must
attach to that loop, not sit beside it.

#### 3. Discoverability

- Checklist only appears if user finds the Checklist tab.
- No prompt at **trip creation** or on **empty trip overview**.
- Observation form only appears after manually tagging a photo in the lightbox.
- No suggestion from checklist item → “Log this species”.

#### 4. Map integration is one-way

- Applying a template creates planned stops, but checklist rows are not tappable
  (“Show on map”).
- Map pins for planned stops do not show checklist context (category icon, notes).
- No distinct visual for **nature goals** vs generic planned places.

#### 5. Nature guide is weak contextually

- GBIF center = **first located item in template**, not trip bbox / user moments.
- Wikipedia always **English**; app is CS-first.
- GBIF results are **in-memory only** — lost offline, refetched every visit.
- Panel dumped at bottom of checklist — feels like an appendix.

#### 6. Copy & mental model

| Current label                 | Problem        | Softer alternative     |
| ----------------------------- | -------------- | ---------------------- |
| “Checklist”                   | Chores         | _Příroda na cestě_     |
| “Add nature checklist”        | Setup task     | _Přidat tipy na park_  |
| “Destination checklist”       | Administrative | (never show)           |
| “Log a sighting”              | Form language  | _Tohle jsme viděli_    |
| Category `WILDLIFE` uppercase | CMS            | Small chip with icon   |
| “Nature guide” panel          | Appendix dump  | _Co žije v okolí_ link |

**Target language (CS-first):**

- Strip title: **Příroda na cestě**
- Wishes: **Na co se těšíme**
- Spotted: **Co jsme viděli**
- Reference: **O přírodě tady** (collapsed)

#### 7. Technical gaps

| Gap                                             | Impact                                             |
| ----------------------------------------------- | -------------------------------------------------- |
| No pgTAP tests for new tables                   | RLS not verified in CI                             |
| Checklist not in journey snapshot cache         | Offline trip page may miss checklist until queried |
| `applyChecklistTemplate` partial online failure | Some items remote, some local — inconsistent       |
| No custom checklist items                       | Power users stuck with templates only              |
| No remove / reset template                      | Mistake is permanent                               |
| Collections not enriched                        | Wildlife album still photo-count only              |
| `listJourneyObservations` in mutation file      | Confusing module boundaries                        |
| Public reader `creatorId=""`                    | Fragile if edit paths expand                       |

---

## Part 2 — Target product model

### User-facing concepts (visible)

```text
Trip
  └── Nature  (one tab)
        ├── Goals        — what to look for (from template + custom)
        ├── Sightings    — logged species/plants/rocks with photo + place
        └── Field guide  — regional reference (GBIF, later Wikidata/iNat)
```

### Internal concepts (hidden)

```text
journey_checklist_items   — goals with optional stop_id, entry_id
nature_observations       — sightings linked to photo, moment, checklist item
journey_stops (planned)   — map anchors for goals with coordinates
photo_tags                — auto-collections (wildlife, flowers, geology)
```

### Golden rules

1. **Photo-first evidence** — checking a goal should optionally create or link a moment.
2. **One nature home** — never spread nature across 3 tabs.
3. **Offline honest** — goals & sightings work offline; guide enriches when online.
4. **Map is navigation** — every located goal is one tap from map.
5. **Family-friendly** — progress (“4/12 spotted”) visible on overview.

### Primary user stories

| #   | Story                                     | Success                                                      |
| --- | ----------------------------------------- | ------------------------------------------------------------ |
| S1  | Planning a family hike to České Švýcarsko | Add nature goals in <30s at trip create or overview          |
| S2  | Kid spots a falcon                        | Photo → species log → goal auto-checked                      |
| S3  | On trail without signal                   | See goals, check off, add sighting; sync later               |
| S4  | Looking at map                            | Nature pins distinct; tap → goal detail                      |
| S5  | Sharing trip publicly                     | Readers see goals progress + sightings + wildlife collection |

---

## Part 3 — Information architecture (revised for soft UI)

### Trip navigation (target)

```text
Home (scroll)  |  Map  |  Photos  |  ⋯ More
                  ↑           ↑         └── Tips, full nature detail, share, manage
           full screen    gallery grid
```

**Home scroll** contains (top → bottom):

1. Quiet header (title, dates)
2. Primary **Add moment** (FAB or sticky bottom)
3. One-line trip summary (replaces stat grid)
4. **Příroda na cestě** strip (chips + add)
5. Story timeline (merged from Story tab)
6. Photo filmstrip
7. Map peek card

**No separate Overview / Story / Checklist tabs.**

Public reader: same softness; Collections stays under Photos or More.

### Nature detail (when user wants depth)

Not a tab — opened from:

- “Zobrazit vše” on nature strip → **half sheet** with wishes + spotted lists
- Chip tap → **bottom sheet** with hint + “Přidat fotku” + map link
- “O přírodě tady” → inline accordion (3 species)

### Nature strip layout (on Home)

```
Příroda na cestě          Zobrazit vše →
○ Sokol  ○ Orchidej  ● Pravčická brána  + Přidat
4 z 12 · tapnutím označíte, fotkou potvrdíte
```

No progress bar with harsh numbers unless user expands — optional subtle text only.

### Trip creation

Single optional chip row under title — no extra step, no collapsed section title.

### Overview integration

Nature strip **is** the overview integration — no separate stat card needed.

---

## Part 3 (legacy) — Tab-based IA

<details>
<summary>Superseded tab layout (kept for reference)</summary>

### Trip tabs (old plan)

Overview | Story | Map | Gallery | Nature | Tips

</details>

---

## Part 4 — Interaction specs (soft)

### Wish chip (replaces checkbox row)

- **Tap** → bottom sheet: 2–3 lines of hint, “Ukázat na mapě”, “Přidat fotku”
- **Long press** or sheet action “Jen označit” → mark spotted without photo (confirm once)
- Visual: `○` open circle / `●` soft filled — **not** native checkbox

### Spotting from photo (primary path)

After moment save:

```text
Banner: „Patří to k něčemu z přírody na cestě?“
Chips: [Sokol] [Orchidej] [Něco jiného…]
```

Tap chip = done. No form. “Něco jiného” opens minimal sheet (one field + save).

### Map

- Nature wishes with coords appear as **soft dashed** pins; spotted = solid
- Tap pin → same bottom sheet as chip
- No new map tab features required for v1

### Field guide

- Link only, accordion, max 3 items + “více online”
- Missing network: link hidden, no error paragraph

### Bottom sheet standard

Use one shared `SoftBottomSheet` component:

- `rounded-t-3xl`, drag handle, max 85vh
- Replaces `FullScreenSheet` for nature flows
- Full screen reserved for map + photo capture only

### Legacy interactions (reference)

Goal row with Map + Photo buttons, full Nature tab scroll — see git history / earlier plan revision.

---

## Part 5 — Data model changes (additive)

### Phase B+

```sql
-- Optional: group items under applied template instance
alter table journey_checklist_items
  add column if not exists applied_at timestamptz default now();

-- Custom user goals (template_slug = 'custom')
-- already works with template_slug text; document convention
```

### Phase C

```sql
-- Offline GBIF cache (server-side optional; prefer IndexedDB first)
-- No migration required for client cache
```

### Phase D

```sql
-- Taxon reference (denormalized for display)
alter table nature_observations
  add column if not exists taxon_key integer,
  add column if not exists wikidata_id text;
```

### Journey snapshot extension

Include in offline cache:

```typescript
interface JourneySnapshotRecord {
  journey: JourneyDetail
  checklistItems?: JourneyChecklistItem[] // Phase A
  observationCount?: number // Phase B
}
```

---

## Part 6 — Implementation phases (agent-ready, softness-first)

> **Revised order:** Soften existing shell → nature on Home → photo loop → depth.
> Do **not** build Nature tab or dense forms before Part 0c + S1.

---

### Phase 0c — UI soften pass (existing trip + checklist)

**Goal:** Make current app feel calmer without new features.

See table in **Part 0c**. Acceptance:

- [ ] Tabs use tint active state, not solid green fill
- [ ] Engagement collapsible
- [ ] Checklist uses tap rows / circles, not checkboxes
- [ ] Template button is ghost/secondary
- [ ] Lightbox hides observation form until requested
- [ ] `pnpm check` passes

---

### Phase S1 — Home scroll + nature strip (replace Checklist tab)

**Goal:** Nature visible on trip open; remove Checklist tab.

**Tasks:**

1. Add `NatureOnTripStrip` to `JourneyOverview` (or new `JourneyHomeScroll`).
2. Horizontal wish chips; “Zobrazit vše” → `NatureDetailSheet` (half sheet).
3. Inline template cards when empty (replace dashed empty + full sheet as default).
4. Router: default `section=overview` shows merged home; deprecate `section=checklist`.
5. i18n: new soft copy keys (`nature.strip.*`).
6. `SoftBottomSheet` shared component.

**Acceptance:**

- [ ] Opening trip shows nature strip without tab switch
- [ ] Checklist tab removed from `JourneySectionTabs`
- [ ] Apply template works from inline cards or half sheet
- [ ] No primary green button on nature empty state

---

### Phase S2 — Calm navigation (3 tabs + More)

**Goal:** Reduce tab bar to Home · Map · Photos · More.

**Tasks:**

1. Merge Story content into Home scroll (remove Story tab).
2. `MoreSheet`: Tips, manage, public link, full nature detail link.
3. Softer header per Part 0.
4. Stat grid → `TripSummaryLine` one-liner.

**Acceptance:**

- [ ] ≤4 tab bar items visible
- [ ] User can add moment from FAB without choosing tab
- [ ] Story moments visible on Home

---

### Phase B — Photo spotting loop (chips, not forms)

**Goal:** Spot species in ≤2 taps after photo.

**Tasks:**

1. Post-moment `NatureMatchBanner` with goal chips.
2. `matchObservationToGoal()` fuzzy match by name/category.
3. Hide `ObservationLogForm` by default; `MinimalObservationSheet` for “Jiné”.
4. Link `checklist_item_id`, `photo_id`, `entry_id`; auto-mark wish.

**Acceptance:**

- [ ] Photo → chip → spotted with no required form fields
- [ ] Lightbox shows sighting chip, not form

---

### Phase C — Trip creation chips + suggest

**Goal:** Optional park chips on create; title suggests template.

**Tasks:**

1. Chip row on `CreateJourneyForm`.
2. `suggest-template.ts` from title keywords.
3. Land on Home with strip populated.

---

### Phase D — Map softness + nature pins

**Goal:** Gentle map differentiation; pin → bottom sheet.

---

### Phase E — Field guide accordion (online, cached)

**Goal:** Collapsed “O přírodě tady”; GBIF cache; CS Wikipedia.

---

### Phase F — Enriched collections (quiet)

**Goal:** Collections show species names subtly — no new tab.

---

### Phase G — Custom wishes + undo template

**Goal:** Add wish from sheet; remove template with confirm.

---

### Phase H — Hardening (pgTAP, offline snapshot, E2E)

---

### Phase I — Open APIs (iNaturalist, Wikidata) — optional later

---

### Deprecated / merged old phases

| Old                     | New                              |
| ----------------------- | -------------------------------- |
| Phase A (Nature tab)    | S1 + S2                          |
| Phase B (connect goals) | B                                |
| Phase C (create empty)  | C + S1 empty cards               |
| Phases D–I              | unchanged intent, softer UI spec |

---

### Phase A — Unify Nature tab (UX shell, no new APIs) — DEPRECATED

Superseded by **S1 + S2**. Do not implement a dedicated Nature tab.

<details>
<summary>Original Phase A spec</summary>

**Goal:** Replace “Checklist” tab with **Nature** tab; reorganize existing UI.
(See git history for full text.)

</details>

---

### Phase B — Connect goals ↔ sightings ↔ moments

**Goal:** Complete the golden loop: spot something → photo → species → goal checked.

**Tasks:**

1. Goal row **Map** link: navigate to map focused on stop (`focusedMapPointId` or new `focusStopId` search param).
2. Goal row **Add photo** → navigate to `/j/$id/memory/new` with search params:
   - `?natureGoalId=…&tag=wildlife` (extend `CreateJourneyMemoryForm`)
3. On moment created with `natureGoalId`:
   - Open `ObservationCaptureSheet` pre-filled with goal title
   - Save observation with `checklistItemId`, `photoId`, `entryId`
   - Call `setJourneyChecklistItemChecked({ checked: true })`
4. `ObservationCaptureSheet` — full-screen sheet (not lightbox-only); reuse form fields.
5. Lightbox: show existing observations for photo; “Add another” opens sheet.
6. Sightings panel: photo thumb, moment link, map link.

**Files:**

- `src/features/nature/ui/ObservationCaptureSheet.tsx` (new)
- `src/features/nature/ui/NatureGoalRow.tsx` (new)
- `src/features/journeys/ui/CreateJourneyMemoryForm.tsx`
- `src/pages/journey/CreateJourneyMemoryRoutePage.tsx`
- `src/entities/checklist/api/checklist-mutation.repository.ts` — add `linkGoalToMoment`
- `src/entities/nature/api/observation-mutation.repository.ts`
- `src/app/router.tsx` — memory/new search schema

**Acceptance:**

- [ ] Tapping “Add photo” on a goal creates moment + observation + checks goal
- [ ] Observation stores `checklist_item_id`, `photo_id`, `entry_id`
- [ ] Sightings list shows linked photo thumbnail
- [ ] Map focus from goal works
- [ ] Unit test: goal completion flow (mock repos)

---

### Phase C — Trip creation & empty states

**Goal:** Nature goals discoverable before user digs into tabs.

**Tasks:**

1. `CreateJourneyForm`: optional “Nature goals” template picker (collapsed).
2. On submit with template → `createJourney` then `applyChecklistTemplate` then navigate.
3. Empty Nature tab: illustration + 3 template cards (not just dashed box).
4. Empty trip overview: nature CTA card when no goals.
5. Suggest template from journey **title** keyword match (`švýcarsko` → české švýcarsko).

**Files:**

- `src/features/journeys/ui/CreateJourneyForm.tsx`
- `src/entities/checklist/lib/suggest-template.ts` (new)
- `src/features/nature/ui/NatureEmptyState.tsx` (new)

**Acceptance:**

- [ ] New trip can include template in one flow
- [ ] Empty states guide user with template cards
- [ ] Title “Výlet do Šumavy” suggests Šumava template

---

### Phase D — Map layer & planned stops polish

**Goal:** Nature goals visible and understandable on the map.

**Tasks:**

1. `journey-map-points.ts`: add `source: 'nature-goal' | 'moment' | 'planned'`.
2. Distinct pin styles per category (wildlife/flora/geology/landmark).
3. Map popup: goal title, notes, check status, “Mark spotted”.
4. Story section: group “Planned nature stops” separately from generic planned.
5. Filter on map: “Show nature goals” toggle.

**Files:**

- `src/features/journeys/ui/journey-map-points.ts`
- `src/features/journeys/ui/JourneyMap.tsx`
- `src/features/journeys/ui/JourneyStorySection.tsx`

**Acceptance:**

- [ ] Nature stops visually distinct on map
- [ ] Tapping map pin on nature stop shows goal context
- [ ] Checked goals show visited styling

---

### Phase E — Field guide quality (GBIF + Wikipedia)

**Goal:** Regional guide actually reflects **this trip**, works offline-after-cache.

**Tasks:**

1. `computeJourneyBbox(moments, checklistStops, templateCenter)` utility.
2. IndexedDB cache: `natureGuideCache` store `{ journeyId, bbox, species[], fetchedAt }`.
3. Wikipedia locale from `i18n.language`.
4. Species tap → detail sheet; “Add to goals” creates custom checklist item.
5. Show online/offline badge on guide section.
6. Rate-limit GBIF: max 1 req/min per journey while editing.

**Files:**

- `src/entities/nature/lib/journey-bbox.ts` (new)
- `src/entities/nature/api/nature-guide.repository.ts`
- `src/shared/lib/local-db.ts` — version 16
- `src/features/nature/ui/SpeciesDetailSheet.tsx` (new)

**Acceptance:**

- [ ] GBIF uses trip bbox when moments exist
- [ ] Second visit loads from cache offline
- [ ] Czech Wikipedia for `cs` locale
- [ ] User can add GBIF species as custom goal

---

### Phase F — Enriched collections

**Goal:** Public/private collections show species not just photo counts.

**Tasks:**

1. `JourneyTagCollections`: for wildlife/flora/geology tags, show observation count + top species names.
2. Collection detail: list observations alongside photos.
3. Map filter for collection (existing) + sighting pins.

**Files:**

- `src/features/journeys/ui/JourneyTagCollections.tsx`
- `src/pages/reader/JourneyReaderPage.tsx`
- `src/features/journeys/lib/journey-tag-collections.ts`

**Acceptance:**

- [ ] Wildlife collection card shows “3 druhy · 8 fotek”
- [ ] Drilling into collection shows species list

---

### Phase G — Custom goals & template management

**Goal:** Users not locked to bundled templates.

**Tasks:**

1. “Add custom goal” form (title, category, optional map pick).
2. `template_slug = 'custom'` convention.
3. Remove applied template (confirm dialog) — deletes items + orphan nature stops.
4. Add second template to same trip (merge under template headers).

**Schema:** May need `journey_checklist_applications` table if removal logic complex.

**Acceptance:**

- [ ] User can add “Datlík skvrnitý” as custom wildlife goal
- [ ] User can remove wrongly applied template

---

### Phase H — Hardening & tests

**Goal:** Production confidence.

**Tasks:**

1. pgTAP: `supabase/tests/journey_checklist_rls.test.sql`
2. pgTAP: `supabase/tests/nature_observations_rls.test.sql`
3. Merge checklist into journey snapshot for offline read.
4. Fix `listJourneyObservations` export location (repository not mutation).
5. E2E: apply template → check goal → add photo → sighting appears.
6. Docs: update README feature list.

**Acceptance:**

- [ ] `pnpm db:test` includes new tests
- [ ] Offline: Nature tab renders from snapshot without network
- [ ] E2E green in CI

---

### Phase I — Open API enrichment (optional / later)

**Goal:** Smarter identification without building iNaturalist clone.

**Tasks:**

1. iNaturalist taxa search autocomplete (online, attributed).
2. Wikidata taxon labels for CS/EN.
3. “Export to iNaturalist” deep link with lat/lng + name.
4. Macrostrat API for geology goals (formation age on geology detail sheet).

**Not in scope until Phases A–H ship.**

---

## Part 7 — Agent execution guide

### Recommended order (revised)

```text
0c → S1 → S2 → B → C → D → E → F → G → H → I
 ↑     ↑
soften  nature visible without new tab
```

**S1 + B** = minimum lovable nature experience.

### Per-agent checklist

1. Read `docs/architecture.md`, `docs/journey-ux-redesign.md`, **Part 0** of this plan.
2. **Never add a tab** when a strip, sheet, or banner will do.
3. **Never show a form** when a chip will do.
4. Run `pnpm check` before and after.
5. CS + EN i18n together; prefer warm copy from Part 0b.

### Parallelization

| Can run in parallel    | Must be sequential             |
| ---------------------- | ------------------------------ |
| D (map) after B starts | B before F                     |
| E after A              | A before C (shared Nature tab) |
| G after B              | H last                         |

### Commit message style

```text
feat(nature): unify checklist into Nature tab (phase A)

Wire goals, sightings, and field guide under one trip section.
```

---

## Part 8 — Success metrics (qualitative)

After **S1 + B**, on a family hike:

1. Open trip → **see nature chips on Home** (no tab hunt).
2. Tap **Přidat tipy** → pick park from inline cards (no full-screen wizard).
3. Add photo → tap **Sokol** chip on banner → done.
4. Chip shows filled on Home strip; moment has photo.
5. Works offline; sync quiet.

**Softness check:** At no point does the user see a checkbox, a uppercase category header,
or a 4-field form unless they chose “Jiné / upravit”.

That is the bar for “perfect easy, seamless UI.”

---

## Appendix B — Component sketch (for agents)

```text
src/shared/ui/SoftBottomSheet.tsx       # half sheet, drag handle
src/features/nature/ui/
  NatureOnTripStrip.tsx                 # horizontal chips on Home
  NatureWishChip.tsx                    # ○ / ● single chip
  NatureDetailSheet.tsx                 # full wish + spotted lists
  NatureMatchBanner.tsx                 # post-photo chip suggestions
  NatureTemplateCards.tsx                 # inline horizontal apply
  MinimalObservationSheet.tsx           # one field fallback
src/features/journeys/ui/
  JourneyHomeScroll.tsx                 # optional: merged overview+story
  TripSummaryLine.tsx                     # replaces StatCard grid
  MoreSheet.tsx                           # tips, manage, links
```

---

## Appendix — Current file map

```text
src/entities/checklist/
  data/templates.ts          # bundled destinations
  api/checklist.repository.ts
  api/checklist-mutation.repository.ts
  api/local-checklist.repository.ts
  model/checklist.ts

src/entities/nature/
  api/observation.repository.ts
  api/observation-mutation.repository.ts
  api/local-observation.repository.ts
  api/nature-guide.repository.ts
  model/observation.ts

src/features/checklist/ui/
  JourneyChecklistSection.tsx   # → refactor into nature/
  ApplyChecklistTemplateSheet.tsx

src/features/nature/ui/
  JourneyNatureGuidePanel.tsx
  ObservationLogForm.tsx        # → superseded by ObservationCaptureSheet

supabase/migrations/
  20260630120000_create_journey_checklists.sql
  20260630120100_create_nature_observations.sql
```
