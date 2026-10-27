/**
 * "Vrátit uspořádání" (plan 4f, UX flow point 1): the structure one
 * automatic run changed, captured BEFORE the plan is applied, and the pure
 * planning of its restore. Only the automation's own structure is recorded:
 * unlocked auto stops (range, kind, position, place), the media it moved,
 * the stops it created or deleted, the range growth of confirmed stops and
 * the suggested segments it replaced. Trash, ★, titles, text and covers are
 * never part of it, so a restore cannot touch them.
 *
 * A restore never overrides what the user did after the run: a stop that is
 * now locked / manual / carries content is skipped (and reported), a photo
 * that was moved since stays where it is, a trashed photo is left in the
 * trash. Comparing the stored "after" values with the current state also
 * makes a restore idempotent (a rerun after a partial failure converges).
 */
import { isProtected } from '@trip-diary/core/automation'
import { z } from 'zod'
import type { MediaItem } from '@/entities/media/model/media-library'
import { momentKindSchema, type Moment } from '@/entities/moment/model/moment'
import { tripTypeSchema, type Segment } from '@/entities/segment/model/segment'

/** 2: extensions carry a content key (v1 snapshots are dropped on read). */
export const ORGANIZE_SNAPSHOT_VERSION = 2

const instantSchema = z.iso.datetime({ offset: true })

const rangeSchema = z.object({ endsAt: instantSchema, startsAt: instantSchema })
export type SnapshotRange = z.infer<typeof rangeSchema>

/** Structure of one unlocked auto stop (no text, title or cover). */
export const snapshotMomentSchema = z.object({
  endsAt: instantSchema,
  id: z.uuid(),
  kind: momentKindSchema,
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  placeId: z.uuid().nullable(),
  startsAt: instantSchema,
})
export type SnapshotMoment = z.infer<typeof snapshotMomentSchema>

/** A suggested segment the run deleted (re-created as it was). */
export const snapshotSegmentSchema = z.object({
  endsAt: instantSchema,
  id: z.uuid(),
  kind: z.enum(['stage', 'trip']),
  parentId: z.uuid().nullable(),
  position: z.number().int().nonnegative(),
  startsAt: instantSchema,
  title: z.string().min(1).max(160),
  tripType: tripTypeSchema.nullable(),
  tz: z.string().min(1).nullable(),
})
export type SnapshotSegment = z.infer<typeof snapshotSegmentSchema>

export const organizeSnapshotSchema = z.object({
  /** Stops the run created (deleted again by the restore). */
  createdMomentIds: z.array(z.uuid()),
  /** Suggested segments the run created. */
  createdSegmentIds: z.array(z.uuid()),
  /** Auto stops the run deleted, as they were. */
  deletedMoments: z.array(snapshotMomentSchema),
  deletedSegments: z.array(snapshotSegmentSchema),
  /**
   * Confirmed stops whose range only grew (range before and after) and a
   * key of their user content (title, text, cover) at the time of the run:
   * if it changed since, the stop is the user's and keeps its photos.
   */
  extensions: z.array(
    z.object({
      after: rangeSchema,
      before: rangeSchema,
      contentKey: z.string().max(64),
      id: z.uuid(),
    }),
  ),
  journeyId: z.uuid(),
  /** Media the run moved: where each was before (null = no stop) and after. */
  media: z.array(
    z.object({
      after: z.uuid(),
      before: z.uuid().nullable(),
      mediaId: z.uuid(),
    }),
  ),
  /** Identifies the run (the "nová" markers refer to it). */
  runId: z.string().min(1).max(100),
  /** Bookkeeping instant of the snapshot (not a time of any media). */
  takenAt: instantSchema,
  /** Auto stops the run kept but changed: as they were and what it wrote. */
  updatedMoments: z.array(
    z.object({
      after: rangeSchema.extend({ kind: momentKindSchema }),
      before: snapshotMomentSchema,
    }),
  ),
  version: z.literal(ORGANIZE_SNAPSHOT_VERSION),
})
export type OrganizeSnapshot = z.infer<typeof organizeSnapshotSchema>

