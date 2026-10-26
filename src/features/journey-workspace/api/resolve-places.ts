import {
  planPlaceLookups,
  runLimited,
  type PlaceLookupOptions,
} from '@trip-diary/core/automation'
import { setMomentPlaceIfEmpty } from '@/entities/moment/api/moment.repository'
import type { Moment } from '@/entities/moment/model/moment'
import { resolvePlace } from '@/entities/place/api/place.repository'
import type { Place } from '@/entities/place/model/place'

/** Stop after this many failed lookups in a row (offline, quota, ...). */
export const MAX_CONSECUTIVE_FAILURES = 3
/**
 * Lookups in flight at once. The edge function does not throttle in code
 * (`claim_geocoder_slot` exists in SQL but resolve-place never calls it) and
 * every uncached lookup may cost two Geoapify requests, so the client stays
 * strictly sequential.
 */
export const PLACE_LOOKUP_CONCURRENCY = 1

export interface ResolvePlacesDeps {
  /** Client cell cache (grid key -> place or null); survives reruns. */
  cache: Map<string, Place | null>
  concurrency?: number
  /** Called when a stop got its place (cache updates). */
  onPlace?: (momentId: string, place: Place) => void
  onProgress?: (done: number, total: number) => void
  resolve?: typeof resolvePlace
  setPlace?: typeof setMomentPlaceIfEmpty
  stopped?: () => boolean
}

export interface ResolvePlacesResult {
  /** Moments a lookup was attempted for (do not retry them in a loop). */
  attempted: string[]
  /** True when the run gave up after repeated failures. */
  gaveUp: boolean
  named: number
}

/** Moments that have coordinates but no place yet. */
export function needsPlace(moment: Moment): boolean {
  return (
    moment.placeId === null &&
    moment.latitude !== null &&
    moment.longitude !== null
  )
}

/**
 * Names stops without a place: one lookup per grid cell (cached on the
 * client and on the server), cells of the visible day first, in batches,
 * never overriding an existing place. Resumable: a rerun only handles what
 * is still missing. Never throws.
 */
export async function resolveMissingPlaces(
  moments: readonly Moment[],
  deps: ResolvePlacesDeps,
  options: PlaceLookupOptions = {},
): Promise<ResolvePlacesResult> {
  const resolve = deps.resolve ?? resolvePlace
  const setPlace = deps.setPlace ?? setMomentPlaceIfEmpty
  const stopped = deps.stopped ?? (() => false)
  const missing = moments.filter(needsPlace)
  const batches = planPlaceLookups(
    missing.flatMap((moment) =>
      moment.latitude === null || moment.longitude === null
        ? []
        : [
            {
              id: moment.id,
              latitude: moment.latitude,
              longitude: moment.longitude,
              startsAt: moment.startsAt,
            },
          ],
    ),
    options,
  )
  const total = missing.length
  const attempted: string[] = []
  let done = 0
  let named = 0
  let failures = 0
  let gaveUp = false
  const halted = () => stopped() || gaveUp

  for (const batch of batches) {
    if (halted()) break
    const results = await runLimited(
      batch.map((cell) => async () => {
        const known = deps.cache.get(cell.key)
        if (known !== undefined) return known
        try {
          const place = await resolve(cell.latitude, cell.longitude)
          failures = 0
          deps.cache.set(cell.key, place)
          return place
        } catch (error) {
          // Counted here so that no further lookup starts after the limit.
          failures += 1
          if (failures >= MAX_CONSECUTIVE_FAILURES) gaveUp = true
          throw error
        }
      }),
      deps.concurrency ?? PLACE_LOOKUP_CONCURRENCY,
      halted,
    )
    for (const [index, cell] of batch.entries()) {
      const result = results[index] ?? null
      if (result === null) continue // not started (stopped)
      attempted.push(...cell.momentIds)
      if (!result.ok) {
        done += cell.momentIds.length
        deps.onProgress?.(done, total)
        continue
      }
      const place = result.value
      for (const momentId of cell.momentIds) {
        if (place !== null && !stopped()) {
          const saved = await setPlace(momentId, place.id).catch(() => false)
          if (saved) {
            named += 1
            deps.onPlace?.(momentId, place)
          }
        }
        done += 1
        deps.onProgress?.(done, total)
      }
    }
  }
  return { attempted, gaveUp, named }
}
