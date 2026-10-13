import { useQuery } from '@tanstack/react-query'
import { listJourneySegments } from '@/entities/segment/api/segment.repository'
import { segmentQueryKeys } from '@/entities/segment/api/segment-query-keys'

export function useJourneySegmentsQuery(journeyId: string) {
  return useQuery({
    queryFn: () => listJourneySegments(journeyId),
    queryKey: segmentQueryKeys.journey(journeyId),
  })
}
