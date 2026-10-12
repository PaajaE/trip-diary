import { useQuery } from '@tanstack/react-query'
import { listSpaceTips } from '@/entities/tip/api/tip.repository'
import { tipQueryKeys } from '@/entities/tip/api/tip-query-keys'

export function useTipsQuery(
  spaceId: string | undefined,
  authorId: string | undefined,
) {
  return useQuery({
    enabled: spaceId !== undefined && authorId !== undefined,
    queryFn: () => listSpaceTips(spaceId ?? '', authorId ?? ''),
    queryKey: tipQueryKeys.space(spaceId ?? ''),
  })
}
