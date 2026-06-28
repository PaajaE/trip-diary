import { useQuery } from '@tanstack/react-query'
import {
  canContributeToJourney,
  getCachedCanContributeToJourney,
  getJourney,
  getJourneyFromCache,
} from '@/entities/journey/api/journey.repository'

export function useJourneyQuery(journeyId: string) {
  const cacheQuery = useQuery({
    queryFn: () => getJourneyFromCache(journeyId),
    queryKey: ['journeys', journeyId, 'local'],
  })

  const journeyQuery = useQuery({
    enabled: cacheQuery.isFetched,
    placeholderData: () => cacheQuery.data ?? undefined,
    queryFn: () => getJourney(journeyId),
    queryKey: ['journeys', journeyId],
  })

  return {
    ...journeyQuery,
    data: journeyQuery.data ?? cacheQuery.data,
    isLoading: journeyQuery.isLoading && cacheQuery.data === undefined,
    isRevalidating:
      journeyQuery.isFetching &&
      cacheQuery.data !== undefined &&
      !journeyQuery.isLoading,
  }
}

export function useJourneyContributionQuery(journeyId: string) {
  const cacheQuery = useQuery({
    queryFn: () => getCachedCanContributeToJourney(journeyId),
    queryKey: ['journey-contribution', journeyId, 'local'],
  })

  const contributionQuery = useQuery({
    enabled: cacheQuery.isFetched,
    placeholderData: () => cacheQuery.data,
    queryFn: () => canContributeToJourney(journeyId),
    queryKey: ['journey-contribution', journeyId],
  })

  return {
    ...contributionQuery,
    data: contributionQuery.data ?? cacheQuery.data,
    isLoading:
      contributionQuery.isLoading && cacheQuery.data === undefined,
  }
}
