import type { QueryClient } from '@tanstack/react-query'
import { dashboardQueryKeys } from '@/entities/dashboard/api/dashboard-query-keys'
import { entryQueryKeys } from '@/entities/entry/api/entry-query-keys'
import { invalidateJourneyAfterEntryMutation } from '@/entities/journey/api/invalidate-journey-queries'
import { photoQueryKeys } from '@/entities/photo/api/photo-query-keys'
import { sharingQueryKeys } from '@/entities/sharing/api/sharing-query-keys'
import { invalidateEntryTranslations } from '@/entities/translation/api/invalidate-entry-translations'

const entryDetailVariants = (entryId: string) =>
  [
    entryQueryKeys.detail(entryId),
    entryQueryKeys.public(entryId),
    entryQueryKeys.photoPreviews(entryId),
    entryQueryKeys.photoDetailPreviews(entryId),
    entryQueryKeys.inlineEdit(entryId),
    entryQueryKeys.publicCardThumb(entryId),
    sharingQueryKeys.entryPublicShare(entryId),
  ] as const

export async function invalidateAfterEntryUpdate(
  queryClient: QueryClient,
  input: { entryId: string; journeyId?: string },
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: entryQueryKeys.detail(input.entryId),
  })
  await invalidateEntryTranslations(queryClient, input.entryId)

  if (input.journeyId !== undefined) {
    await invalidateJourneyAfterEntryMutation(queryClient, input.journeyId)
  }
}

export async function invalidateAfterEntryDelete(
  queryClient: QueryClient,
  input: { entryId: string; journeyId?: string; userId?: string },
): Promise<void> {
  for (const queryKey of entryDetailVariants(input.entryId)) {
    queryClient.removeQueries({ queryKey })
  }

  await invalidateEntryTranslations(queryClient, input.entryId)

  if (input.journeyId !== undefined) {
    await invalidateJourneyAfterEntryMutation(queryClient, input.journeyId)
  } else {
    await queryClient.invalidateQueries({
      queryKey: photoQueryKeys.journeyGalleryRoot,
    })
  }

  if (input.userId !== undefined) {
    await queryClient.invalidateQueries({
      queryKey: dashboardQueryKeys.byUser(input.userId),
    })
    await queryClient.invalidateQueries({
      queryKey: dashboardQueryKeys.byUserLocal(input.userId),
    })
  }
}
