// Reverse geocoding with the Mapy.com REST API (https://api.mapy.cz/v1/rgeocode).
//
// Replaces OSM Nominatim, which blocks the shared cloud egress of Supabase
// edge functions (HTTP 403). Data and names © Seznam.cz a.s. and partners;
// attribution "Mapy.com" is shown wherever names appear. Pure and
// dependency-free so it runs in Deno and is unit-tested from @trip-diary/core.

export const MAPY_RGEOCODE_URL = 'https://api.mapy.cz/v1/rgeocode'
export const PLACE_GEOCODE_SOURCE = 'mapy-com'

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

export interface MapyRegionalEntry {
  isoCode?: string
  name?: string
  type?: string
}

export interface MapyItem {
  name?: string
  position?: { lat?: number; lon?: number }
  regionalStructure?: MapyRegionalEntry[]
  type?: string
}

export interface MapyResult {
  items?: MapyItem[]
}

/** Never log this URL: it carries the API key. */
export function buildReverseUrl(
  query: ReverseQuery,
  apiKey: string,
  language = 'cs',
): string {
  const url = new URL(MAPY_RGEOCODE_URL)
  url.searchParams.set('lon', query.longitude.toFixed(6))
  url.searchParams.set('lat', query.latitude.toFixed(6))
  url.searchParams.set('lang', language)
  url.searchParams.set('apikey', apiKey)
  return url.toString()
}

/**
 * Cache key for a lookup: coordinates rounded to ~110 m, so photos of the
 * same spot never trigger a second request.
 */
export function lookupGridKey(query: ReverseQuery): string {
  return `${query.latitude.toFixed(3)},${query.longitude.toFixed(3)}`
}

// Administrative placeholders that are not places people name.
const ADMIN_AREA_NAME =
  /^(improvement district|area [a-z]\b|municipal district|county of|unorganized|special area|electoral area)|\bno\.\s*\d/i
const GENERIC_PREFIX = /^(provincie|teritorium|kraj|stát|okres)\s+/i

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function cleanName(value: string | undefined): string | null {
  const name = typeof value === 'string' ? value.trim() : ''
  return name === '' ? null : name
}

function stripGeneric(value: string | undefined): string | null {
  const name = cleanName(value)
  return name === null ? null : cleanName(name.replace(GENERIC_PREFIX, ''))
}

function entryOf(
  structure: MapyRegionalEntry[],
  type: string,
): MapyRegionalEntry | undefined {
  return structure.find((entry) => entry.type === type)
}

/**
 * Picks the place to label a position: the municipality when it is a real
 * settlement, otherwise (wilderness, administrative areas) the region, then
 * the country. Returns null when the response has nothing usable.
 */
export function placeFromMapyResult(
  result: unknown,
  query: ReverseQuery,
): PlaceCandidate | null {
  if (typeof result !== 'object' || result === null) {
    return null
  }
  const items = (result as MapyResult).items
  if (!Array.isArray(items)) {
    return null
  }
  const item = items.find(
    (candidate): candidate is MapyItem =>
      typeof candidate === 'object' &&
      candidate !== null &&
      Array.isArray(candidate.regionalStructure),
  )
  const structure = (item?.regionalStructure ?? []).filter(
    (entry) => typeof entry === 'object' && entry !== null,
  )
  if (item === undefined || structure.length === 0) {
    return null
  }

  const municipality = cleanName(
    entryOf(structure, 'regional.municipality')?.name,
  )
  const region = stripGeneric(entryOf(structure, 'regional.region')?.name)
  const country = entryOf(structure, 'regional.country')
  const iso = country?.isoCode
  const countryCode =
    typeof iso === 'string' && /^[a-z]{2}$/i.test(iso)
      ? iso.toUpperCase()
      : null

  let name: string | null
  let kind: string
  if (municipality !== null && !ADMIN_AREA_NAME.test(municipality)) {
    name = municipality
    kind = 'municipality'
  } else if (region !== null) {
    name = region
    kind = 'region'
  } else {
    name = cleanName(country?.name)
    kind = 'country'
  }
  if (name === null) {
    return null
  }

  const lat = item.position?.lat
  const lon = item.position?.lon
  // Only a real settlement is anchored at the item position; for regions the
  // item is an administrative area, so keep the queried point.
  const hasPosition =
    kind === 'municipality' &&
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon)

  return {
    countryCode,
    latitude: hasPosition ? lat : query.latitude,
    longitude: hasPosition ? lon : query.longitude,
    name,
    region,
    sourceRef:
      `mapy:${kind}:${slug(name)}:${slug(region ?? '')}:${countryCode ?? ''}`.slice(
        0,
        200,
      ),
  }
}
