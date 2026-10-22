import { useQuery } from '@tanstack/react-query'
import {
  countUnreviewedMedia,
  listUnreviewedMedia,
} from '@/entities/media/api/media-review.repository'
import { mediaQueryKeys } from '@/entities/media/api/media-query-keys'

export function useUnreviewedMediaQuery(journeyId: string) {
  return useQuery({
    queryFn: () => listUnreviewedMedia(journeyId),
    queryKey: mediaQueryKeys.unreviewed(journeyId),
  })
}

/** Counter for the "Dávka" tab badge; `enabled` false skips the request. */
export function useUnreviewedCountQuery(journeyId: string, enabled = true) {
  return useQuery({
    enabled,
    queryFn: () => countUnreviewedMedia(journeyId),
    queryKey: mediaQueryKeys.unreviewedCount(journeyId),
  })
}
