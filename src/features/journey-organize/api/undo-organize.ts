import {
  listJourneyMedia,
  moveMediaIfUnchanged,
} from '@/entities/media/api/media-library.repository'
import {
  createMoments,
  deleteAutoMoments,
  listJourneyMoments,
  setMomentPlaceIfEmpty,
  updateMoment,
} from '@/entities/moment/api/moment.repository'
import {
  createSegments,
  deleteSuggestedSegments,
  listJourneySegmentsIncludingRejected,
} from '@/entities/segment/api/segment.repository'
import { withJourneyLock } from '@/features/journey-organize/api/journey-lock'
import {
  dexieSnapshotStore,
  type OrganizeSnapshotStore,
} from '@/features/journey-organize/api/organize-snapshot.store'
import {
  isRestoreEmpty,
  planRestore,
  type RestorePlan,
  type RestoreSkip,
  type SnapshotSegment,
} from '@/features/journey-organize/model/organize-snapshot'
import { getCurrentUserId } from '@/shared/api/current-user'

export type UndoStep =
  | 'deleteMoments'
  | 'load'
  | 'moveMedia'
  | 'recreateMoments'
  | 'revertMoments'
  | 'segments'

export interface UndoCounts {
  mediaRestored: number
  momentsDeleted: number
  momentsRecreated: number
  momentsReverted: number
  segmentsDeleted: number
  segmentsRecreated: number
}

export type UndoResult =
  /** Nothing to restore (no snapshot, or the state already is as before). */
  | { kind: 'nothing' }
  | { counts: UndoCounts; kind: 'done'; skipped: RestoreSkip[] }
  /** Stopped at `step`; the snapshot is kept, a rerun continues. */
  | {
      counts: UndoCounts
      error: unknown
      kind: 'failed'
      skipped: RestoreSkip[]
      step: UndoStep
    }

export interface UndoDeps {
  chunkSize: number
  createMoments: typeof createMoments
  createSegments: typeof createSegments
  deleteMoments: typeof deleteAutoMoments
  deleteSegments: typeof deleteSuggestedSegments
  /** Called once the run is fully undone (e.g. forget its "nová" markers). */
  forgetRun?: (userId: string, journeyId: string, runId: string) => void
  getUserId: typeof getCurrentUserId
  listMedia: typeof listJourneyMedia
  listMoments: typeof listJourneyMoments
  listSegments: typeof listJourneySegmentsIncludingRejected
  /** Journey-wide mutex (shared with organize); in-process + Web Locks. */
  lock: <T>(journeyId: string, task: () => Promise<T>) => Promise<T>
  /** Conditional move: only photos still in the run's stop move back. */
  moveIfUnchanged: typeof moveMediaIfUnchanged
  setPlace: typeof setMomentPlaceIfEmpty
  store: OrganizeSnapshotStore
  updateMoment: typeof updateMoment
}

function resolveUndoDeps(overrides: Partial<UndoDeps>): UndoDeps {
  return {
    chunkSize: 100,
    createMoments,
    createSegments,
    deleteMoments: deleteAutoMoments,
    deleteSegments: deleteSuggestedSegments,
    getUserId: getCurrentUserId,
    listMedia: listJourneyMedia,
    listMoments: listJourneyMoments,
    listSegments: listJourneySegmentsIncludingRejected,
    lock: withJourneyLock,
    moveIfUnchanged: moveMediaIfUnchanged,
    setPlace: setMomentPlaceIfEmpty,
    store: dexieSnapshotStore,
    updateMoment,
    ...overrides,
  }
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size))
  }
  return out
}

/**
 * "Vrátit uspořádání": restores the structure of unlocked stops as it was
 * before the last automatic run (plan 4f, UX flow point 1). Runs under the
 * journey lock (never next to an organize run). Order: re-create deleted
 * stops, move the media back (only those still where the run put them),
 * revert kept stops and the range of grown confirmed stops, delete the
 * run's now empty stops, then the suggestions (stages before trips; a
 * suggestion that cannot come back is skipped, never retried forever).
 * Never touches trash, ★, titles, text, covers or stops the user confirmed
 * after the run (those are reported in `skipped`). The snapshot is dropped
 * only while it still is the snapshot of the run that was undone.
 */
export function undoOrganization(
  journeyId: string,
  overrides: Partial<UndoDeps> = {},
): Promise<UndoResult> {
  const deps = resolveUndoDeps(overrides)
  return deps.lock(journeyId, () => undoLocked(journeyId, deps))
}

