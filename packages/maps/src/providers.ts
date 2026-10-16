import type { StyleSpecification } from 'maplibre-gl'

export const MAP_PROVIDER_IDS = ['mapy-tourist', 'mapy-outdoor', 'osm'] as const

export type MapProviderId = (typeof MAP_PROVIDER_IDS)[number]

export type MapResolutionReason =
  | 'primary'
  | 'fallback-missing-key'
  | 'fallback-invalid-config'
  | 'fallback-runtime'

export interface MapProviderConfig {
  apiKey?: string | undefined
  defaultProvider?: MapProviderId | undefined
  fallbackOrder?: MapProviderId[] | undefined
  language?: string | undefined
}

export interface ResolvedMapStyle {
  attribution: string
  providerId: MapProviderId
  reason: MapResolutionReason
  style: StyleSpecification
}

export const DEFAULT_MAP_PROVIDER: MapProviderId = 'mapy-tourist'

export const DEFAULT_FALLBACK_ORDER: MapProviderId[] = ['mapy-tourist', 'osm']

// Mapy "Tourist Map" product uses mapset id `outdoor` (there is no `tourist` mapset).
// The tile template is what `.../outdoor/tiles.json` returns (maxzoom 19,
// 256 px PNG). It is used directly: fetching tiles.json first cost one extra
// round trip (DNS/TLS to api.mapy.com) before the first tile could be requested.
const MAPY_TOURIST_TILES = 'https://api.mapy.com/v1/maptiles/outdoor/256'

const MAPY_OUTDOOR_TILES = 'https://api.mapy.com/v1/maptiles/outdoor/256'

const MAPY_ATTRIBUTION = '© Seznam.cz a.s. a další'

// Same markup tiles.json delivers (the licence requires the link).
const MAPY_SOURCE_ATTRIBUTION =
  '<a href="https://api.mapy.com/copyright" target="_blank">&copy; Seznam.cz a.s. a další</a>'

const OSM_ATTRIBUTION = '© OpenStreetMap contributors'

const GLYPHS_URL = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf'

function buildMapyStyle(
  providerId: 'mapy-tourist' | 'mapy-outdoor',
  apiKey: string,
  language?: string,
): StyleSpecification {
  const tiles =
    providerId === 'mapy-tourist' ? MAPY_TOURIST_TILES : MAPY_OUTDOOR_TILES
  const params = new URLSearchParams()
  if (language !== undefined && language.length > 0) {
    params.set('lang', language)
  }
  params.set('apikey', apiKey)

  return {
    glyphs: GLYPHS_URL,
    layers: [{ id: 'basemap', source: 'basemap', type: 'raster' }],
    sources: {
      basemap: {
        attribution: MAPY_SOURCE_ATTRIBUTION,
        maxzoom: 19,
        tiles: [`${tiles}/{z}/{x}/{y}?${params.toString()}`],
        type: 'raster',
      },
    },
    version: 8,
  }
}

function buildOsmStyle(): StyleSpecification {
  return {
    glyphs: GLYPHS_URL,
    layers: [{ id: 'osm', source: 'osm', type: 'raster' }],
    sources: {
      osm: {
        attribution: OSM_ATTRIBUTION,
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        type: 'raster',
      },
    },
    version: 8,
  }
}

function isMapyProvider(
  providerId: MapProviderId,
): providerId is 'mapy-tourist' | 'mapy-outdoor' {
  return providerId === 'mapy-tourist' || providerId === 'mapy-outdoor'
}

export function isMapyApiKeyConfigured(apiKey?: string): boolean {
  return apiKey !== undefined && apiKey.trim().length > 0
}

export function buildStyleForProvider(
  providerId: MapProviderId,
  config: MapProviderConfig,
): ResolvedMapStyle | null {
  const apiKey = config.apiKey?.trim()

  if (isMapyProvider(providerId)) {
    if (!isMapyApiKeyConfigured(apiKey)) {
      return null
    }

    return {
      attribution: MAPY_ATTRIBUTION,
      providerId,
      reason: 'primary',
      style: buildMapyStyle(providerId, apiKey ?? '', config.language),
    }
  }

  return {
    attribution: OSM_ATTRIBUTION,
    providerId: 'osm',
    reason: 'primary',
    style: buildOsmStyle(),
  }
}

export function resolveMapStyle(
  config: MapProviderConfig = {},
): ResolvedMapStyle {
  const fallbackOrder = config.fallbackOrder ?? DEFAULT_FALLBACK_ORDER
  const preferred =
    config.defaultProvider ?? fallbackOrder[0] ?? DEFAULT_MAP_PROVIDER

  const orderedProviders = [
    preferred,
    ...fallbackOrder.filter((providerId) => providerId !== preferred),
  ]

  let lastFailureReason: MapResolutionReason | null = null

  for (const providerId of orderedProviders) {
    if (isMapyProvider(providerId) && !isMapyApiKeyConfigured(config.apiKey)) {
      lastFailureReason = 'fallback-missing-key'
      continue
    }

    const resolved = buildStyleForProvider(providerId, config)
    if (resolved !== null) {
      return {
        ...resolved,
        reason: lastFailureReason ?? resolved.reason,
      }
    }
  }

  return {
    attribution: OSM_ATTRIBUTION,
    providerId: 'osm',
    reason: 'fallback-invalid-config',
    style: buildOsmStyle(),
  }
}

export function getNextFallbackProvider(
  currentProviderId: MapProviderId,
  config: MapProviderConfig = {},
): MapProviderId | null {
  const fallbackOrder = config.fallbackOrder ?? DEFAULT_FALLBACK_ORDER
  const currentIndex = fallbackOrder.indexOf(currentProviderId)
  if (currentIndex === -1) {
    return fallbackOrder[0] ?? null
  }

  return fallbackOrder[currentIndex + 1] ?? null
}
