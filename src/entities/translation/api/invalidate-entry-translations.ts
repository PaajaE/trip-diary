import type { QueryClient } from '@tanstack/react-query'
import { translationQueryKeys } from '@/entities/translation/api/translation-query-keys'

export function invalidateEntryTranslations(
  queryClient: QueryClient,
  entryId: string,
): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: translationQueryKeys.byEntry(entryId),
  })
}
