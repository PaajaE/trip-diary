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
import { resolveDefaultSpaceId } from '@/features/spaces/api/spaces.repository'
import { isNetworkOnline, useNetworkState } from '@/foundation/network'
import { isSupabaseConfigured } from '@/platform/supabase'

export function useJourneysQuery(userId: string | undefined) {
  const queryClient = useQueryClient()
  const networkState = useNetworkState()
  const isOnline = isNetworkOnline(networkState)
  const wasOnlineRef = useRef(isOnline)
  const hydratedKeyRef = useRef<string | null>(null)

  const spaceQuery = useQuery({
    enabled: userId !== undefined && isSupabaseConfigured(),
    queryFn: () => {
      if (userId === undefined) {
        throw new Error('User ID is required')
      }
      return resolveDefaultSpaceId(userId)
    },
    queryKey: ['default-space', userId ?? ''],
    retry: 1,
    staleTime: 5 * 60_000,
  })

  const spaceId = spaceQuery.data
  const spaceResolved = typeof spaceId === 'string' && spaceId.length > 0

  useEffect(() => {
    hydratedKeyRef.current = null
  }, [userId, spaceId])

  useEffect(() => {
    if (userId === undefined || typeof spaceId !== 'string') {
      return
    }

    const hydrateKey = `${userId}:${spaceId}`
    if (hydratedKeyRef.current === hydrateKey) {
      return
    }

    let cancelled = false

    void readCachedJourneyList(userId, spaceId).then((cached) => {
      if (cancelled || cached.journeys.length === 0) {
        return
      }

      hydratedKeyRef.current = hydrateKey
      queryClient.setQueryData<JourneyListLoadResult>(
        journeyQueryKeys.list(userId, spaceId),
        (existing) =>
          existing ??
          ({
            cachedAt: cached.cachedAt,
            isAuthoritativeEmpty: false,
            isFromCache: true,
            isOffline: !isOnline,
            journeys: cached.journeys,
            refreshFailed: false,
            spaceId,
          } satisfies JourneyListLoadResult),
      )
    })

    return () => {
      cancelled = true
    }
  }, [isOnline, queryClient, spaceId, userId])

  const query = useQuery({
    enabled: userId !== undefined && spaceResolved,
    queryFn: () => {
      if (userId === undefined || typeof spaceId !== 'string') {
        throw new Error('User ID and space ID are required')
      }

      return loadJourneyList({
        isOnline,
        spaceId,
        userId,
      })
    },
    queryKey: journeyQueryKeys.list(userId ?? '', spaceId ?? ''),
  })

  useEffect(() => {
    if (
      userId !== undefined &&
      typeof spaceId === 'string' &&
      shouldInvalidateJourneyListOnReconnect(wasOnlineRef.current, isOnline)
    ) {
      void queryClient.invalidateQueries({
        queryKey: journeyQueryKeys.list(userId, spaceId),
      })
    }

    wasOnlineRef.current = isOnline
  }, [isOnline, queryClient, spaceId, userId])

  const result = query.data
  const journeys = result?.journeys ?? []
  const presentation = resolveJourneyListPresentation({
    isError: query.isError || spaceQuery.isError,
    isFetched: query.isFetched || spaceQuery.isFetched,
    isLoading: query.isLoading || spaceQuery.isLoading,
    isOnline,
    journeysCount: journeys.length,
    result,
    spaceResolved: spaceResolved || !isSupabaseConfigured(),
    supabaseConfigured: isSupabaseConfigured(),
  })

  return {
    ...query,
    data: journeys,
    isOnline,
    spaceId,
    spaceError: spaceQuery.error,
    ...presentation,
  }
}
