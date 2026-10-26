import { useMemo } from 'react'
import { useJourneyPlaces } from '@/entities/place/api/use-journey-places'
import {
  collectMoments,
  type WorkspaceTree,
} from '@/features/journey-workspace/model/workspace-tree'

const NONE: ReadonlyMap<string, string> = new Map()

/** Place names (by place id) of the stops of a workspace tree; empty until loaded. */
export function useTreePlaceNames(
  journeyId: string,
  tree: WorkspaceTree | null,
): ReadonlyMap<string, string> {
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
  return useMemo(
    () =>
      places.size === 0
        ? NONE
        : new Map([...places].map(([id, place]) => [id, place.name])),
    [places],
  )
}
