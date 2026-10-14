import { useQuery } from '@tanstack/react-query'
import type { PublicJourney } from '@trip-diary/core/public-journey'
import { useEffect } from 'react'
import { getPublicJourneyTree } from '@/entities/public-journey/api/public-journey.repository'
import { publicJourneyQueryKeys } from '@/entities/public-journey/api/public-journey-query-keys'

/** Runs `run` once when the browser is idle (timer fallback); returns cancel. */
export function runWhenIdle(run: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(run, { timeout: 2500 })
    return () => {
      window.cancelIdleCallback(handle)
    }
  }
  const handle = window.setTimeout(run, 200)
  return () => {
    window.clearTimeout(handle)
  }
}

/**
 * `initialData` is the seam for prerendered data: it renders immediately with
 * no loading state, then is revalidated once in the background after first
 * paint, so a journey unpublished since the build disappears (data becomes
 * `null`) without a rebuild.
 */
export function usePublicJourney(
  spaceHandle: string,
  journeySlug: string,
  initialData?: PublicJourney | null,
) {
  const embedded = initialData !== undefined
  const query = useQuery({
    queryFn: () => getPublicJourneyTree(spaceHandle, journeySlug),
    queryKey: publicJourneyQueryKeys.detail(spaceHandle, journeySlug),
    staleTime: 60_000,
    ...(embedded
      ? {
          initialData,
          // Never refetch on mount: the single revalidation is deferred below.
          initialDataUpdatedAt: () => Date.now(),
        }
      : {}),
  })
  const { refetch } = query
  useEffect(() => {
    if (!embedded) return undefined
    return runWhenIdle(() => {
      void refetch()
    })
  }, [embedded, refetch, spaceHandle, journeySlug])
  return query
}
