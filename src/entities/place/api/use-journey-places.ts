import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { listPlacesByIds } from '@/entities/place/api/place.repository'
import { placeQueryKeys } from '@/entities/place/api/place-query-keys'
import type { Place } from '@/entities/place/model/place'

export type PlaceMap = ReadonlyMap<string, Place>

const EMPTY: PlaceMap = new Map()

/**
 * Places for the given ids, kept in one per-journey map. Ids that show up
 * later (not in the map yet) are fetched once; the resolver job writes new
 * places into the same cache entry, so they never need a fetch.
 */
export function useJourneyPlaces(
  journeyId: string,
  placeIds: readonly string[],
): PlaceMap {
  const client = useQueryClient()
  const key = placeQueryKeys.journey(journeyId)
  const idsRef = useRef(placeIds)
  // Declared before useQuery so it runs first on mount.
  useEffect(() => {
    idsRef.current = placeIds
  }, [placeIds])
  const query = useQuery({
    queryFn: async (): Promise<PlaceMap> =>
      new Map(
        (await listPlacesByIds(idsRef.current)).map((place) => [
          place.id,
          place,
        ]),
      ),
    queryKey: key,
    staleTime: Number.POSITIVE_INFINITY,
  })
  const known = query.data
  const requested = useRef(new Set<string>())
  useEffect(() => {
    if (known === undefined) return
    const missing = placeIds.filter(
      (id) => !known.has(id) && !requested.current.has(id),
    )
    if (missing.length === 0) return
    for (const id of missing) requested.current.add(id)
    void listPlacesByIds(missing)
      .then((places) => {
        client.setQueryData<PlaceMap>(key, (old) => {
          const next = new Map(old ?? EMPTY)
          for (const place of places) next.set(place.id, place)
          return next
        })
      })
      .catch(() => undefined)
  }, [client, key, known, placeIds])
  return known ?? EMPTY
}

/** Adds a place to the journey's cached map (used by the resolver job). */
export function putPlaceInCache(
  client: ReturnType<typeof useQueryClient>,
  journeyId: string,
  place: Place,
): void {
  client.setQueryData<PlaceMap>(placeQueryKeys.journey(journeyId), (old) => {
    const next = new Map(old ?? EMPTY)
    next.set(place.id, place)
    return next
  })
}
