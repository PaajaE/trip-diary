import { useQuery } from '@tanstack/react-query'
import { listMySpaces } from '@/entities/space/api/space.repository'
import { spaceQueryKeys } from '@/entities/space/api/space-query-keys'
import { getActiveSpaceId } from '@/entities/space/model/active-space'

export function useActiveSpace(userId: string | undefined) {
  const query = useQuery({
    enabled: userId !== undefined,
    queryFn: () => listMySpaces(userId ?? ''),
    queryKey: spaceQueryKeys.byUser(userId),
  })
  const publishableSpaces = query.data?.filter(({ role }) => role !== 'member')
  const activeId =
    publishableSpaces === undefined
      ? ''
      : getActiveSpaceId(publishableSpaces.map(({ id }) => id))

  return {
    ...query,
    activeSpace: publishableSpaces?.find(({ id }) => id === activeId) ?? null,
  }
}
