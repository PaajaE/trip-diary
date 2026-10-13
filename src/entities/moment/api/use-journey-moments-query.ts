import { useQuery } from '@tanstack/react-query'
import { listJourneyMoments } from '@/entities/moment/api/moment.repository'
import { momentQueryKeys } from '@/entities/moment/api/moment-query-keys'

export function useJourneyMomentsQuery(journeyId: string) {
  return useQuery({
    queryFn: () => listJourneyMoments(journeyId),
    queryKey: momentQueryKeys.journey(journeyId),
  })
}
