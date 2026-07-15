import { describe, expect, it } from 'vitest'
import { resolveMapStyle } from '@trip-diary/maps'
import { readExpoPublicEnv } from '../env'

describe('mobile map wiring', () => {
  it('resolves Mapy tourist style from EXPO_PUBLIC key', () => {
    const env = readExpoPublicEnv({
      EXPO_PUBLIC_MAPY_API_KEY: 'mobile-map-key',
    })

    const resolved = resolveMapStyle({
      apiKey: env.mapyApiKey,
      defaultProvider: 'mapy-tourist',
      language: 'cs',
    })

    expect(resolved.providerId).toBe('mapy-tourist')
    expect(resolved.style.sources.basemap).toEqual({
      attribution: '© Seznam.cz a.s. a další',
      type: 'raster',
      url: 'https://api.mapy.com/v1/maptiles/outdoor/tiles.json?apikey=mobile-map-key&lang=cs',
    })
  })

  it('falls back to OSM when EXPO_PUBLIC map key is absent', () => {
    const env = readExpoPublicEnv({})
    const resolved = resolveMapStyle({
      apiKey: env.mapyApiKey,
      defaultProvider: 'mapy-tourist',
    })

    expect(resolved.providerId).toBe('osm')
    expect(resolved.reason).toBe('fallback-missing-key')
  })
})
