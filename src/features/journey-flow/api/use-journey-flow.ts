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
  buildFlowDays,
  type FlowJourney,
} from '@/features/journey-flow/model/flow-days'
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
  const markers = useFlowMarkers(journeyId)
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
  const flow = useMemo(
    () =>
      tree === null
        ? null
        : buildFlowDays({ homeTz: browserZone(), markers, placeNames, tree }),
    [markers, placeNames, tree],
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
  return useMemo(() => {
    const base = createFlowActions()
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
      daySits: wrap(base.daySits),
      finishStop: wrap(base.finishStop),
      fixCopyTime: wrap(base.fixCopyTime),
      mergeWithPrevious: wrap(base.mergeWithPrevious),
      movePhotos: wrap(base.movePhotos),
      promoteEnRoute: wrap(base.promoteEnRoute),
      renameStop: wrap(base.renameStop),
      sortPhotos: wrap(base.sortPhotos),
      splitStop: wrap(base.splitStop),
      trashCopy: wrap(base.trashCopy),
    }
  }, [journeyId, queryClient])
}
