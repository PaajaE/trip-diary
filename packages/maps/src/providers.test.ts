import { describe, expect, it } from 'vitest'
import {
  buildStyleForProvider,
  getNextFallbackProvider,
  isMapyApiKeyConfigured,
  resolveMapStyle,
} from './providers.ts'

describe('map providers', () => {
  it('selects Mapy tourist maps by default when configured', () => {
    const resolved = resolveMapStyle({
      apiKey: 'test-map-key',
      language: 'cs',
    })

    expect(resolved.providerId).toBe('mapy-tourist')
    expect(resolved.reason).toBe('primary')
    expect(resolved.style.sources.basemap).toEqual({
      attribution: '© Seznam.cz a.s. a další',
      type: 'raster',
      url: 'https://api.mapy.com/v1/maptiles/outdoor/tiles.json?apikey=test-map-key&lang=cs',
    })
  })

  it('falls back to OSM when Mapy key is missing', () => {
    const resolved = resolveMapStyle({
      defaultProvider: 'mapy-tourist',
    })

    expect(resolved.providerId).toBe('osm')
    expect(resolved.reason).toBe('fallback-missing-key')
    expect(resolved.style.sources.osm).toBeDefined()
  })

  it('rejects invalid empty Mapy keys', () => {
    expect(isMapyApiKeyConfigured('   ')).toBe(false)
    expect(buildStyleForProvider('mapy-tourist', { apiKey: '   ' })).toBeNull()
  })

  it('returns the next fallback provider in order', () => {
    expect(
      getNextFallbackProvider('mapy-tourist', {
        fallbackOrder: ['mapy-tourist', 'osm'],
      }),
    ).toBe('osm')
  })

  it('still resolves OSM for invalid configuration', () => {
    const resolved = resolveMapStyle({
      apiKey: '',
      fallbackOrder: ['mapy-tourist'],
    })

    expect(resolved.providerId).toBe('osm')
    expect(resolved.reason).toBe('fallback-invalid-config')
  })
})