/** Parses stored data; null when it is not a valid snapshot (drop it). */
export function parseOrganizeSnapshot(value: unknown): OrganizeSnapshot | null {
  const parsed = organizeSnapshotSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** The planned changes the snapshot needs (a subset of OrganizationPlan). */
export interface SnapshotPlan {
  mediaReassignments: readonly { mediaId: string; momentId: string }[]
  momentsToCreate: readonly { id: string }[]
  momentsToDelete: readonly string[]
  momentsToExtend: readonly {
    endsAt: string
    id: string
    startsAt: string
  }[]
  momentsToUpdate: readonly {
    endsAt: string
    id: string
    kind: Moment['kind']
    startsAt: string
  }[]
  segmentsToDelete: readonly string[]
  stageSuggestions: readonly { id: string }[]
  tripSuggestions: readonly { id: string }[]
}

export interface SnapshotState {
  media: readonly Pick<MediaItem, 'id' | 'momentId'>[]
  moments: readonly Moment[]
  segments: readonly Segment[]
}

/**
 * Short deterministic key of the user content of a stop (title, text,
 * cover): FNV-1a over the three values, so no text is stored twice.
 */
export function contentKeyOf(
  moment: Pick<Moment, 'body' | 'coverMediaId' | 'title'>,
): string {
  const text = `${moment.title ?? ''}\u0000${moment.body}\u0000${moment.coverMediaId ?? ''}`
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${String(text.length)}:${hash.toString(16)}`
}

function structureOf(moment: Moment): SnapshotMoment {
  return {
    endsAt: moment.endsAt,
    id: moment.id,
    kind: moment.kind,
    latitude: moment.latitude,
    longitude: moment.longitude,
    placeId: moment.placeId,
    startsAt: moment.startsAt,
  }
}

/**
 * Captures what `plan` will change, from the state it was planned on. Pure:
 * `runId` and `takenAt` come from the caller.
 */
export function buildOrganizeSnapshot(
  journeyId: string,
  state: SnapshotState,
  plan: SnapshotPlan,
  meta: { runId: string; takenAt: string },
): OrganizeSnapshot {
  const momentById = new Map(state.moments.map((moment) => [moment.id, moment]))
  const momentOf = new Map(state.media.map((item) => [item.id, item.momentId]))
  const segmentById = new Map(state.segments.map((s) => [s.id, s]))

  const updatedMoments: OrganizeSnapshot['updatedMoments'] = []
  for (const planned of plan.momentsToUpdate) {
    const stored = momentById.get(planned.id)
    if (stored === undefined) continue
    updatedMoments.push({
      after: {
        endsAt: planned.endsAt,
        kind: planned.kind,
        startsAt: planned.startsAt,
      },
      before: structureOf(stored),
    })
  }
  const deletedMoments = plan.momentsToDelete.flatMap((id) => {
    const stored = momentById.get(id)
    return stored === undefined ? [] : [structureOf(stored)]
  })
  const extensions = plan.momentsToExtend.flatMap((extension) => {
    const stored = momentById.get(extension.id)
    return stored === undefined
      ? []
      : [
          {
            after: { endsAt: extension.endsAt, startsAt: extension.startsAt },
            before: { endsAt: stored.endsAt, startsAt: stored.startsAt },
            contentKey: contentKeyOf(stored),
            id: extension.id,
          },
        ]
  })
  const media = plan.mediaReassignments.map(({ mediaId, momentId }) => {
    const before = momentOf.get(mediaId) ?? null
    // A dangling reference (no such stop) counts as "no stop", as for the planner.
    return {
      after: momentId,
      before: before !== null && momentById.has(before) ? before : null,
      mediaId,
    }
  })
  const deletedSegments = plan.segmentsToDelete.flatMap((id) => {
    const stored = segmentById.get(id)
    if (stored?.origin !== 'suggested') return []
    return [
      {
        endsAt: stored.endsAt,
        id: stored.id,
        kind: stored.kind,
        parentId: stored.parentId,
        position: stored.position,
        startsAt: stored.startsAt,
        title: stored.title,
        tripType: stored.tripType,
        tz: stored.tz,
      },
    ]
  })
  return {
    createdMomentIds: plan.momentsToCreate.map((moment) => moment.id),
    createdSegmentIds: [...plan.stageSuggestions, ...plan.tripSuggestions].map(
      (segment) => segment.id,
    ),
    deletedMoments,
    deletedSegments,
    extensions,
    journeyId,
    media,
    runId: meta.runId,
    takenAt: meta.takenAt,
    updatedMoments,
    version: ORGANIZE_SNAPSHOT_VERSION,
  }
}

/** Something the restore left alone, and why. */
export type RestoreSkipReason =
  /** The user confirmed / edited the stop after the run (locked, manual, content). */
  | 'locked'
  /** Changed after the run (moved photo, other range): the user's state wins. */
  | 'changed'
  /** The row is gone (deleted since). */
  | 'missing'
  /** The photo is in the trash: the trash is never touched. */
  | 'trashed'
  /** A stop the run created still holds photos that could not go back. */
  | 'notEmpty'
  /** A suggestion the user accepted (or rejected) after the run. */
  | 'decided'
  /** The photo is the cover of its stop now: it is never taken out. */
  | 'cover'

export interface RestoreSkip {
  id: string
  reason: RestoreSkipReason
  target: 'media' | 'moment' | 'segment'
}

export interface MomentRevert {
  id: string
  patch: {
    endsAt?: string
    kind?: Moment['kind']
    latitude?: number | null
    longitude?: number | null
    placeId?: string | null
    startsAt?: string
  }
}

export interface RestorePlan {
  /** Created stops that are empty after the media went back. */
  deleteMoments: string[]
  /** Suggested segments the run created, still undecided. */
  deleteSegments: string[]
  /**
   * Media moves back, grouped by target (null = no stop) and by the stop
   * they must still be in (`from`): the write is conditional on it.
   */
  moveMedia: { from: string; mediaIds: string[]; momentId: string | null }[]
  /** Deleted stops re-created with the same id. */
  recreateMoments: SnapshotMoment[]
  /**
   * Replaced suggestions re-created: stages first, then trips; a parent
   * that is gone (and not re-created) is dropped (parentId null).
   */
  recreateSegments: SnapshotSegment[]
  /** Confirmed stops whose range goes back (range only). */
  revertExtensions: { endsAt: string; id: string; startsAt: string }[]
  /** Kept auto stops whose structure goes back. */
  revertMoments: MomentRevert[]
  skipped: RestoreSkip[]
}

export interface RestoreState {
  /** Live media (trashed rows are not listed). */
  media: readonly Pick<MediaItem, 'id' | 'momentId'>[]
  moments: readonly Moment[]
  segments: readonly Segment[]
}

/** The user made the stop their own (core rule: lock, manual, text, title, cover, hidden). */
export function isUserStop(moment: Moment): boolean {
  return isProtected({
    body: moment.body,
    coverMediaId: moment.coverMediaId,
    endsAt: moment.endsAt,
    id: moment.id,
    locked: moment.locked,
    origin: moment.origin,
    published: moment.published,
    startsAt: moment.startsAt,
    title: moment.title,
  })
}

function sameInstant(a: string, b: string): boolean {
  return Date.parse(a) === Date.parse(b)
}

function sameRange(a: SnapshotRange, b: SnapshotRange): boolean {
  return sameInstant(a.startsAt, b.startsAt) && sameInstant(a.endsAt, b.endsAt)
}

/**
 * Plans the restore of `snapshot` against the current state. Pure and
 * deterministic (outputs follow the snapshot order; grouped media targets are
 * sorted by code unit, null last).
 */
export function planRestore(
  snapshot: OrganizeSnapshot,
  current: RestoreState,
): RestorePlan {
  const momentById = new Map(current.moments.map((m) => [m.id, m]))
  const mediaById = new Map(current.media.map((item) => [item.id, item]))
  const segmentById = new Map(current.segments.map((s) => [s.id, s]))
  const movedOf = new Map<string, OrganizeSnapshot['media']>()
  for (const entry of snapshot.media) {
    const list = movedOf.get(entry.after)
    if (list === undefined) movedOf.set(entry.after, [entry])
    else list.push(entry)
  }
  const skipped: RestoreSkip[] = []
  const skip = (
    target: RestoreSkip['target'],
    id: string,
    reason: RestoreSkipReason,
  ) => {
    skipped.push({ id, reason, target })
  }

  // 1. Deleted stops may come back (with the same id) unless a row with the
  //    id exists again; only those that get a photo back are re-created.
  const candidates = snapshot.deletedMoments.filter(
    (moment) => !momentById.has(moment.id),
  )
  const recreated = new Set(candidates.map((moment) => moment.id))

  // 2. Kept auto stops go back when they still hold what the run wrote.
  const revertMoments: MomentRevert[] = []
  for (const { after, before } of snapshot.updatedMoments) {
    const now = momentById.get(before.id)
    if (now === undefined) {
      skip('moment', before.id, 'missing')
      continue
    }
    if (isUserStop(now)) {
      skip('moment', before.id, 'locked')
      continue
    }
    const atBefore =
      sameRange(now, before) &&
      now.kind === before.kind &&
      now.latitude === before.latitude &&
      now.longitude === before.longitude
    if (atBefore) continue
    if (!sameRange(now, after) || now.kind !== after.kind) {
      skip('moment', before.id, 'changed')
      continue
    }
    const patch: MomentRevert['patch'] = {
      endsAt: before.endsAt,
      kind: before.kind,
      latitude: before.latitude,
      longitude: before.longitude,
      startsAt: before.startsAt,
    }
    // A place the run cleared (moved far) comes back; a place found later
    // for a stop that had none is kept.
    if (before.placeId !== null && now.placeId !== before.placeId) {
      patch.placeId = before.placeId
    }
    revertMoments.push({ id: before.id, patch })
  }
  const skippedStops = new Set(
    skipped.filter((s) => s.target === 'moment').map((s) => s.id),
  )

  // 3. Media go back to where they were.
  const extensionIds = new Set(snapshot.extensions.map((e) => e.id))
  const created = new Set(snapshot.createdMomentIds)
  /** A stop media may go back INTO: exists unchanged by the user, or is re-created. */
  const canReceive = (id: string): RestoreSkipReason | null => {
    if (recreated.has(id)) return null
    const now = momentById.get(id)
    if (now === undefined) return 'missing'
    if (isUserStop(now)) return 'locked'
    if (skippedStops.has(id)) return 'changed'
    return null
  }
  /** A stop media may be taken OUT of (extension targets are decided below). */
  const canRelease = (id: string): RestoreSkipReason | null => {
    if (extensionIds.has(id)) return null
    const now = momentById.get(id)
    if (now === undefined) return 'missing'
    if (isUserStop(now)) return 'locked'
    if (skippedStops.has(id) && !created.has(id)) return 'changed'
    return null
  }
  interface Move {
    after: string
    before: string | null
    mediaId: string
  }
  const moves: Move[] = []
  for (const entry of snapshot.media) {
    const now = mediaById.get(entry.mediaId)
    if (now === undefined) {
      skip('media', entry.mediaId, 'trashed')
      continue
    }
    if (now.momentId === entry.before) continue // not applied, or already back
    if (now.momentId !== entry.after) {
      skip('media', entry.mediaId, 'changed')
      continue
    }
    // A photo that became the cover of its stop stays (also in confirmed stops).
    if (momentById.get(entry.after)?.coverMediaId === entry.mediaId) {
      skip('media', entry.mediaId, 'cover')
      continue
    }
    const out = canRelease(entry.after)
    const into = entry.before === null ? null : canReceive(entry.before)
    const reason = out ?? into
    if (reason !== null) {
      skip('media', entry.mediaId, reason)
      continue
    }
    moves.push(entry)
  }

  // 4. A confirmed stop's range goes back only with all of its new photos,
  //    and only while it still has exactly the range the run wrote.
  const revertExtensions: RestorePlan['revertExtensions'] = []
  const blocked = new Set<string>()
  const moving = new Set(moves.map((move) => move.mediaId))
  for (const extension of snapshot.extensions) {
    const now = momentById.get(extension.id)
    const ownMoves = movedOf.get(extension.id) ?? []
    const allBack = ownMoves.every(
      (m) =>
        mediaById.get(m.mediaId)?.momentId === m.before ||
        moving.has(m.mediaId),
    )
    let reason: RestoreSkipReason | null = null
    if (now === undefined) reason = 'missing'
    // Title, text or cover changed since the run: the stop is the user's.
    else if (contentKeyOf(now) !== extension.contentKey) reason = 'changed'
    else if (sameRange(now, extension.before)) reason = null
    else if (!sameRange(now, extension.after)) reason = 'changed'
    else if (!allBack) reason = 'changed'
    if (reason !== null) {
      skip('moment', extension.id, reason)
      blocked.add(extension.id)
      continue
    }
    if (now !== undefined && !sameRange(now, extension.before)) {
      revertExtensions.push({
        endsAt: extension.before.endsAt,
        id: extension.id,
        startsAt: extension.before.startsAt,
      })
    }
  }
  const applied: Move[] = []
  for (const move of moves) {
    if (blocked.has(move.after)) skip('media', move.mediaId, 'changed')
    else applied.push(move)
  }

  // 5. Created stops are deleted once nothing is left in them.
  const remaining = new Map<string, number>()
  const leaving = new Set(applied.map((move) => move.mediaId))
  for (const item of current.media) {
    if (item.momentId === null || leaving.has(item.id)) continue
    remaining.set(item.momentId, (remaining.get(item.momentId) ?? 0) + 1)
  }
  const deleteMoments: string[] = []
  for (const id of snapshot.createdMomentIds) {
    const now = momentById.get(id)
    if (now === undefined) continue // not applied, or already gone
    if (isUserStop(now)) {
      skip('moment', id, 'locked')
      continue
    }
    if ((remaining.get(id) ?? 0) > 0) {
      skip('moment', id, 'notEmpty')
      continue
    }
    deleteMoments.push(id)
  }

  // 6. Suggestions: the run's own go, the replaced ones come back.
  const deleteSegments: string[] = []
  for (const id of snapshot.createdSegmentIds) {
    const now = segmentById.get(id)
    if (now === undefined) continue
    if (now.origin !== 'suggested') {
      skip('segment', id, 'decided')
      continue
    }
    deleteSegments.push(id)
  }
  // A replaced suggestion never comes back over a segment the user made or
  // accepted since (same kind, overlapping in time).
  const decided = current.segments.filter(
    (segment) => segment.origin === 'manual' || segment.origin === 'accepted',
  )
  const overlapsDecided = (segment: SnapshotSegment) =>
    decided.some(
      (other) =>
        other.kind === segment.kind &&
        Date.parse(other.startsAt) < Date.parse(segment.endsAt) &&
        Date.parse(segment.startsAt) < Date.parse(other.endsAt),
    )
  const back: SnapshotSegment[] = []
  for (const segment of snapshot.deletedSegments) {
    if (segmentById.has(segment.id)) continue
    if (overlapsDecided(segment)) {
      skip('segment', segment.id, 'decided')
      continue
    }
    back.push(segment)
  }
  const backIds = new Set(back.map((segment) => segment.id))
  const recreateSegments = back
    .map((segment) =>
      segment.parentId !== null &&
      !segmentById.has(segment.parentId) &&
      !backIds.has(segment.parentId)
        ? { ...segment, parentId: null }
        : segment,
    )
    .sort(
      (a, b) =>
        (a.kind === b.kind ? 0 : a.kind === 'stage' ? -1 : 1) ||
        Date.parse(a.startsAt) - Date.parse(b.startsAt) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )

  const grouped = new Map<
    string,
    { from: string; mediaIds: string[]; momentId: string | null }
  >()
  for (const move of applied) {
    const key = `${move.before ?? ''}|${move.after}`
    const group = grouped.get(key)
    if (group === undefined) {
      grouped.set(key, {
        from: move.after,
        mediaIds: [move.mediaId],
        momentId: move.before,
      })
    } else group.mediaIds.push(move.mediaId)
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  const moveMedia = [...grouped.values()].sort(
    (a, b) =>
      (a.momentId === b.momentId
        ? 0
        : a.momentId === null
          ? 1
          : b.momentId === null
            ? -1
            : cmp(a.momentId, b.momentId)) || cmp(a.from, b.from),
  )

  const receiving = new Set(applied.map((move) => move.before))
  const recreateMoments = candidates.filter((moment) =>
    receiving.has(moment.id),
  )
  return {
    deleteMoments,
    deleteSegments,
    moveMedia,
    recreateMoments,
    recreateSegments,
    revertExtensions,
    revertMoments,
    skipped,
  }
}

/** True when the restore would change nothing (the snapshot can be dropped). */
export function isRestoreEmpty(plan: RestorePlan): boolean {
  return (
    plan.deleteMoments.length === 0 &&
    plan.deleteSegments.length === 0 &&
    plan.moveMedia.length === 0 &&
    plan.recreateMoments.length === 0 &&
    plan.recreateSegments.length === 0 &&
    plan.revertExtensions.length === 0 &&
    plan.revertMoments.length === 0
  )
}
