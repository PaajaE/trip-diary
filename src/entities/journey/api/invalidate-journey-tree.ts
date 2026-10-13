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
): Promise<unknown[]> {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: segmentQueryKeys.journey(journeyId),
    }),
    queryClient.invalidateQueries({
      queryKey: momentQueryKeys.journey(journeyId),
    }),
    queryClient.invalidateQueries({
      queryKey: mediaQueryKeys.journey(journeyId),
    }),
  ])
}

export const invalidateAfterSegmentMutation = invalidateJourneyTree
export const invalidateAfterMomentMutation = invalidateJourneyTree
export const invalidateAfterMediaMutation = invalidateJourneyTree
