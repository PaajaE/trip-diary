import { useQuery } from '@tanstack/react-query'
import { getJourneyHomeTz } from '@/entities/journey/api/journey-home-tz.repository'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'

/** Journey home zone (journeys.home_tz); data is undefined until loaded, null when unset. */
export function useJourneyHomeTzQuery(journeyId: string) {
  return useQuery({
    queryFn: () => getJourneyHomeTz(journeyId),
    queryKey: journeyQueryKeys.homeTz(journeyId),
  })
}
