// Place names from Geoapify Places (https://apidocs.geoapify.com/docs/places/),
// OpenStreetMap data (c) OpenStreetMap contributors. Used by resolve-place
// before the Mapy.com administrative fallback, because administrative units
// are useless in the wilderness ("Britska Kolumbie", "Electoral Area D").
// Pure and dependency-free so it runs in Deno and is unit-tested from
// @trip-diary/core. Never log the URLs: they carry the API key.

import type { PlaceCandidate, ReverseQuery } from './mapy.ts'

export const GEOAPIFY_PLACES_URL = 'https://api.geoapify.com/v2/places'
export const GEOAPIFY_GEOCODE_SOURCE = 'geoapify'

/** Settlement search radius (m), by kind of settlement. */
export const SETTLEMENT_RADIUS_M = {
  city: 15_000,
  hamlet: 4_000,
  town: 15_000,
  village: 8_000,
} as const
export const NATURAL_RADIUS_M = 2_500
export const ATTRACTION_RADIUS_M = 1_500

/**
 * Request 1: settlements only. Suburbs and neighbourhoods are deliberately
 * left out (a photo in Calgary must read "Calgary", not "Beltline") and so
 * is the noisy unpopulated_locality. A separate request keeps dense
 * attractions (murals, artworks) from pushing the city node out of the limit.
 */
export const SETTLEMENT_CATEGORIES = [
  'populated_place.city',
  'populated_place.town',
  'populated_place.village',
  'populated_place.hamlet',
] as const

/** Request 2 (only when no settlement qualified): nature and attractions. */
export const NEARBY_CATEGORIES = [
  'natural.mountain.peak',
  'natural.mountain.glacier',
  'natural.water',
  'tourism.attraction',
] as const

function placesUrl(
  categories: readonly string[],
  radiusM: number,
  limit: number,
  query: ReverseQuery,
  apiKey: string,
  language: string,
): string {
  const lon = query.longitude.toFixed(6)
  const lat = query.latitude.toFixed(6)
  const url = new URL(GEOAPIFY_PLACES_URL)
  url.searchParams.set('categories', categories.join(','))
  url.searchParams.set('filter', `circle:${lon},${lat},${String(radiusM)}`)
  url.searchParams.set('bias', `proximity:${lon},${lat}`)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('lang', language)
  url.searchParams.set('apiKey', apiKey)
  return url.toString()
}

export function buildSettlementsUrl(
  query: ReverseQuery,
  apiKey: string,
  language = 'cs',
): string {
  return placesUrl(
    SETTLEMENT_CATEGORIES,
    SETTLEMENT_RADIUS_M.city,
    50,
    query,
    apiKey,
    language,
  )
}

export function buildNearbyUrl(
  query: ReverseQuery,
  apiKey: string,
  language = 'cs',
): string {
  return placesUrl(
    NEARBY_CATEGORIES,
    NATURAL_RADIUS_M,
    40,
    query,
    apiKey,
    language,
  )
}

export interface GeoapifyFeature {
  properties?: {
    categories?: string[]
    country_code?: string
    datasource?: { raw?: Record<string, unknown> }
    distance?: number
    lat?: number
    lon?: number
    name?: string
    place_id?: string
    state?: string
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/** name:cs, then the localised name, then the OSM name, then name:en. */
function featureName(properties: NonNullable<GeoapifyFeature['properties']>) {
  const raw = properties.datasource?.raw ?? {}
  return (
    text(raw['name:cs']) ??
    text(properties.name) ??
    text(raw['name']) ??
    text(raw['name:en'])
  )
}

function haversineM(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const rad = Math.PI / 180
  const dLat = (bLat - aLat) * rad
  const dLon = (bLon - aLon) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)))
}

interface Scored {
  candidate: PlaceCandidate
  /** Tier-relative distance, 0 (here) to 1 (edge of the tier radius). */
  score: number
  distance: number
}

function settlementRadius(categories: string[]): number | null {
  for (const kind of ['city', 'town', 'village', 'hamlet'] as const) {
    if (categories.includes(`populated_place.${kind}`)) {
      return SETTLEMENT_RADIUS_M[kind]
    }
  }
  return null
}

