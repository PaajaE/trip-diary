import { useQuery } from '@tanstack/react-query'
import { getJourneyCover } from '@/entities/journey/api/journey-cover.repository'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'

export function useJourneyCoverQuery(journeyId: string) {
  return useQuery({
    queryFn: () => getJourneyCover(journeyId),
    queryKey: journeyQueryKeys.cover(journeyId),
  })
}