async function undoLocked(
  journeyId: string,
  deps: UndoDeps,
): Promise<UndoResult> {
  const counts: UndoCounts = {
    mediaRestored: 0,
    momentsDeleted: 0,
    momentsRecreated: 0,
    momentsReverted: 0,
    segmentsDeleted: 0,
    segmentsRecreated: 0,
  }
  let step: UndoStep = 'load'
  let plan: RestorePlan | null = null
  try {
    const userId = await deps.getUserId()
    const snapshot = await deps.store.get(userId, journeyId)
    if (snapshot === null) return { kind: 'nothing' }
    const finish = async () => {
      if (await deps.store.removeRun(userId, journeyId, snapshot.runId)) {
        deps.forgetRun?.(userId, journeyId, snapshot.runId)
      }
    }
    const [media, moments, segments] = await Promise.all([
      deps.listMedia(journeyId),
      deps.listMoments(journeyId),
      deps.listSegments(journeyId),
    ])
    plan = planRestore(snapshot, { media, moments, segments })
    const skipped = [...plan.skipped]
    if (isRestoreEmpty(plan)) {
      await finish()
      return skipped.length === 0
        ? { kind: 'nothing' }
        : { counts, kind: 'done', skipped }
    }

    step = 'recreateMoments'
    for (const part of chunks(plan.recreateMoments, deps.chunkSize)) {
      await deps.createMoments(
        part.map((moment) => ({
          createdBy: userId,
          endsAt: moment.endsAt,
          id: moment.id,
          journeyId,
          kind: moment.kind,
          latitude: moment.latitude,
          locked: false,
          longitude: moment.longitude,
          origin: 'auto',
          startsAt: moment.startsAt,
        })),
      )
      for (const moment of part) {
        if (moment.placeId !== null) {
          await deps.setPlace(moment.id, moment.placeId)
        }
      }
      counts.momentsRecreated += part.length
    }

    step = 'moveMedia'
    for (const { from, mediaIds, momentId } of plan.moveMedia) {
      for (const part of chunks(mediaIds, deps.chunkSize)) {
        const moved = new Set(await deps.moveIfUnchanged(part, momentId, from))
        counts.mediaRestored += moved.size
        // Moved by someone meanwhile: their move wins.
        for (const id of part) {
          if (!moved.has(id)) {
            skipped.push({ id, reason: 'changed', target: 'media' })
          }
        }
      }
    }

    step = 'revertMoments'
    for (const { id, patch } of plan.revertMoments) {
      // Structure only: no title, text, cover or lock in the patch.
      await deps.updateMoment(id, patch)
      counts.momentsReverted += 1
    }
    for (const { endsAt, id, startsAt } of plan.revertExtensions) {
      await deps.updateMoment(id, { endsAt, startsAt })
      counts.momentsReverted += 1
    }

    step = 'deleteMoments'
    // A photo that did not go back keeps its (created) stop alive.
    const kept = new Set(
      skipped.filter((s) => s.target === 'media').map((s) => s.id),
    )
    const stillHolding = new Set(
      media
        .filter((item) => kept.has(item.id) && item.momentId !== null)
        .map((item) => item.momentId),
    )
    const deletable = plan.deleteMoments.filter((id) => !stillHolding.has(id))
    for (const id of plan.deleteMoments) {
      if (stillHolding.has(id)) {
        skipped.push({ id, reason: 'notEmpty', target: 'moment' })
      }
    }
    for (const part of chunks(deletable, deps.chunkSize)) {
      // The repository only deletes auto, unlocked rows.
      await deps.deleteMoments(part)
      counts.momentsDeleted += part.length
    }

    step = 'segments'
    for (const part of chunks(plan.deleteSegments, deps.chunkSize)) {
      await deps.deleteSegments(part)
      counts.segmentsDeleted += part.length
    }
    // Stages first (trips may point at them as parent). A suggestion that
    // cannot be re-created is skipped: old suggestions are not worth a stuck
    // undo (the next organize run proposes fresh ones).
    const stages = plan.recreateSegments.filter((s) => s.kind === 'stage')
    const trips = plan.recreateSegments.filter((s) => s.kind === 'trip')
    const failedStages = new Set<string>()
    const insert = async (list: readonly SnapshotSegment[]) => {
      for (const part of chunks(list, deps.chunkSize)) {
        try {
          await deps.createSegments(
            part.map((segment) => ({
              createdBy: userId,
              endsAt: segment.endsAt,
              id: segment.id,
              journeyId,
              kind: segment.kind,
              origin: segment.origin ?? 'suggested',
              parentId:
                segment.parentId !== null && failedStages.has(segment.parentId)
                  ? null
                  : segment.parentId,
              position: segment.position,
              startsAt: segment.startsAt,
              title: segment.title,
              tripType: segment.tripType,
              tz: segment.tz,
            })),
          )
          counts.segmentsRecreated += part.length
        } catch {
          for (const segment of part) {
            if (segment.kind === 'stage') failedStages.add(segment.id)
            skipped.push({
              id: segment.id,
              reason: 'missing',
              target: 'segment',
            })
          }
        }
      }
    }
    await insert(stages)
    await insert(trips)

    await finish()
    return { counts, kind: 'done', skipped }
  } catch (error) {
    return {
      counts,
      error,
      kind: 'failed',
      skipped: plan?.skipped ?? [],
      step,
    }
  }
}
