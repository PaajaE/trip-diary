import { useQuery } from '@tanstack/react-query'
import { listJourneyMedia } from '@/entities/media/api/media-library.repository'
import { mediaQueryKeys } from '@/entities/media/api/media-query-keys'

export function useJourneyMediaQuery(journeyId: string) {
  return useQuery({
    queryFn: () => listJourneyMedia(journeyId),
    queryKey: mediaQueryKeys.journey(journeyId),
  })
}
