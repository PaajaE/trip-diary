// Reverse geocoding with the public OSM Nominatim API.
//
// Usage policy (https://operations.osmfoundation.org/policies/nominatim/):
// max 1 request/s for the whole app, identifying User-Agent, results must be
// cached, only end-user triggered use with a moderate number of users, and
// attribution "© OpenStreetMap contributors" (ODbL). The edge function
// enforces the rate and caching; this module is pure and dependency-free so it
// runs in Deno and is unit-tested from @trip-diary/core.

export const NOMINATIM_REVERSE_URL =
  'https://nominatim.openstreetmap.org/reverse'
export const NOMINATIM_USER_AGENT = 'TripDiary/0.1 (+https://cestovni-denik.cz)'
export const NOMINATIM_MIN_INTERVAL_MS = 1100
export const PLACE_GEOCODE_SOURCE = 'osm-nominatim'

export type NominatimLayer = 'address' | 'natural,poi'

export interface NominatimResult {
  address?: Record<string, string>
  addresstype?: string
  category?: string
  error?: string
  lat?: string
  lon?: string
  name?: string
  osm_id?: number
  osm_type?: string
  type?: string
}

export interface PlaceCandidate {
  countryCode: string | null
  latitude: number
  longitude: number
  name: string
  region: string | null
  /** Stable identity used to reuse places across journeys. */
  sourceRef: string
}

export interface ReverseQuery {
  latitude: number
  longitude: number
}

export function buildReverseUrl(
  query: ReverseQuery,
  layer: NominatimLayer,
  language = 'cs,en',
): string {
  const url = new URL(NOMINATIM_REVERSE_URL)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', query.latitude.toFixed(6))
  url.searchParams.set('lon', query.longitude.toFixed(6))
  url.searchParams.set('zoom', '14')
  url.searchParams.set('layer', layer)
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('accept-language', language)
  return url.toString()
}

/**
 * Cache key for a lookup: coordinates rounded to ~110 m, so photos of the
 * same spot never trigger a second request.
 */
export function lookupGridKey(query: ReverseQuery): string {
  return `${query.latitude.toFixed(3)},${query.longitude.toFixed(3)}`
}

const SETTLEMENT_RESULT_TYPES = new Set(['town', 'village', 'hamlet', 'city'])
const SETTLEMENT_PART_TYPES = new Set([
  'suburb',
  'neighbourhood',
  'quarter',
  'city_district',
  'borough',
  'isolated_dwelling',
])
// Administrative areas that OSM tags like cities but are not places people name.
const ADMIN_AREA_NAME =
  /^(area [a-z]\b|improvement district|regional district|municipal district|county of|division no|unorganized)/i
const FEATURE_CATEGORIES = new Set([
  'natural',
  'tourism',
  'leisure',
  'waterway',
  'historic',
  'amenity',
])

function regionOf(result: NominatimResult) {
  const countryCode = result.address?.country_code
  return {
    countryCode:
      countryCode !== undefined && /^[a-z]{2}$/i.test(countryCode)
        ? countryCode.toUpperCase()
        : null,
    region: result.address?.state ?? null,
  }
}

function coordinatesOf(result: NominatimResult): ReverseQuery | null {
  const latitude = Number(result.lat)
  const longitude = Number(result.lon)
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : null
}

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Settlement name from an `address`-layer result: the town or village, or for
 * a district of a city the city itself (so all of Calgary is one place).
 * Returns null for wilderness, where OSM only knows administrative areas.
 */
export function settlementFromAddressResult(
  result: NominatimResult,
): PlaceCandidate | null {
  const coordinates = coordinatesOf(result)
  if (coordinates === null || result.error !== undefined) {
    return null
  }
  const { countryCode, region } = regionOf(result)
  const name = result.name?.trim() ?? ''
  const addresstype = result.addresstype ?? ''

  const isSettlement =
    name !== '' &&
    !ADMIN_AREA_NAME.test(name) &&
    (result.category === 'place' || SETTLEMENT_RESULT_TYPES.has(addresstype))
  if (
    isSettlement &&
    result.osm_type !== undefined &&
    result.osm_id !== undefined
  ) {
    return {
      ...coordinates,
      countryCode,
      name,
      region,
      sourceRef: `osm:${result.osm_type}:${String(result.osm_id)}`,
    }
  }

  if (SETTLEMENT_PART_TYPES.has(addresstype)) {
    const address = result.address ?? {}
    const settlement =
      address.city ?? address.town ?? address.village ?? address.hamlet
    if (settlement !== undefined && !ADMIN_AREA_NAME.test(settlement)) {
      return {
        ...coordinates,
        countryCode,
        name: settlement,
        region,
        // Districts resolve to their settlement; identify it by name.
        sourceRef: `osm-settlement:${slug(countryCode ?? '')}:${slug(region ?? '')}:${slug(settlement)}`,
      }
    }
  }
  return null
}

function distanceKm(a: ReverseQuery, b: ReverseQuery): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLng / 2) ** 2
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Named natural feature or point of interest from a `natural,poi`-layer
 * result (peak, lake, valley, viewpoint…), if it is close enough to the photo.
 */
export function featureFromNaturalResult(
  result: NominatimResult,
  query: ReverseQuery,
  maxDistanceKm = 10,
): PlaceCandidate | null {
  const coordinates = coordinatesOf(result)
  const name = result.name?.trim() ?? ''
  if (
    coordinates === null ||
    result.error !== undefined ||
    name === '' ||
    result.osm_type === undefined ||
    result.osm_id === undefined ||
    !FEATURE_CATEGORIES.has(result.category ?? '') ||
    distanceKm(coordinates, query) > maxDistanceKm
  ) {
    return null
  }
  const { countryCode, region } = regionOf(result)
  return {
    ...coordinates,
    countryCode,
    name,
    region,
    sourceRef: `osm:${result.osm_type}:${String(result.osm_id)}`,
  }
}

/** Last resort so a moment still gets a meaningful label: the region. */
export function regionFallback(result: NominatimResult): PlaceCandidate | null {
  const coordinates = coordinatesOf(result)
  const { countryCode, region } = regionOf(result)
  if (coordinates === null || region === null) {
    return null
  }
  return {
    ...coordinates,
    countryCode,
    name: region,
    region,
    sourceRef: `osm-region:${slug(countryCode ?? '')}:${slug(region)}`,
  }
}
