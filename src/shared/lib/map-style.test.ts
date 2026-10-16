import { afterEach, describe, expect, it, vi } from 'vitest'

const { publicEnvMock } = vi.hoisted(() => ({
  publicEnvMock: {
    mapyApiKey: undefined as string | undefined,
  },
}))

vi.mock('@/shared/config/env', () => ({
  publicEnv: publicEnvMock,
}))

describe('map-style', () => {
  afterEach(() => {
    publicEnvMock.mapyApiKey = undefined
    vi.resetModules()
  })

  it('uses Mapy.com tourist tiles when an API key is configured', async () => {
    publicEnvMock.mapyApiKey = 'test-map-key'

    const { getAppMapStyle, getResolvedAppMapStyle, isMapyBasemapEnabled } =
      await import('@/shared/lib/map-style')

    expect(isMapyBasemapEnabled()).toBe(true)
    expect(getResolvedAppMapStyle('cs').providerId).toBe('mapy-tourist')
    expect(getAppMapStyle('cs')).toEqual({
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      layers: [{ id: 'basemap', source: 'basemap', type: 'raster' }],
      sources: {
        basemap: {
          attribution:
            '<a href="https://api.mapy.com/copyright" target="_blank">&copy; Seznam.cz a.s. a další</a>',
          maxzoom: 19,
          tiles: [
            'https://api.mapy.com/v1/maptiles/outdoor/256/{z}/{x}/{y}?lang=cs&apikey=test-map-key',
          ],
          type: 'raster',
        },
      },
      version: 8,
    })
  })

  it('falls back to OpenStreetMap tiles without an API key', async () => {
    publicEnvMock.mapyApiKey = undefined

    const { getAppMapStyle, getResolvedAppMapStyle, isMapyBasemapEnabled } =
      await import('@/shared/lib/map-style')

    expect(isMapyBasemapEnabled()).toBe(false)
    expect(getResolvedAppMapStyle().providerId).toBe('osm')
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
