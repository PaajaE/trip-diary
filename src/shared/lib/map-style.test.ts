import { afterEach, describe, expect, it, vi } from 'vitest'

const { publicEnvMock } = vi.hoisted(() => ({
  publicEnvMock: {
    VITE_MAPY_API_KEY: undefined as string | undefined,
  },
}))

vi.mock('@/shared/config/env', () => ({
  publicEnv: publicEnvMock,
}))

describe('map-style', () => {
  afterEach(() => {
    publicEnvMock.VITE_MAPY_API_KEY = undefined
    vi.resetModules()
  })

  it('uses Mapy.com outdoor tiles when an API key is configured', async () => {
    publicEnvMock.VITE_MAPY_API_KEY = 'test-map-key'

    const { getAppMapStyle, isMapyBasemapEnabled } =
      await import('@/shared/lib/map-style')

    expect(isMapyBasemapEnabled()).toBe(true)
    expect(getAppMapStyle('cs')).toEqual({
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      layers: [{ id: 'basemap', source: 'basemap', type: 'raster' }],
      sources: {
        basemap: {
          type: 'raster',
          url: 'https://api.mapy.com/v1/maptiles/outdoor/tiles.json?apikey=test-map-key&lang=cs',
        },
      },
      version: 8,
    })
  })

  it('falls back to OpenStreetMap tiles without an API key', async () => {
    publicEnvMock.VITE_MAPY_API_KEY = undefined

    const { getAppMapStyle, isMapyBasemapEnabled } =
      await import('@/shared/lib/map-style')

    expect(isMapyBasemapEnabled()).toBe(false)
    expect(getAppMapStyle()).toEqual({
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
    })
  })
})
