import { describe, expect, it } from 'vitest'
import {
  buildReverseUrl,
  lookupGridKey,
  placeFromMapyResult,
} from './places.ts'

// Trimmed real Mapy.com responses (© Seznam.cz a.s. a partneři).
const country = { isoCode: 'CA', name: 'Kanada', type: 'regional.country' }
const calgary = {
  items: [
    {
      name: 'Calgary',
      position: { lat: 51.0447, lon: -114.0719 },
      regionalStructure: [
        { name: 'Downtown', type: 'regional.municipality_part' },
        { name: 'Calgary', type: 'regional.municipality' },
        { name: 'provincie Alberta', type: 'regional.region' },
        country,
      ],
      type: 'regional.municipality',
    },
  ],
}
const lakeLouise = {
  items: [
    {
      name: 'Improvement District No. 09',
      regionalStructure: [
        { name: 'Improvement District No. 09', type: 'regional.municipality' },
        { name: 'provincie Alberta', type: 'regional.region' },
        country,
      ],
      type: 'regional.municipality',
    },
  ],
}
const assiniboine = {
  items: [
    {
      name: 'Area G (Forster Creek/Mount Assiniboine)',
      regionalStructure: [
        {
          name: 'Area G (Forster Creek/Mount Assiniboine)',
          type: 'regional.municipality',
        },
        { name: 'provincie Britská Kolumbie', type: 'regional.region' },
        country,
      ],
    },
  ],
}
const query = { latitude: 51.417, longitude: -116.18 }

describe('buildReverseUrl', () => {
  it('builds the rgeocode request', () => {
    const url = new URL(buildReverseUrl(query, 'KEY'))
    expect(url.origin + url.pathname).toBe('https://api.mapy.cz/v1/rgeocode')
    expect(url.searchParams.get('lon')).toBe('-116.180000')
    expect(url.searchParams.get('lat')).toBe('51.417000')
    expect(url.searchParams.get('lang')).toBe('cs')
    expect(url.searchParams.get('apikey')).toBe('KEY')
  })
})

describe('lookupGridKey', () => {
  it('rounds to ~110 m', () => {
    expect(lookupGridKey({ latitude: 51.04471, longitude: -114.07189 })).toBe(
      '51.045,-114.072',
    )
  })
})

describe('placeFromMapyResult', () => {
  it('uses the municipality and its item position', () => {
    expect(placeFromMapyResult(calgary, query)).toEqual({
      countryCode: 'CA',
      latitude: 51.0447,
      longitude: -114.0719,
      name: 'Calgary',
      region: 'Alberta',
      sourceRef: 'mapy:municipality:calgary:alberta:CA',
    })
  })

  it('falls back to the region for administrative placeholders', () => {
    expect(placeFromMapyResult(lakeLouise, query)).toMatchObject({
      latitude: 51.417,
      longitude: -116.18,
      name: 'Alberta',
      region: 'Alberta',
      sourceRef: 'mapy:region:alberta:alberta:CA',
    })
    expect(placeFromMapyResult(assiniboine, query)).toMatchObject({
      name: 'Britská Kolumbie',
      region: 'Britská Kolumbie',
    })
  })

  it('falls back to the country without a region', () => {
    const result = {
      items: [{ regionalStructure: [country] }],
    }
    expect(placeFromMapyResult(result, query)).toMatchObject({
      countryCode: 'CA',
      name: 'Kanada',
      region: null,
    })
  })

  it('strips generic prefixes and rejects bad country codes', () => {
    const result = {
      items: [
        {
          regionalStructure: [
            { name: 'Jihomoravský kraj', type: 'regional.region' },
            { name: 'kraj Vysočina', type: 'regional.region' },
            { isoCode: 'CZE', name: 'Česko', type: 'regional.country' },
          ],
        },
      ],
    }
    expect(placeFromMapyResult(result, query)).toMatchObject({
      countryCode: null,
      name: 'Jihomoravský kraj',
    })
  })

  it('never names a place after administrative units', () => {
    const named = (municipality: string) => ({
      items: [
        {
          regionalStructure: [
            { name: municipality, type: 'regional.municipality' },
            { name: 'provincie Alberta', type: 'regional.region' },
            country,
          ],
        },
      ],
    })
    for (const junk of [
      'Clearwater County',
      'Yellowhead County',
      'administrativní členění Area C (Long Beach)',
      'Improvement District No. 12',
      'Electoral Area D',
    ]) {
      expect(placeFromMapyResult(named(junk), query)?.name).toBe('Alberta')
    }
    expect(
      placeFromMapyResult(named('Municipality of Jasper'), query)?.name,
    ).toBe('Jasper')
  })

  it('is defensive about malformed responses', () => {
    expect(placeFromMapyResult(null, query)).toBeNull()
    expect(placeFromMapyResult({}, query)).toBeNull()
    expect(placeFromMapyResult({ items: [] }, query)).toBeNull()
    expect(placeFromMapyResult({ items: [{}] }, query)).toBeNull()
    expect(placeFromMapyResult({ items: [null, 3] }, query)).toBeNull()
  })

  it('caps the source reference length', () => {
    const long = 'x'.repeat(400)
    const result = {
      items: [
        {
          regionalStructure: [
            { name: long, type: 'regional.municipality' },
            country,
          ],
        },
      ],
    }
    const place = placeFromMapyResult(result, query)
    expect(place?.sourceRef.length).toBeLessThanOrEqual(200)
  })
})
