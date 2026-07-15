import { useQuery } from '@tanstack/react-query'
import { fetchJourneyFullDetail } from '@/features/journeys/api/journey-detail.repository'
import { journeyQueryKeys } from '@/features/journeys/query-keys'

function requireJourneyId(journeyId: string | undefined): string {
  if (journeyId === undefined || journeyId.length === 0) {
    throw new Error('Journey ID is required')
  }

  return journeyId
}

export function useJourneyFullDetailQuery(journeyId: string | undefined) {
  return useQuery({
    enabled: journeyId !== undefined && journeyId.length > 0,
    queryFn: async () => {
      const detail = await fetchJourneyFullDetail(requireJourneyId(journeyId))
      return { detail, isOffline: false }
    },
    queryKey: journeyQueryKeys.content(journeyId ?? ''),
  })
}
