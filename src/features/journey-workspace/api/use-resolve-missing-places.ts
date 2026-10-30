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

interface Session {
  attempted: Set<string>
  cancelled: boolean
  running: boolean
}

export interface PlaceResolveProgress {
  done: number
  total: number
}

/**
 * Background job: gives moments that have coordinates but no place a place
 * name (`resolveMissingPlaces`: one lookup per ~110 m cell (the server cache key), visible day first, paced,
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
  const cache = useRef(new Map<string, Place | null>())
  const focus = useRef(focusDayKey)
  // A run that ends after the component is gone must not touch its state
  // (in tests the DOM is already torn down by then).
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    focus.current = focusDayKey
  }, [focusDayKey])
  /**
   * One session per journey while enabled: its own cancel flag, attempted
   * set and running flag. Switching the journey or disabling cancels the old
   * session's run; a moments update (a place just saved) does not.
   */
  const session = useRef<Session | null>(null)
  useEffect(() => {
    if (!enabled) return
    const current: Session = {
      attempted: new Set(),
      cancelled: false,
      running: false,
    }
    session.current = current
    return () => {
      current.cancelled = true
      if (session.current === current) session.current = null
    }
  }, [client, enabled, journeyId])

  useEffect(() => {
    const current = session.current
    if (!enabled || moments === undefined || current === null) return
    if (current.running || current.cancelled) return
    const todo = moments.filter(
      (m) => needsPlace(m) && !current.attempted.has(m.id),
    )
    if (todo.length === 0) return
    for (const m of todo) current.attempted.add(m.id)
    current.running = true
    const stopped = () => current.cancelled
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
        current.running = false
        if (mounted.current) {
          // A cancelled run leaves the progress to a session that follows;
          // without one (disabled) the progress is cleared.
          if (!stopped() || session.current === null) setProgress(null)
          if (!stopped()) setRound((value) => value + 1)
        }
      }
    }
    void run()
  }, [client, enabled, journeyId, moments, round])

  return progress
}
