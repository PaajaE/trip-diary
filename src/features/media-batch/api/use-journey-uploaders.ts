import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { listJourneyMembers } from '@/entities/journey/api/journey-member.repository'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import type { MediaItem } from '@/entities/media/model/media-library'
import { useSession } from '@/features/auth/session'
import {
  buildUploaderModel,
  type UploaderModel,
} from '@/features/media-batch/model/uploaders'

/**
 * Uploader names for the batch (UX-43). Names come from the same member list
 * the members page uses (`listJourneyMembers`, shared query key). If that
 * list cannot be read the batch still marks foreign media, generically.
 */
export function useJourneyUploaders(
  journeyId: string,
  items: readonly MediaItem[],
): UploaderModel {
  const { user } = useSession()
  const members = useQuery({
    enabled: user !== null,
    queryFn: () => listJourneyMembers(journeyId),
    queryKey: journeyQueryKeys.members(journeyId),
  })
  const membersData = members.data ?? null
  const userId = user?.id ?? null
  return useMemo(
    () =>
      buildUploaderModel(
        userId,
        membersData,
        items.map((item) => item.ownerId),
      ),
    [userId, membersData, items],
  )
}
