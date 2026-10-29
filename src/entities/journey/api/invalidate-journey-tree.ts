import type { QueryClient } from '@tanstack/react-query'
import { mediaQueryKeys } from '@/entities/media/api/media-query-keys'
import { momentQueryKeys } from '@/entities/moment/api/moment-query-keys'
import { segmentQueryKeys } from '@/entities/segment/api/segment-query-keys'

/**
 * Journey-tree invalidation after owner edits. Segment edits can re-parent
 * trips and media overrides; moment edits and media assignment change each
 * other's lists, so every helper refreshes the whole tree for the journey.
 */
export function invalidateJourneyTree(
  queryClient: QueryClient,
  journeyId: string,
  /** `cancelRefetch: false` keeps a refetch that is already running. */
  options: { cancelRefetch?: boolean } = {},
): Promise<unknown[]> {
  return Promise.all([
    queryClient.invalidateQueries(
      { queryKey: segmentQueryKeys.journey(journeyId) },
      options,
    ),
    queryClient.invalidateQueries(
      { queryKey: momentQueryKeys.journey(journeyId) },
      options,
    ),
    queryClient.invalidateQueries(
      { queryKey: mediaQueryKeys.journey(journeyId) },
      options,
    ),
  ])
}

export const invalidateAfterSegmentMutation = invalidateJourneyTree
export const invalidateAfterMomentMutation = invalidateJourneyTree
export const invalidateAfterMediaMutation = invalidateJourneyTree
