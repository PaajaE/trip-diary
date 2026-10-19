import { useQuery } from '@tanstack/react-query'
import { getMyJourneyRole } from '@/entities/journey/api/journey-member.repository'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import { useSession } from '@/features/auth/session'

export interface JourneyEditAccess {
  /** Owner or editor (mirrors can_edit_journey); false until known. */
  canEdit: boolean
  /** The role is known (or there is no signed-in user). */
  ready: boolean
}

/** Whether the signed-in user may edit this journey, from journey_members. */
export function useCanEditJourney(journeyId: string): JourneyEditAccess {
  const { user } = useSession()
  const userId = user?.id
  const query = useQuery({
    enabled: userId !== undefined,
    queryFn: () => getMyJourneyRole(journeyId, userId ?? ''),
    queryKey: journeyQueryKeys.myRole(journeyId, userId),
  })
  const role = query.data
  return {
    canEdit: role === 'owner' || role === 'editor',
    ready: userId === undefined || !query.isPending,
  }
}
