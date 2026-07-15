import type { QueryClient } from '@tanstack/react-query'
import { checklistQueryKeys } from '@/entities/checklist/api/checklist-query-keys'
import { dashboardQueryKeys } from '@/entities/dashboard/api/dashboard-query-keys'
import { entryQueryKeys } from '@/entities/entry/api/entry-query-keys'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import { natureQueryKeys } from '@/entities/nature/api/nature-query-keys'
import { photoQueryKeys } from '@/entities/photo/api/photo-query-keys'
import { spaceQueryKeys } from '@/entities/space/api/space-query-keys'

export function invalidateAfterManualSync(
  queryClient: QueryClient,
  userId: string,
): Promise<unknown[]> {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: dashboardQueryKeys.byUser(userId),
    }),
    queryClient.invalidateQueries({
      queryKey: dashboardQueryKeys.byUserLocal(userId),
    }),
    queryClient.invalidateQueries({ queryKey: journeyQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: entryQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: spaceQueryKeys.byUser(userId) }),
    queryClient.invalidateQueries({
      queryKey: photoQueryKeys.journeyGalleryRoot,
    }),
    queryClient.invalidateQueries({ queryKey: checklistQueryKeys.all }),
    queryClient.invalidateQueries({
      queryKey: natureQueryKeys.observationsAll,
    }),
    queryClient.invalidateQueries({ queryKey: photoQueryKeys.journeyTagsRoot }),
  ])
}
