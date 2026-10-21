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
/** Prominent (wikidata) peak, glacier or lake. */
export const PROMINENT_RADIUS_M = 8_000
/** "u <Settlement>" fallback radius. */
export const NEAR_SETTLEMENT_RADIUS_M = 40_000
export const NEAR_SOURCE_SUFFIX = ':near'

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

/** Request 2 (only when no settlement qualified), radius 8 km: nature and attractions. */
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
    NEAR_SETTLEMENT_RADIUS_M,
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
    PROMINENT_RADIUS_M,
    60,
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

function clean(value: unknown): string | null {
  const name = text(value)?.replace(/\s+/g, ' ').trim()
  return name === undefined || name === '' ? null : name
}

/** True when the name has a letter outside the Latin script (CJK, Cyrillic, ...). */
export function hasNonLatinLetters(name: string): boolean {
  return /[\p{L}]/u.test(name.replace(/[\p{Script=Latin}\P{L}]/gu, ''))
}

/**
 * name:cs, then name:en, then the localised/OSM name. Candidates with
 * non-Latin letters are skipped; null when only such names exist.
 */
function featureName(properties: NonNullable<GeoapifyFeature['properties']>) {
  const raw = properties.datasource?.raw ?? {}
  for (const candidate of [
    raw['name:cs'],
    raw['name:en'],
    properties.name,
    raw['name'],
  ]) {
    const name = clean(candidate)
    if (name !== null && !hasNonLatinLetters(name)) {
      return name
    }
  }
  return null
}

function hasWikidata(properties: NonNullable<GeoapifyFeature['properties']>) {
  return text(properties.datasource?.raw?.['wikidata']) !== null
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

function isNearSettlement(categories: string[]): boolean {
  return ['city', 'town', 'village'].some((kind) =>
    categories.includes(`populated_place.${kind}`),
  )
}

function isNatural(categories: string[]): boolean {
  return categories.some(
    (c) =>
      c === 'natural.mountain.peak' ||
      c === 'natural.mountain.glacier' ||
      c === 'natural.water' ||
      c.startsWith('natural.water.'),
  )
}

function isProminentKind(categories: string[]): boolean {
  return categories.some(
    (c) =>
      c === 'natural.mountain.peak' ||
      c === 'natural.mountain.glacier' ||
      c === 'natural.water',
  )
}

/** Viewpoints, waterfalls and wikidata attractions; never art or memorials. */
function isWorthyAttraction(
  categories: string[],
  properties: NonNullable<GeoapifyFeature['properties']>,
): boolean {
  if (!categories.some((c) => c.startsWith('tourism.attraction'))) {
    return false
  }
  if (
    categories.some((c) =>
      /^tourism\.(attraction\.(artwork|memorial)|sights)/.test(c),
    )
  ) {
    return false
  }
  const raw = properties.datasource?.raw ?? {}
  if (raw['tourism'] === 'artwork') {
    return false
  }
  return (
    categories.includes('tourism.attraction.viewpoint') ||
    raw['waterway'] === 'waterfall' ||
    hasWikidata(properties)
  )
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

type Tier = 'settlement' | 'natural' | 'attraction' | 'prominent' | 'near'

/**
 * Picks the name for a position. Tiers, first non-empty wins:
 *  a. settlement: city/town within 15 km, village 8 km, hamlet 4 km. Within
 *     the tier the lowest distance/radius wins;
 *  b. natural feature (peak, glacier, water) within 2.5 km, nearest;
 *  c. viewpoint, waterfall or wikidata attraction within 1.5 km, nearest
 *     (artworks, memorials and plain "sights" never);
 *  d. prominent natural feature (peak, glacier, lake with wikidata) within 8 km;
 *  e. nearest city/town/village within 40 km, named "u <Settlement>" with a
 *     sourceRef ending in ":near".
 * Unnamed and non-Latin-only features are skipped. Null when nothing qualifies.
 */
export function pickNearbyPlace(
  features: unknown,
  query: ReverseQuery,
): PlaceCandidate | null {
  if (!Array.isArray(features)) {
    return null
  }
  const tiers: Record<Tier, Scored[]> = {
    attraction: [],
    natural: [],
    near: [],
    prominent: [],
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
    const iso = text(properties.country_code)
    const base = {
      countryCode:
        iso !== null && /^[a-z]{2}$/i.test(iso) ? iso.toUpperCase() : null,
      latitude: lat,
      longitude: lon,
      region: text(properties.state)?.slice(0, 200) ?? null,
    }
    const add = (
      tier: Tier,
      radius: number,
      label = name,
      ref = sourceRef,
    ): void => {
      tiers[tier].push({
        candidate: {
          ...base,
          name: label.slice(0, 200),
          sourceRef: ref.slice(0, 200),
        },
        distance,
        score: distance / radius,
      })
    }

    const settlement = settlementRadius(categories)
    if (settlement !== null) {
      if (distance <= settlement) {
        add('settlement', settlement)
      }
      if (
        distance <= NEAR_SETTLEMENT_RADIUS_M &&
        isNearSettlement(categories)
      ) {
        add(
          'near',
          NEAR_SETTLEMENT_RADIUS_M,
          `u ${name}`,
          sourceRef + NEAR_SOURCE_SUFFIX,
        )
      }
      continue
    }
    if (isNatural(categories) && distance <= NATURAL_RADIUS_M) {
      add('natural', NATURAL_RADIUS_M)
    } else if (
      isWorthyAttraction(categories, properties) &&
      distance <= ATTRACTION_RADIUS_M
    ) {
      add('attraction', ATTRACTION_RADIUS_M)
    } else if (
      isProminentKind(categories) &&
      hasWikidata(properties) &&
      distance <= PROMINENT_RADIUS_M
    ) {
      add('prominent', PROMINENT_RADIUS_M)
    }
  }

  const byScore = (a: Scored, b: Scored) =>
    a.score - b.score || a.distance - b.distance
  const byDistance = (a: Scored, b: Scored) => a.distance - b.distance
  return (
    tiers.settlement.sort(byScore)[0]?.candidate ??
    tiers.natural.sort(byDistance)[0]?.candidate ??
    tiers.attraction.sort(byDistance)[0]?.candidate ??
    tiers.prominent.sort(byDistance)[0]?.candidate ??
    tiers.near.sort(byDistance)[0]?.candidate ??
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
