import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { momentQueryKeys } from '@/entities/moment/api/moment-query-keys'
import { setMomentPlaceIfEmpty } from '@/entities/moment/api/moment.repository'
import type { Moment } from '@/entities/moment/model/moment'
import { putPlaceInCache } from '@/entities/place/api/use-journey-places'
import { resolvePlace } from '@/entities/place/api/place.repository'

export interface PlaceResolveProgress {
  done: number
  total: number
}

/** Stop the job after this many failures in a row (offline, quota, ...). */
const MAX_CONSECUTIVE_FAILURES = 3

function needsPlace(moment: Moment): boolean {
  return (
    moment.placeId === null &&
    moment.latitude !== null &&
    moment.longitude !== null
  )
}

/**
 * Background job: gives moments that have coordinates but no place a place
 * name. Strictly sequential (the server allows one geocoder request per
 * second), skips a moment after a failure instead of retrying, never
 * overrides an existing place, and stops when the component unmounts. Runs
 * once per mount when `enabled` turns true.
 */
export function useResolveMissingPlaces(
  journeyId: string,
  moments: readonly Moment[] | undefined,
  enabled: boolean,
): PlaceResolveProgress | null {
  const client = useQueryClient()
  const [progress, setProgress] = useState<PlaceResolveProgress | null>(null)
  const latest = useRef(moments)
  useEffect(() => {
    latest.current = moments
  }, [moments])
  const ready = enabled && moments !== undefined

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    const stopped = () => cancelled
    const attempted = new Set<string>()
    const run = async () => {
      const total = (latest.current ?? []).filter(needsPlace).length
      if (total === 0) return
      let done = 0
      let failures = 0
      setProgress({ done, total })
      for (;;) {
        const next = (latest.current ?? []).find(
          (m) => needsPlace(m) && !attempted.has(m.id),
        )
        if (next === undefined || stopped()) break
        attempted.add(next.id)
        try {
          if (next.latitude === null || next.longitude === null) continue
          const place = await resolvePlace(next.latitude, next.longitude)
          if (stopped()) break
          failures = 0
          if (place !== null) {
            putPlaceInCache(client, journeyId, place)
            const saved = await setMomentPlaceIfEmpty(next.id, place.id)
            if (stopped()) break
            if (saved) {
              client.setQueryData<Moment[]>(
                momentQueryKeys.journey(journeyId),
                (old) =>
                  old?.map((m) =>
                    m.id === next.id && m.placeId === null
                      ? { ...m, placeId: place.id }
                      : m,
                  ),
              )
            }
          }
        } catch {
          failures += 1
          if (failures >= MAX_CONSECUTIVE_FAILURES) break
        }
        done += 1
        if (!stopped()) setProgress({ done, total: Math.max(total, done) })
      }
      if (!stopped()) setProgress(null)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [client, journeyId, ready])

  return progress
}
