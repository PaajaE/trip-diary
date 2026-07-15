import type { QueryClient } from '@tanstack/react-query'
import { checklistQueryKeys } from '@/entities/checklist/api/checklist-query-keys'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import { natureQueryKeys } from '@/entities/nature/api/nature-query-keys'
import { photoQueryKeys } from '@/entities/photo/api/photo-query-keys'

export function invalidateJourneyNatureAggregates(
  queryClient: QueryClient,
  journeyId: string,
): Promise<unknown[]> {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: checklistQueryKeys.journey(journeyId),
    }),
    queryClient.invalidateQueries({
      queryKey: natureQueryKeys.journeyObservations(journeyId),
    }),
  ])
}

export function invalidateJourneyPhotoAggregates(
  queryClient: QueryClient,
  journeyId: string,
): Promise<unknown[]> {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: photoQueryKeys.journeyGalleryRoot,
    }),
    queryClient.invalidateQueries({
      queryKey: photoQueryKeys.journeyPhotoLocationsPrefix(journeyId),
    }),
    queryClient.invalidateQueries({
      queryKey: photoQueryKeys.journeyTags(journeyId),
    }),
  ])
}

export function invalidateJourneyAfterEntryMutation(
  queryClient: QueryClient,
  journeyId: string,
): Promise<unknown[]> {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: journeyQueryKeys.detail(journeyId),
    }),
    queryClient.invalidateQueries({
      queryKey: journeyQueryKeys.detailLocal(journeyId),
    }),
    queryClient.invalidateQueries({
      queryKey: checklistQueryKeys.journey(journeyId),
    }),
    queryClient.invalidateQueries({
      queryKey: natureQueryKeys.journeyObservations(journeyId),
    }),
    queryClient.invalidateQueries({
      queryKey: photoQueryKeys.journeyGalleryRoot,
    }),
    queryClient.invalidateQueries({
      queryKey: photoQueryKeys.journeyPhotoLocationsPrefix(journeyId),
    }),
    queryClient.invalidateQueries({
      queryKey: photoQueryKeys.journeyTags(journeyId),
    }),
  ])
}

export function invalidateJourneyContentChange(
  queryClient: QueryClient,
  journeyId: string,
): Promise<unknown[]> {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: checklistQueryKeys.journey(journeyId),
    }),
    queryClient.invalidateQueries({
      queryKey: natureQueryKeys.journeyObservations(journeyId),
    }),
    queryClient.invalidateQueries({
      queryKey: photoQueryKeys.journeyGalleryRoot,
    }),
  ])
}
