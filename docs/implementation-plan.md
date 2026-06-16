# Implementation Plan

## Delivery Rules

- Every stage ends as a deployable vertical slice and receives its own commit.
- Database changes are additive migrations with pgTAP RLS coverage.
- Generated Supabase types are refreshed after every schema change.
- New UI has focused unit tests and production browser smoke coverage.
- Existing public UUID routes keep working while friendly URLs are introduced.
- A person's account and a shared publishing space remain separate concepts.
- Content keeps its original creator; publishing spaces do not transfer authorship.

## Product Model

```text
account/profile -> belongs to spaces -> publishes journeys and entries
space -> has members, public handle, journeys, and standalone entries
journey -> has members, stages, stops, guides, and linked entries
entry -> may stand alone or be linked into a journey
photo -> belongs to its creator and may be attached to an entry
```

Every account receives a personal space during onboarding. A family is another
space with multiple members. Public URLs use the space handle:

```text
/:spaceHandle
/:spaceHandle/:journeySlug
/:spaceHandle/:journeySlug/:entrySlug
/:spaceHandle/tipy/:entrySlug
```

## Stage 1: Session Shell And Dashboard

Goal: make authentication visible and give signed-in users a useful home.

- Add one global, reactive Supabase session provider.
- Add an application shell with brand navigation, sync state, avatar menu, and
  sign-out.
- Redirect successful sign-in and sign-up to `/dashboard`.
- Add protected `/dashboard` with the user's recent journeys and entries.
- Replace per-page `auth.getUser()` calls with the shared session contract.
- Preserve the quiet public landing page for signed-out visitors.

Acceptance:

- Refreshing the app preserves the signed-in shell.
- Signed-in users see their identity and can sign out.
- Signed-out users cannot open `/dashboard`.
- Dashboard empty, loading, error, and populated states are clear.

## Stage 2: Editable Personal Profiles

Goal: make identity useful for both authors and readers.

- Add profile settings for username, display name, bio, and locale.
- Add a public avatar storage bucket with strict owner-write RLS.
- Optimize avatars to WebP before upload.
- Show avatar and authored public content on the public profile.
- Add username availability feedback and safe rename behavior.

Acceptance:

- A user can edit only their own profile and avatar.
- Public profiles render without authentication.
- Replaced avatars do not leave unbounded storage objects.

## Stage 3: Shared Spaces And Families

Goal: introduce a durable home for personal and family publishing.

- Add `spaces`, `space_members`, and `space_invites`.
- Create a personal space automatically for each existing and new account.
- Add roles: owner, editor, and member.
- Add space switcher, family creation, member list, invitations, and removal.
- Add active-space selection without losing offline drafts.

Acceptance:

- Invitations are single-use, expiring, and do not reveal membership data.
- Only owners manage members and the public handle.
- Removing a member does not remove content they authored.

## Stage 4: Friendly Public Sharing

Goal: turn published content into understandable, stable public pages.

- Add unique slugs scoped to spaces.
- Associate journeys and entries with a publishing space.
- Add public space page with journeys and standalone entries.
- Add friendly journey and entry routes.
- Keep UUID routes as redirects or compatibility routes.
- Add share controls using the Web Share API with clipboard fallback.

Acceptance:

- Public URLs are readable and stable.
- Private content cannot be resolved through a known slug.
- Slug collisions and renames have deterministic behavior.

## Stage 5: Complete Journey Collaboration

Goal: expose the collaboration capabilities already present in the database.

- Add journey member management and invitation flows (member list + add by username + email invites ✅)
- Add role-aware controls and clear ownership indicators ✅
- Link entries to journeys, stages, stops, or guide sections.
- Add editing, ordering, and removal for journey content.
- Show journey entries in the public timeline and map.

Acceptance:

- UI permissions match RLS permissions.
- Only the original creator edits their contribution.
- Journey owners can manage membership but cannot impersonate authors.

## Stage 6: Comments And Hearts

Goal: allow lightweight interaction on public content.

- Add target-safe reactions and comments for journeys, entries, and photos.
- Require authentication to react or comment.
- Allow one heart per account per target.
- Allow comment authors to edit/delete and publishers to hide comments.
- Show reaction counts and comments without exposing private targets.

Acceptance:

- RLS prevents interaction with private or unavailable targets.
- Counters remain correct under concurrent reactions.
- Hidden comments remain available for moderation but not public readers.

## Stage 7: Notifications And Trust

Goal: make collaboration and interaction manageable.

- Add in-app notifications for invitations, comments, and hearts.
- Add email confirmation and production SMTP.
- Add reporting, blocking, and basic moderation controls.
- Add rate limits for invitations, comments, and reactions.

Acceptance:

- Notification recipients are derived server-side.
- Untrusted users cannot spam expensive or sensitive actions.

## Stage 8: Production Hardening

Goal: verify the complete product across web and native clients.

- Add end-to-end scenarios for spaces, invites, sharing, comments, and offline
  synchronization.
- Add observability for sync and upload failures.
- Verify accessibility, keyboard navigation, responsive layouts, and reduced
  motion.
- Run physical iOS and Android test matrices.

Acceptance:

- CI, database security tests, and production smoke tests pass.
- Recovery behavior is documented for failed migrations and deployments.

## Stage 9: Offline Hardening

Goal: make the primary on-trip flow work without connectivity.

See [offline-hardening-plan.md](offline-hardening-plan.md) for slice detail.

- Slice A: journey read cache and offline trip page ✅
- Slice B: cached publishing spaces for capture forms ✅
- Slice C: resilient session and query behavior while offline ✅
- Slice D: offline create trip outbox ✅
- Slice E: PWA production verification and offline E2E ✅

Acceptance:

- A trip opened online remains readable after refresh offline.
- Adding a moment offline works and appears immediately in the trip.
- Sync badge reflects pending local work, not a false “synchronized”.
- Capture forms do not block on space loading when a cache exists.
