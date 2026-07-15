import type { QueryClient } from '@tanstack/react-query'
import { entryQueryKeys } from '@/entities/entry/api/entry-query-keys'
import { invalidateJourneyPhotoAggregates } from '@/entities/journey/api/invalidate-journey-queries'
import { natureQueryKeys } from '@/entities/nature/api/nature-query-keys'
import { photoQueryKeys } from '@/entities/photo/api/photo-query-keys'

export async function invalidateAfterPhotoDelete(
  queryClient: QueryClient,
  input: { entryId?: string; journeyId?: string },
): Promise<void> {
  if (input.entryId !== undefined) {
    await queryClient.invalidateQueries({
      queryKey: entryQueryKeys.photoPreviews(input.entryId),
    })
    await queryClient.invalidateQueries({
      queryKey: entryQueryKeys.photoDetailPreviews(input.entryId),
    })
  }

  if (input.journeyId !== undefined) {
    await invalidateJourneyPhotoAggregates(queryClient, input.journeyId)
    return
  }

  await queryClient.invalidateQueries({
    queryKey: photoQueryKeys.journeyGalleryRoot,
  })
}

export function invalidateAfterPhotoTagChange(
  queryClient: QueryClient,
  journeyId?: string,
): Promise<unknown[]> {
  if (journeyId === undefined) {
    return Promise.all([
      queryClient.invalidateQueries({
        queryKey: photoQueryKeys.journeyTagsRoot,
      }),
      queryClient.invalidateQueries({
        queryKey: natureQueryKeys.observationsAll,
      }),
    ])
  }

  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: photoQueryKeys.journeyTags(journeyId),
    }),
    queryClient.invalidateQueries({
      queryKey: natureQueryKeys.journeyObservations(journeyId),
    }),
  ])
}
