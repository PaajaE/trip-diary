import { useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { invalidateJourneyTree } from '@/entities/journey/api/invalidate-journey-tree'
import { useJourneyPlaces } from '@/entities/place/api/use-journey-places'
import {
  createFlowActions,
  type FlowActions,
} from '@/features/journey-flow/api/flow-actions'
import { useFlowMarkers } from '@/features/journey-flow/api/flow-markers.store'
import {
  applyFlowMarkers,
  buildFlowBase,
  type FlowJourney,
} from '@/features/journey-flow/model/flow-days'
import { useSession } from '@/features/auth/session'
import type { FlowMarkers } from '@/features/journey-flow/model/flow-markers'
import { useJourneyWorkspace } from '@/features/journey-workspace/api/use-journey-workspace'
import { browserZone } from '@/features/journey-workspace/lib/format-range'
import { collectMoments } from '@/features/journey-workspace/model/workspace-tree'

export type JourneyFlowState =
  | { status: 'loading' }
  | { retry: () => void; status: 'error' }
  | {
      flow: FlowJourney
      markers: FlowMarkers
      placeNames: ReadonlyMap<string, string>
      status: 'ready'
    }

/**
 * The flow days of a journey (see model/flow-days) from the same queries as
 * the workspace, so edits anywhere refresh it. Days use the workspace's
 * fallback zone (the device zone), exactly like the overview.
 */
export function useJourneyFlow(journeyId: string): JourneyFlowState {
  const workspace = useJourneyWorkspace(journeyId)
  const { user } = useSession()
  const markers = useFlowMarkers(user?.id ?? null, journeyId)
  const tree = workspace.status === 'ready' ? workspace.tree : null
  const placeIds = useMemo(
    () =>
      tree === null
        ? []
        : [
            ...new Set(
              collectMoments(tree).flatMap((entry) =>
                entry.moment.placeId === null ? [] : [entry.moment.placeId],
              ),
            ),
          ],
    [tree],
  )
  const places = useJourneyPlaces(journeyId, placeIds)
  const placeNames = useMemo(
    () => new Map([...places].map(([id, place]) => [id, place.name])),
    [places],
  )
  // The heavy part (copies, confidence, names) only reruns with the data;
  // a marker change (opened stop, kept copy) just re-applies the markers.
  const base = useMemo(
    () =>
      tree === null
        ? null
        : buildFlowBase({ homeTz: browserZone(), placeNames, tree }),
    [placeNames, tree],
  )
  const flow = useMemo(
    () => (base === null ? null : applyFlowMarkers(base, markers)),
    [base, markers],
  )
  if (workspace.status === 'error') {
    return { retry: workspace.retry, status: 'error' }
  }
  if (flow === null) return { status: 'loading' }
  return { flow, markers, placeNames, status: 'ready' }
}

/**
 * Flow actions that refresh the journey tree after every write (also a
 * failed one: a partial change is still a change). Errors are re-thrown for
 * the screen's own toast.
 */
export function useFlowActions(journeyId: string): FlowActions {
  const queryClient = useQueryClient()
  const { user } = useSession()
  const userId = user?.id ?? null
  return useMemo(() => {
    const base = createFlowActions({}, userId)
    const refresh = () =>
      invalidateJourneyTree(queryClient, journeyId).catch(() => undefined)
    const wrap =
      <A extends unknown[], R>(action: (...args: A) => Promise<R>) =>
      async (...args: A): Promise<R> => {
        try {
          return await action(...args)
        } finally {
          await refresh()
        }
      }
    return {
      ...base,
      assignToStop: wrap(base.assignToStop),
      confirmStops: wrap(base.confirmStops),
      createStopFromPhotos: wrap(base.createStopFromPhotos),
      daySits: wrap(base.daySits),
      finishStop: wrap(base.finishStop),
      fixCopyTime: wrap(base.fixCopyTime),
      mergeWithPrevious: wrap(base.mergeWithPrevious),
      movePhotos: wrap(base.movePhotos),
      promoteEnRoute: wrap(base.promoteEnRoute),
      renameStop: wrap(base.renameStop),
      restorePhotos: wrap(base.restorePhotos),
      sortPhotos: wrap(base.sortPhotos),
      splitStop: wrap(base.splitStop),
      starPhotos: wrap(base.starPhotos),
      trashCopy: wrap(base.trashCopy),
      trashPhotos: wrap(base.trashPhotos),
    }
  }, [journeyId, queryClient, userId])
}
