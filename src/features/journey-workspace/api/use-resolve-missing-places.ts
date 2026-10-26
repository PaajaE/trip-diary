import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { momentQueryKeys } from '@/entities/moment/api/moment-query-keys'
import type { Moment } from '@/entities/moment/model/moment'
import { putPlaceInCache } from '@/entities/place/api/use-journey-places'
import type { Place } from '@/entities/place/model/place'
import {
  needsPlace,
  resolveMissingPlaces,
} from '@/features/journey-workspace/api/resolve-places'

export interface PlaceResolveProgress {
  done: number
  total: number
}

/**
 * Background job: gives moments that have coordinates but no place a place
 * name (`resolveMissingPlaces`: one lookup per ~1 km cell, visible day first,
 * sequential, never overriding a place). It runs again whenever new stops
 * without a place appear (e.g. right after "Organize automatically"), skips
 * stops it already tried in this session (no retry loop), and stops when
 * the component unmounts.
 */
export function useResolveMissingPlaces(
  journeyId: string,
  moments: readonly Moment[] | undefined,
  enabled: boolean,
  focusDayKey: string | null = null,
): PlaceResolveProgress | null {
  const client = useQueryClient()
  const [progress, setProgress] = useState<PlaceResolveProgress | null>(null)
  // Re-checks for new waiting stops after a run (e.g. organize added some).
  const [round, setRound] = useState(0)
  const attempted = useRef(new Set<string>())
  const cache = useRef(new Map<string, Place | null>())
  const running = useRef(false)
  const cancelled = useRef(false)
  const focus = useRef(focusDayKey)
  useEffect(() => {
    focus.current = focusDayKey
  }, [focusDayKey])
  useEffect(() => {
    cancelled.current = false
    return () => {
      cancelled.current = true
    }
  }, [client, journeyId])

  useEffect(() => {
    if (!enabled || moments === undefined || running.current) return
    const todo = moments.filter(
      (m) => needsPlace(m) && !attempted.current.has(m.id),
    )
    if (todo.length === 0) return
    for (const m of todo) attempted.current.add(m.id)
    running.current = true
    const stopped = () => cancelled.current
    const run = async () => {
      setProgress({ done: 0, total: todo.length })
      try {
        await resolveMissingPlaces(
          todo,
          {
            cache: cache.current,
            onPlace: (momentId, place) => {
              putPlaceInCache(client, journeyId, place)
              client.setQueryData<Moment[]>(
                momentQueryKeys.journey(journeyId),
                (old) =>
                  old?.map((m) =>
                    m.id === momentId && m.placeId === null
                      ? { ...m, placeId: place.id }
                      : m,
                  ),
              )
            },
            onProgress: (done, total) => {
              if (!stopped()) setProgress({ done, total })
            },
            stopped,
          },
          { focusDayKey: focus.current },
        )
      } finally {
        running.current = false
        if (!stopped()) {
          setProgress(null)
          setRound((value) => value + 1)
        }
      }
    }
    void run()
  }, [client, enabled, journeyId, moments, round])

  return progress
}
