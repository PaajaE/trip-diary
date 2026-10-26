import {
  assignMediaBatchToMoment,
  detachMediaFromMoment,
  listJourneyMedia,
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
import {
  dexieSnapshotStore,
  type OrganizeSnapshotStore,
} from '@/features/journey-organize/api/organize-snapshot.store'
import {
  isRestoreEmpty,
  planRestore,
  type RestorePlan,
  type RestoreSkip,
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
  assignMedia: typeof assignMediaBatchToMoment
  chunkSize: number
  createMoments: typeof createMoments
  createSegments: typeof createSegments
  deleteMoments: typeof deleteAutoMoments
  deleteSegments: typeof deleteSuggestedSegments
  detachMedia: typeof detachMediaFromMoment
  /** Called once the run is fully undone (e.g. forget its "nová" markers). */
  forgetRun?: (journeyId: string, runId: string) => void
  getUserId: typeof getCurrentUserId
  listMedia: typeof listJourneyMedia
  listMoments: typeof listJourneyMoments
  listSegments: typeof listJourneySegmentsIncludingRejected
  setPlace: typeof setMomentPlaceIfEmpty
  store: OrganizeSnapshotStore
  updateMoment: typeof updateMoment
}

function resolveUndoDeps(overrides: Partial<UndoDeps>): UndoDeps {
  return {
    assignMedia: assignMediaBatchToMoment,
    chunkSize: 100,
    createMoments,
    createSegments,
    deleteMoments: deleteAutoMoments,
    deleteSegments: deleteSuggestedSegments,
    detachMedia: detachMediaFromMoment,
    getUserId: getCurrentUserId,
    listMedia: listJourneyMedia,
    listMoments: listJourneyMoments,
    listSegments: listJourneySegmentsIncludingRejected,
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

/** Is there a usable snapshot of the last run? (Read only, no network.) */
export async function hasOrganizeSnapshot(
  journeyId: string,
  store: OrganizeSnapshotStore = dexieSnapshotStore,
): Promise<boolean> {
  return (await store.get(journeyId)) !== null
}

/**
 * "Vrátit uspořádání": restores the structure of unlocked stops as it was
 * before the last automatic run (plan 4f, UX flow point 1). Order: re-create
 * deleted stops, move the media back, revert kept stops and the range of
 * grown confirmed stops, delete the run's now empty stops, then the
 * suggestions. Never touches trash, ★, titles, text, covers or stops the user
 * confirmed after the run (those are reported in `skipped`). The snapshot is
 * dropped once everything that could be restored is.
 */
export async function undoOrganization(
  journeyId: string,
  overrides: Partial<UndoDeps> = {},
): Promise<UndoResult> {
  const deps = resolveUndoDeps(overrides)
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
    const snapshot = await deps.store.get(journeyId)
    if (snapshot === null) return { kind: 'nothing' }
    const [media, moments, segments] = await Promise.all([
      deps.listMedia(journeyId),
      deps.listMoments(journeyId),
      deps.listSegments(journeyId),
    ])
    plan = planRestore(snapshot, { media, moments, segments })
    if (isRestoreEmpty(plan)) {
      await deps.store.remove(journeyId)
      deps.forgetRun?.(journeyId, snapshot.runId)
      return plan.skipped.length === 0
        ? { kind: 'nothing' }
        : { counts, kind: 'done', skipped: plan.skipped }
    }

    const userId = await deps.getUserId()
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
    for (const { mediaIds, momentId } of plan.moveMedia) {
      for (const part of chunks(mediaIds, deps.chunkSize)) {
        if (momentId === null) await deps.detachMedia(part)
        else await deps.assignMedia(part, momentId)
        counts.mediaRestored += part.length
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
    for (const part of chunks(plan.deleteMoments, deps.chunkSize)) {
      // The repository only deletes auto, unlocked rows.
      await deps.deleteMoments(part)
      counts.momentsDeleted += part.length
    }

    step = 'segments'
    for (const part of chunks(plan.deleteSegments, deps.chunkSize)) {
      await deps.deleteSegments(part)
      counts.segmentsDeleted += part.length
    }
    for (const part of chunks(plan.recreateSegments, deps.chunkSize)) {
      await deps.createSegments(
        part.map((segment) => ({
          createdBy: userId,
          endsAt: segment.endsAt,
          id: segment.id,
          journeyId,
          kind: segment.kind,
          origin: 'suggested',
          parentId: segment.parentId,
          position: segment.position,
          startsAt: segment.startsAt,
          title: segment.title,
          tripType: segment.tripType,
          tz: segment.tz,
        })),
      )
      counts.segmentsRecreated += part.length
    }

    await deps.store.remove(journeyId)
    deps.forgetRun?.(journeyId, snapshot.runId)
    return { counts, kind: 'done', skipped: plan.skipped }
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
