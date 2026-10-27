/**
 * Actions of the flow screens, each through an existing repository / RPC.
 * Every conscious change of a stop locks it (the RPCs and the moment
 * repository do that). Confirming the structure NEVER marks photos as
 * sorted: only `sortPhotos` sets `reviewed_at`.
 */
import { markMediaReviewed } from '@/entities/media/api/media-review.repository'
import { shiftMediaTime } from '@/entities/media/api/media-corrections.repository'
import {
  moveMedia,
  trashMedia,
} from '@/entities/media/api/media-trash.repository'
import {
  confirmMoments,
  mergeMoments,
  splitMoment,
  updateMoment,
} from '@/entities/moment/api/moment.repository'
import { MomentError } from '@/entities/moment/model/moment'
import { updateFlowMarkers } from '@/features/journey-flow/api/flow-markers.store'
import {
  acknowledgeArrivals,
  keepCopy,
  markStopOpened,
  type FlowMarkers,
} from '@/features/journey-flow/model/flow-markers'
import {
  stopToConfirm,
  type DaySortModel,
  type SortStop,
} from '@/features/journey-flow/model/day-sort'

export interface FlowActionDeps {
  confirmMoments: typeof confirmMoments
  markMediaReviewed: typeof markMediaReviewed
  mergeMoments: typeof mergeMoments
  moveMedia: typeof moveMedia
  newId: () => string
  shiftMediaTime: typeof shiftMediaTime
  splitMoment: typeof splitMoment
  trashMedia: typeof trashMedia
  updateMarkers: (
    journeyId: string,
    change: (markers: FlowMarkers) => FlowMarkers,
  ) => void
  updateMoment: typeof updateMoment
}

export interface FlowActions {
  /** Příjem: the arrivals up to `seenUpTo` (see latestArrival) are seen. */
  acknowledgeArrivals: (journeyId: string, seenUpTo: string | null) => void
  /** Nezařazené: "Zařadit" the selected photos of a group (locks the stop). */
  assignToStop: (mediaIds: readonly string[], stopId: string) => Promise<number>
  /** "Zastávky sedí, třídit fotky": locks every given stop; no photo is marked. */
  confirmStops: (stopIds: readonly string[]) => Promise<void>
  /** "Den sedí" on the sorting screen (structure only, like confirmStops). */
  /** Resolves false (and writes nothing) when the model does not offer it. */
  daySits: (
    model: Pick<DaySortModel, 'daySits' | 'daySitsIds'>,
  ) => Promise<boolean>
  /**
   * After sorting photos of a stop: confirms (locks) it once all its photos
   * are sorted. Resolves with the confirmed stop id, null when not done yet.
   */
  finishStop: (
    stop: SortStop,
    sortedNow: ReadonlySet<string>,
  ) => Promise<string | null>
  /** "Opravit čas": shifts the copy by the proposed offset (shift_media_time). */
  fixCopyTime: (copyId: string, offsetSeconds: number) => Promise<number>
  /** "Nechat obě": the copy is not offered again (client side). */
  keepBoth: (journeyId: string, copyId: string) => void
  /** Kontrola: the user opened a to-check stop. */
  markOpened: (journeyId: string, stopId: string) => void
  /** "Spojit s předchozí zastávkou": folds the stop into the previous one. */
  mergeWithPrevious: (previousId: string, stopId: string) => Promise<string>
  /** "Přesunout fotky" (the MoveToSheet path): locks source and target. */
  movePhotos: (mediaIds: readonly string[], stopId: string) => Promise<number>
  /** "Udělat z ní zastávku": a ride becomes a stay and is locked. */
  promoteEnRoute: (stopId: string) => Promise<void>
  /** "Přejmenovat": a manual title (locks the stop). */
  renameStop: (stopId: string, title: string) => Promise<void>
  /** Sorting: the photos were gone through (reviewed_at), or back to waiting. */
  sortPhotos: (mediaIds: readonly string[], sorted?: boolean) => Promise<number>
  /** "Rozdělit": photos at or after `at` form a new stop; both get locked. */
  splitStop: (stopId: string, at: string) => Promise<string>
  /** "Je to kopie, do koše": restorable from the trash. */
  trashCopy: (copyId: string) => Promise<number>
}

export const MAX_TITLE_LENGTH = 160

export function createFlowActions(
  overrides: Partial<FlowActionDeps> = {},
  /** Signed-in user the client-side markers belong to (null: none kept). */
  userId: string | null = null,
): FlowActions {
  const deps: FlowActionDeps = {
    confirmMoments,
    markMediaReviewed,
    mergeMoments,
    moveMedia,
    newId: () => crypto.randomUUID(),
    shiftMediaTime,
    splitMoment,
    trashMedia,
    updateMarkers: (journeyId, change) => {
      if (userId !== null) updateFlowMarkers(userId, journeyId, change)
    },
    updateMoment,
    ...overrides,
  }
  return {
    acknowledgeArrivals: (journeyId, seenUpTo) => {
      deps.updateMarkers(journeyId, (markers) =>
        acknowledgeArrivals(markers, seenUpTo),
      )
    },
    assignToStop: (mediaIds, stopId) =>
      mediaIds.length === 0
        ? Promise.resolve(0)
        : deps.moveMedia(mediaIds, stopId),
    confirmStops: (stopIds) => deps.confirmMoments([...stopIds]),
    daySits: async (model) => {
      if (!model.daySits || model.daySitsIds.length === 0) return false
      await deps.confirmMoments([...model.daySitsIds])
      return true
    },
    finishStop: async (stop, sortedNow) => {
      const id = stopToConfirm(stop, sortedNow)
      if (id === null) return null
      await deps.confirmMoments([id])
      return id
    },
    fixCopyTime: (copyId, offsetSeconds) =>
      deps.shiftMediaTime([copyId], offsetSeconds),
    keepBoth: (journeyId, copyId) => {
      deps.updateMarkers(journeyId, (markers) => keepCopy(markers, copyId))
    },
    markOpened: (journeyId, stopId) => {
      deps.updateMarkers(journeyId, (markers) =>
        markStopOpened(markers, stopId),
      )
    },
    mergeWithPrevious: (previousId, stopId) =>
      deps.mergeMoments(previousId, stopId),
    movePhotos: (mediaIds, stopId) => deps.moveMedia(mediaIds, stopId),
    promoteEnRoute: async (stopId) => {
      await deps.updateMoment(stopId, { kind: 'stay', locked: true })
    },
    renameStop: async (stopId, title) => {
      const text = title.trim()
      if (text === '' || text.length > MAX_TITLE_LENGTH) {
        throw new MomentError('invalid_input', 'title length')
      }
      await deps.updateMoment(stopId, { title: text })
    },
    sortPhotos: (mediaIds, sorted = true) =>
      deps.markMediaReviewed(mediaIds, sorted),
    splitStop: (stopId, at) => deps.splitMoment(stopId, at, deps.newId()),
    trashCopy: (copyId) => deps.trashMedia([copyId]),
  }
}
