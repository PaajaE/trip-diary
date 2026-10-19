import {
  type Place,
  PlaceError,
  placeSchema,
  resolvePlaceResponseSchema,
} from '@/entities/place/model/place'
import { getSupabaseClient } from '@/shared/api/supabase'

const CHUNK = 100

/** Reads places by id (ids per request are chunked to keep URLs short). */
export async function listPlacesByIds(
  ids: readonly string[],
): Promise<Place[]> {
  const unique = [...new Set(ids)]
  const out: Place[] = []
  for (let i = 0; i < unique.length; i += CHUNK) {
    const { data, error } = await getSupabaseClient()
      .from('places')
      .select('id, name, country_code, region, latitude, longitude')
      .in('id', unique.slice(i, i + CHUNK))
    if (error !== null) {
      throw new PlaceError('list_failed', error.message, error)
    }
    for (const row of data) {
      const parsed = placeSchema.safeParse({
        countryCode: row.country_code,
        id: row.id,
        latitude: row.latitude,
        longitude: row.longitude,
        name: row.name,
        region: row.region,
      })
      if (parsed.success) out.push(parsed.data)
    }
  }
  return out
}

/**
 * Asks the resolve-place edge function for the place at a position. The
 * server allows one geocoder request per second app-wide, so callers must
 * not run this in parallel. Returns null when no place was found.
 */
export async function resolvePlace(
  latitude: number,
  longitude: number,
): Promise<Place | null> {
  const result = await getSupabaseClient().functions.invoke('resolve-place', {
    body: { latitude, longitude },
  })
  if (result.error !== null) {
    throw new PlaceError('resolve_failed', undefined, result.error)
  }
  const parsed = resolvePlaceResponseSchema.safeParse(result.data)
  if (!parsed.success) {
    throw new PlaceError('invalid_response', parsed.error.message, parsed.error)
  }
  return parsed.data.place
}
