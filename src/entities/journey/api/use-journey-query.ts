import { useQuery } from '@tanstack/react-query'
import { pickJourneyQueryData } from '@/entities/journey/api/journey-local-merge'
import {
  canContributeToJourney,
  getCachedCanContributeToJourney,
  getJourney,
  getJourneyFromCache,
  getPublicJourney,
} from '@/entities/journey/api/journey.repository'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import { isBrowserOnline } from '@/shared/lib/network'

export function usePublicJourneyQuery(journeyId: string) {
  return useQuery({
    queryFn: () => getPublicJourney(journeyId),
    queryKey: journeyQueryKeys.publicDetail(journeyId),
  })
}

export function useJourneyQuery(journeyId: string) {
  const online = isBrowserOnline()

  const cacheQuery = useQuery({
    queryFn: () => getJourneyFromCache(journeyId),
    queryKey: journeyQueryKeys.detailLocal(journeyId),
  })

  const journeyQuery = useQuery({
    enabled: cacheQuery.isFetched && online,
    placeholderData: () => cacheQuery.data ?? undefined,
    queryFn: () => getJourney(journeyId),
    queryKey: journeyQueryKeys.detail(journeyId),
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
  const cacheQuery = useQuery<boolean | null>({
    queryFn: async () =>
      (await getCachedCanContributeToJourney(journeyId)) ?? null,
    queryKey: journeyQueryKeys.contributionLocal(journeyId),
  })

  const contributionQuery = useQuery<boolean>({
    enabled: cacheQuery.isFetched,
    placeholderData: (): boolean | undefined =>
      cacheQuery.data === null ? undefined : cacheQuery.data,
    queryFn: () => canContributeToJourney(journeyId),
    queryKey: journeyQueryKeys.contribution(journeyId),
  })

  return {
    ...contributionQuery,
    data: contributionQuery.data ?? cacheQuery.data ?? undefined,
    isLoading: !cacheQuery.isFetched || contributionQuery.isLoading,
  }
}
