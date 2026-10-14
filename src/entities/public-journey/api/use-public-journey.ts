import { useQuery } from '@tanstack/react-query'
import type { PublicJourney } from '@trip-diary/core/public-journey'
import { getPublicJourneyTree } from '@/entities/public-journey/api/public-journey.repository'
import { publicJourneyQueryKeys } from '@/entities/public-journey/api/public-journey-query-keys'

/**
 * `initialData` is the seam for prerendered data: when provided the query
 * starts as resolved and no loading state is ever shown.
 */
export function usePublicJourney(
  spaceHandle: string,
  journeySlug: string,
  initialData?: PublicJourney | null,
) {
  return useQuery({
    queryFn: () => getPublicJourneyTree(spaceHandle, journeySlug),
    queryKey: publicJourneyQueryKeys.detail(spaceHandle, journeySlug),
    staleTime: 60_000,
    ...(initialData !== undefined ? { initialData } : {}),
  })
}
