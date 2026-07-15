import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  loadJourneyStops,
  readCachedJourneyStops,
  type JourneyStopsLoadResult,
} from '@/features/journeys/api/journey-stops.repository'
import { journeyQueryKeys } from '@/features/journeys/query-keys'
import { isNetworkOnline, useNetworkState } from '@/foundation/network'

export function useJourneyStopsQuery(
  userId: string | undefined,
  journeyId: string | undefined,
) {
  const queryClient = useQueryClient()
  const networkState = useNetworkState()
  const isOnline = isNetworkOnline(networkState)
  const wasOnlineRef = useRef(isOnline)
  const hydratedKeyRef = useRef<string | null>(null)
  const hydrationKey =
    userId !== undefined && journeyId !== undefined
      ? `${userId}:${journeyId}`
      : null

  useEffect(() => {
    hydratedKeyRef.current = null
  }, [hydrationKey])

  useEffect(() => {
    if (userId === undefined || journeyId === undefined) {
      return
    }

    if (hydratedKeyRef.current === hydrationKey) {
      return
    }

    let cancelled = false

    void readCachedJourneyStops(userId, journeyId).then((cached) => {
      if (cancelled || cached.stops.length === 0) {
        return
      }

      hydratedKeyRef.current = hydrationKey
      queryClient.setQueryData<JourneyStopsLoadResult>(
        journeyQueryKeys.stops(userId, journeyId),
        (existing) =>
          existing ??
          ({
            cachedAt: cached.cachedAt,
            isAuthoritativeEmpty: false,
            isFromCache: true,
            isOffline: !isOnline,
            refreshFailed: false,
            stops: cached.stops,
          } satisfies JourneyStopsLoadResult),
      )
    })

    return () => {
      cancelled = true
    }
  }, [hydrationKey, isOnline, journeyId, queryClient, userId])

  const query = useQuery({
    enabled: userId !== undefined && journeyId !== undefined,
    queryFn: () => {
      if (userId === undefined || journeyId === undefined) {
        throw new Error('User ID and journey ID are required')
      }

      return loadJourneyStops({
        isOnline,
        journeyId,
        userId,
      })
    },
    queryKey: journeyQueryKeys.stops(userId ?? '', journeyId ?? ''),
  })

  useEffect(() => {
    if (
      userId !== undefined &&
      journeyId !== undefined &&
      !wasOnlineRef.current &&
      isOnline
    ) {
      void queryClient.invalidateQueries({
        queryKey: journeyQueryKeys.stops(userId, journeyId),
      })
    }

    wasOnlineRef.current = isOnline
  }, [isOnline, journeyId, queryClient, userId])

  const result = query.data
  const stops = result?.stops ?? []

  return {
    ...query,
    data: stops,
    isOnline,
    result,
  }
}
