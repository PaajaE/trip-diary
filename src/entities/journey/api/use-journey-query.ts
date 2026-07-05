import { useQuery } from '@tanstack/react-query'
import { pickJourneyQueryData } from '@/entities/journey/api/journey-local-merge'
import {
  canContributeToJourney,
  getCachedCanContributeToJourney,
  getJourney,
  getJourneyFromCache,
  getPublicJourney,
} from '@/entities/journey/api/journey.repository'
import { isBrowserOnline } from '@/shared/lib/network'

export function usePublicJourneyQuery(journeyId: string) {
  return useQuery({
    queryFn: () => getPublicJourney(journeyId),
    queryKey: ['public-journeys', journeyId],
  })
}

export function useJourneyQuery(journeyId: string) {
  const online = isBrowserOnline()

  const cacheQuery = useQuery({
    queryFn: () => getJourneyFromCache(journeyId),
    queryKey: ['journeys', journeyId, 'local'],
  })

  const journeyQuery = useQuery({
    enabled: cacheQuery.isFetched && online,
    placeholderData: () => cacheQuery.data ?? undefined,
    queryFn: () => getJourney(journeyId),
    queryKey: ['journeys', journeyId],
  })

  const data = pickJourneyQueryData(
    journeyQuery.data ?? undefined,
    cacheQuery.data ?? undefined,
  )

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
    isLoading: contributionQuery.isLoading && cacheQuery.data === undefined,
  }
}
