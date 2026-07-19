import type { JourneyListLoadResult } from '@/features/journeys/api/journeys.repository'
import type { JourneyListItem } from '@trip-diary/core/journey'
import { journeyQueryKeys } from '@/features/journeys/query-keys'
import { photoQueryKeys } from '@/features/photos/query-keys'
import type { QueryClient } from '@tanstack/react-query'
import {
  readCachedJourneyList,
  removeCachedJourneyListItem,
  replaceCachedJourneyList,
} from '@/platform/storage/journey-list-cache'
import { clearCachedJourneyStopsForJourney } from '@/platform/storage/journey-stop-cache'
import { clearJourneyCache } from '@/platform/storage/sqlite'
import { cancelPendingPhotoUploadsForJourney } from '@/platform/sync/cancel-journey-photo-uploads'
import { assertCachedJourneyListItem } from '@/features/journeys/model/journey-list-item'

export async function upsertCreatedJourneyInListCache(input: {
  journey: JourneyListItem
  spaceId: string
  userId: string
}): Promise<void> {
  const cached = await readCachedJourneyList(input.userId, input.spaceId)
  const withoutDuplicate = cached.journeys.filter(
    (journey) => journey.id !== input.journey.id,
  )
  await replaceCachedJourneyList(input.userId, input.spaceId, [
    assertCachedJourneyListItem(input.journey),
    ...withoutDuplicate.map((journey) => assertCachedJourneyListItem(journey)),
  ])
}

export function applyCreatedJourneyToQueryCache(input: {
  journey: JourneyListItem
  queryClient: QueryClient
  spaceId: string
  userId: string
}): void {
  input.queryClient.setQueryData<JourneyListLoadResult>(
    journeyQueryKeys.list(input.userId, input.spaceId),
    (existing) => {
      const previous = existing?.journeys ?? []
      const journeys = [
        input.journey,
        ...previous.filter((journey) => journey.id !== input.journey.id),
      ]
      return {
        cachedAt: new Date().toISOString(),
        isAuthoritativeEmpty: false,
        isFromCache: false,
        isOffline: existing?.isOffline ?? false,
        journeys,
        refreshFailed: false,
        spaceId: input.spaceId,
      }
    },
  )
}

export async function applyDeletedJourneyLocally(input: {
  journeyId: string
  queryClient: QueryClient
  spaceId: string | undefined
  userId: string | undefined
}): Promise<void> {
  const { journeyId, queryClient, spaceId, userId } = input

  if (userId !== undefined && spaceId !== undefined) {
    await removeCachedJourneyListItem(userId, spaceId, journeyId)
    await clearCachedJourneyStopsForJourney(userId, journeyId)
    queryClient.setQueryData<JourneyListLoadResult>(
      journeyQueryKeys.list(userId, spaceId),
      (existing) => {
        if (existing === undefined) {
          return existing
        }
        const journeys = existing.journeys.filter(
          (journey) => journey.id !== journeyId,
        )
        return {
          ...existing,
          isAuthoritativeEmpty: journeys.length === 0,
          isFromCache: false,
          journeys,
          refreshFailed: false,
          spaceId,
        }
      },
    )
  } else if (userId !== undefined) {
    await clearCachedJourneyStopsForJourney(userId, journeyId)
  }

  await clearJourneyCache(journeyId)
  await cancelPendingPhotoUploadsForJourney(journeyId)

  queryClient.removeQueries({ queryKey: journeyQueryKeys.detail(journeyId) })
  queryClient.removeQueries({ queryKey: journeyQueryKeys.content(journeyId) })
  queryClient.removeQueries({
    queryKey: photoQueryKeys.journeyGallery(journeyId),
  })
  queryClient.removeQueries({
    queryKey: photoQueryKeys.journeyPhotoLocations(journeyId),
  })
  queryClient.removeQueries({
    queryKey: photoQueryKeys.journeyListCover(journeyId),
  })

  if (userId !== undefined) {
    queryClient.removeQueries({
      queryKey: journeyQueryKeys.stops(userId, journeyId),
    })
    if (spaceId !== undefined) {
      await queryClient.invalidateQueries({
        queryKey: journeyQueryKeys.list(userId, spaceId),
      })
    } else {
      await queryClient.invalidateQueries({
        queryKey: [...journeyQueryKeys.all, 'list', userId],
      })
    }
  }
}

export function invalidateJourneyPhotoQueries(
  queryClient: QueryClient,
  journeyId: string,
  userId?: string,
  spaceId?: string,
): void {
  void queryClient.invalidateQueries({
    queryKey: journeyQueryKeys.content(journeyId),
  })
  void queryClient.invalidateQueries({
    queryKey: photoQueryKeys.journeyGallery(journeyId),
  })
  void queryClient.invalidateQueries({
    queryKey: photoQueryKeys.journeyPhotoLocations(journeyId),
  })
  void queryClient.invalidateQueries({
    queryKey: photoQueryKeys.journeyListCover(journeyId),
  })
  void queryClient.invalidateQueries({
    queryKey: photoQueryKeys.journeyListCoverRoot,
  })
  if (userId !== undefined) {
    if (spaceId !== undefined) {
      void queryClient.invalidateQueries({
        queryKey: journeyQueryKeys.list(userId, spaceId),
      })
    } else {
      void queryClient.invalidateQueries({
        queryKey: [...journeyQueryKeys.all, 'list', userId],
      })
    }
    void queryClient.invalidateQueries({
      queryKey: journeyQueryKeys.stops(userId, journeyId),
    })
  }
}
