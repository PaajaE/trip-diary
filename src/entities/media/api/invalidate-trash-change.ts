import type { QueryClient } from '@tanstack/react-query'
import { invalidateJourneyTree } from '@/entities/journey/api/invalidate-journey-tree'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import { mediaQueryKeys } from '@/entities/media/api/media-query-keys'

/**
 * After trash / restore / purge / delete_moment: the workspace tree (media,
 * moments, segments: counts and covers derive from it), the trash list and the
 * journey cover (trash_media clears covers that pointed at trashed media).
 */
export function invalidateTrashChange(
  queryClient: QueryClient,
  journeyId: string,
): Promise<unknown[]> {
  return Promise.all([
    invalidateJourneyTree(queryClient, journeyId),
    queryClient.invalidateQueries({
      queryKey: mediaQueryKeys.trash(journeyId),
    }),
    queryClient.invalidateQueries({
      queryKey: journeyQueryKeys.cover(journeyId),
    }),
  ])
}