function naturalOrAttractionRadius(categories: string[]): {
  radius: number
  tier: 'natural' | 'attraction'
} | null {
  if (
    categories.some(
      (c) =>
        c === 'natural.mountain.peak' ||
        c === 'natural.mountain.glacier' ||
        c === 'natural.water' ||
        c.startsWith('natural.water.'),
    )
  ) {
    return { radius: NATURAL_RADIUS_M, tier: 'natural' }
  }
  if (
    categories.some(
      (c) => c === 'tourism.attraction' || c === 'tourism.attraction.viewpoint',
    ) &&
    !categories.some((c) => c.startsWith('tourism.attraction.artwork'))
  ) {
    return { radius: ATTRACTION_RADIUS_M, tier: 'attraction' }
  }
  return null
}

function sourceRefOf(properties: NonNullable<GeoapifyFeature['properties']>) {
  const raw = properties.datasource?.raw ?? {}
  const type = text(raw['osm_type'])
  const id = raw['osm_id']
  if (type !== null && (typeof id === 'number' || typeof id === 'string')) {
    return `geoapify:${type}${String(id)}`.slice(0, 200)
  }
  const placeId = text(properties.place_id)
  return placeId === null ? null : `geoapify:${placeId}`.slice(0, 200)
}

/**
 * Picks the name for a position. Tiers, first non-empty wins:
 *  a. settlement: city/town within 15 km, village 8 km, hamlet 4 km. Within
 *     the tier the lowest distance/radius wins, so a hamlet 900 m away beats
 *     a town 10 km away but a town 3 km away beats a hamlet 1 km away;
 *  b. natural feature (peak, glacier, water) within 2.5 km, nearest;
 *  c. tourism attraction / viewpoint (never artwork) within 1.5 km, nearest.
 * Unnamed features are skipped. Returns null when nothing qualifies.
 */
export function pickNearbyPlace(
  features: unknown,
  query: ReverseQuery,
): PlaceCandidate | null {
  if (!Array.isArray(features)) {
    return null
  }
  const tiers: Record<'settlement' | 'natural' | 'attraction', Scored[]> = {
    attraction: [],
    natural: [],
    settlement: [],
  }
  for (const feature of features as unknown[]) {
    const properties = (feature as GeoapifyFeature | null)?.properties
    if (typeof properties !== 'object' || properties === null) {
      continue
    }
    const categories = Array.isArray(properties.categories)
      ? properties.categories.filter((c) => typeof c === 'string')
      : []
    const lat = properties.lat
    const lon = properties.lon
    const name = featureName(properties)
    const sourceRef = sourceRefOf(properties)
    if (
      name === null ||
      sourceRef === null ||
      typeof lat !== 'number' ||
      typeof lon !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      continue
    }
    const distance =
      typeof properties.distance === 'number'
        ? properties.distance
        : haversineM(query.latitude, query.longitude, lat, lon)

    const settlement = settlementRadius(categories)
    const other =
      settlement === null ? naturalOrAttractionRadius(categories) : null
    const radius = settlement ?? other?.radius ?? null
    if (radius === null || distance > radius) {
      continue
    }
    const iso = text(properties.country_code)
    tiers[
      settlement !== null ? 'settlement' : (other?.tier ?? 'attraction')
    ].push({
      candidate: {
        countryCode:
          iso !== null && /^[a-z]{2}$/i.test(iso) ? iso.toUpperCase() : null,
        latitude: lat,
        longitude: lon,
        name: name.slice(0, 200),
        region: text(properties.state)?.slice(0, 200) ?? null,
        sourceRef,
      },
      distance,
      score: distance / radius,
    })
  }

  const byScore = (a: Scored, b: Scored) =>
    a.score - b.score || a.distance - b.distance
  const byDistance = (a: Scored, b: Scored) => a.distance - b.distance
  return (
    tiers.settlement.sort(byScore)[0]?.candidate ??
    tiers.natural.sort(byDistance)[0]?.candidate ??
    tiers.attraction.sort(byDistance)[0]?.candidate ??
    null
  )
}

/** Features array of a Geoapify GeoJSON response (empty when malformed). */
export function featuresOf(result: unknown): unknown[] {
  if (typeof result !== 'object' || result === null) {
    return []
  }
  const features = (result as { features?: unknown }).features
  return Array.isArray(features) ? features : []
}
