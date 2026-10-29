import { useQuery } from '@tanstack/react-query'
import { listMySpaces } from '@/entities/space/api/space.repository'
import { spaceQueryKeys } from '@/entities/space/api/space-query-keys'

/** Public handle of the user's personal space, or null until it is known. */
export function usePersonalSpaceHandle(userId: string | undefined) {
  const query = useQuery({
    enabled: userId !== undefined,
    queryFn: () => listMySpaces(userId ?? ''),
    queryKey: spaceQueryKeys.byUser(userId),
  })
  return query.data?.find(({ kind }) => kind === 'personal')?.handle ?? null
}
