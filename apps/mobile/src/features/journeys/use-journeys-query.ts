import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  loadJourneyList,
  readCachedJourneyList,
} from '@/features/journeys/api/journeys.repository'
import { journeyQueryKeys } from '@/features/journeys/query-keys'
import type { JourneyListLoadResult } from '@/features/journeys/api/journeys.repository'
import {
  resolveJourneyListPresentation,
  shouldInvalidateJourneyListOnReconnect,
} from '@/features/journeys/journey-list-presentation'
import { isNetworkOnline, useNetworkState } from '@/foundation/network'
import { isSupabaseConfigured } from '@/platform/supabase'

export function useJourneysQuery(userId: string | undefined) {
  const queryClient = useQueryClient()
  const networkState = useNetworkState()
  const isOnline = isNetworkOnline(networkState)
  const wasOnlineRef = useRef(isOnline)
  const hydratedUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    hydratedUserIdRef.current = null
  }, [userId])

  useEffect(() => {
    if (userId === undefined) {
      return
    }

    if (hydratedUserIdRef.current === userId) {
      return
    }

    let cancelled = false

    void readCachedJourneyList(userId).then((cached) => {
      if (cancelled || cached.journeys.length === 0) {
        return
      }

      hydratedUserIdRef.current = userId
      queryClient.setQueryData<JourneyListLoadResult>(
        journeyQueryKeys.list(userId),
        (existing) =>
          existing ??
          ({
            cachedAt: cached.cachedAt,
            isAuthoritativeEmpty: false,
            isFromCache: true,
            isOffline: !isOnline,
            journeys: cached.journeys,
            refreshFailed: false,
          } satisfies JourneyListLoadResult),
      )
    })

    return () => {
      cancelled = true
    }
  }, [isOnline, queryClient, userId])

  const query = useQuery({
    enabled: userId !== undefined,
    queryFn: () => {
      if (userId === undefined) {
        throw new Error('User ID is required')
      }

      return loadJourneyList({
        isOnline,
        userId,
      })
    },
    queryKey: journeyQueryKeys.list(userId ?? ''),
  })

  useEffect(() => {
    if (
      userId !== undefined &&
      shouldInvalidateJourneyListOnReconnect(wasOnlineRef.current, isOnline)
    ) {
      void queryClient.invalidateQueries({
        queryKey: journeyQueryKeys.list(userId),
      })
    }

    wasOnlineRef.current = isOnline
  }, [isOnline, queryClient, userId])

  const result = query.data
  const journeys = result?.journeys ?? []
  const presentation = resolveJourneyListPresentation({
    isError: query.isError,
    isFetched: query.isFetched,
    isLoading: query.isLoading,
    isOnline,
    journeysCount: journeys.length,
    result,
    supabaseConfigured: isSupabaseConfigured(),
  })

  return {
    ...query,
    data: journeys,
    isOnline,
    ...presentation,
  }
}
