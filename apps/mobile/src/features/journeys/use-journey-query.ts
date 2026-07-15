import { useQuery } from '@tanstack/react-query'
import {
  fetchJourneyDetail,
  type JourneyDetail,
} from '@/features/journeys/api/journeys.repository'
import { journeyQueryKeys } from '@/features/journeys/query-keys'
import { getCachedJourney } from '@/platform/storage/sqlite'

function requireJourneyId(journeyId: string | undefined): string {
  if (journeyId === undefined) {
    throw new Error('Journey ID is required')
  }

  return journeyId
}

export function useJourneyQuery(journeyId: string | undefined) {
  const cacheQuery = useQuery({
    enabled: journeyId !== undefined,
    queryFn: () => getCachedJourney(requireJourneyId(journeyId)),
    queryKey: journeyQueryKeys.detailLocal(journeyId ?? ''),
  })

  const journeyQuery = useQuery({
    enabled: journeyId !== undefined && cacheQuery.isFetched,
    placeholderData: (): JourneyDetail | undefined => {
      if (cacheQuery.data === null || cacheQuery.data === undefined) {
        return undefined
      }

      return { isOffline: true, journey: cacheQuery.data }
    },
    queryFn: () =>
      fetchJourneyDetail(
        requireJourneyId(journeyId),
        cacheQuery.data ?? null,
      ),
    queryKey: journeyQueryKeys.detail(journeyId ?? ''),
  })

  const data = journeyQuery.data

  return {
    ...journeyQuery,
    data,
    isLoading: journeyQuery.isLoading && data === undefined,
    isRevalidating:
      (journeyQuery.isFetching || cacheQuery.isFetching) &&
      data !== undefined &&
      !journeyQuery.isLoading,
  }
}
