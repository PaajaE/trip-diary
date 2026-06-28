import type { StyleSpecification } from 'maplibre-gl'

const MAPY_OUTDOOR_TILEJSON =
  'https://api.mapy.com/v1/maptiles/outdoor/tiles.json'

export function isMapyBasemapEnabled(): boolean {
  const apiKey = import.meta.env.VITE_MAPY_API_KEY
  return typeof apiKey === 'string' && apiKey.trim().length > 0
}

export function getAppMapStyle(language?: string): StyleSpecification {
  const apiKey = import.meta.env.VITE_MAPY_API_KEY?.trim()
  if (apiKey !== undefined && apiKey.length > 0) {
    const params = new URLSearchParams({ apikey: apiKey })
    if (language !== undefined && language.length > 0) {
      params.set('lang', language)
    }

    return {
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      layers: [{ id: 'basemap', source: 'basemap', type: 'raster' }],
      sources: {
        basemap: {
          type: 'raster',
          url: `${MAPY_OUTDOOR_TILEJSON}?${params.toString()}`,
        },
      },
      version: 8,
    }
  }

  return {
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    layers: [{ id: 'osm', source: 'osm', type: 'raster' }],
    sources: {
      osm: {
        attribution: '© OpenStreetMap contributors',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        type: 'raster',
      },
    },
    version: 8,
  }
}
