import { describe, expect, it } from 'vitest'
import {
  buildNearbyUrl,
  buildSettlementsUrl,
  featuresOf,
  pickNearbyPlace,
} from './places.ts'

// Synthetic features that keep the category/distance structure of real
// Geoapify responses (OSM data, (c) OpenStreetMap contributors).
const here = { latitude: 10, longitude: 20 }

interface Spec {
  categories: string[]
  distance: number
  name?: string
  raw?: Record<string, unknown>
  osm?: number
}

function feature(spec: Spec, index: number) {
  return {
    properties: {
      categories: spec.categories,
      country_code: 'ca',
      datasource: {
        raw: {
          osm_id: spec.osm ?? 1000 + index,
          osm_type: 'n',
          ...spec.raw,
        },
      },
      distance: spec.distance,
      lat: 10 + index / 1000,
      lon: 20,
      ...(spec.name === undefined ? {} : { name: spec.name }),
      place_id: `p${String(index)}`,
      state: 'Alberta',
    },
  }
}

function pick(...specs: Spec[]) {
  return pickNearbyPlace(specs.map(feature), here)
}

describe('pickNearbyPlace', () => {
  it('prefers the nearby hamlet to everything else (Lake Louise)', () => {
    const place = pick(
      {
        categories: ['populated_place', 'populated_place.hamlet'],
        distance: 903,
        name: 'Lake Louise',
      },
      {
        categories: ['natural.mountain.peak'],
        distance: 300,
        name: 'Saddle Mountain',
      },
      {
        categories: ['populated_place.unpopulated_locality'],
        distance: 100,
        name: 'Morant Curve',
      },
    )
    expect(place).toMatchObject({
      countryCode: 'CA',
      name: 'Lake Louise',
      region: 'Alberta',
      sourceRef: 'geoapify:n1000',
    })
  })

  it('finds a village (Yoho)', () => {
    expect(
      pick({
        categories: ['populated_place.village'],
        distance: 682,
        name: 'Field',
      })?.name,
    ).toBe('Field')
  })

  it('falls back to a peak when no settlement is near (Magog)', () => {
    expect(
      pick(
        {
          categories: ['natural.mountain.peak'],
          distance: 991,
          name: 'Mount Magog',
        },
        {
          categories: ['natural.mountain.peak'],
          distance: 1146,
          name: 'Wedgwood Peak',
        },
        {
          categories: ['tourism.attraction.viewpoint'],
          distance: 200,
          name: 'Pond',
        },
      )?.name,
    ).toBe('Mount Magog')
  })

  it('ignores a nearer attraction when a town is near (Jasper)', () => {
    expect(
      pick(
        {
          categories: ['tourism.sights.memorial.locomotive'],
          distance: 243,
          name: 'CN Mountain Locomotive 6015',
        },
        {
          categories: ['tourism.attraction'],
          distance: 250,
          name: 'Locomotive',
        },
        { categories: ['populated_place.town'], distance: 298, name: 'Jasper' },
      )?.name,
    ).toBe('Jasper')
  })

  it('never names a place after an artwork (Tofino)', () => {
    expect(
      pick(
        {
          categories: ['tourism.attraction', 'tourism.attraction.artwork'],
          distance: 197,
          name: 'Lord Western',
        },
        {
          categories: ['tourism.attraction.artwork.sculpture'],
          distance: 209,
          name: 'Winch',
        },
      ),
    ).toBeNull()
    expect(
      pick(
        {
          categories: ['tourism.attraction.artwork'],
          distance: 197,
          name: 'A',
        },
        { categories: ['populated_place.town'], distance: 353, name: 'Tofino' },
      )?.name,
    ).toBe('Tofino')
  })

  it('reaches a city 1 km away behind many murals (Calgary)', () => {
    expect(
      pick(
        {
          categories: ['tourism.attraction.artwork.mural'],
          distance: 253,
          name: 'Mural',
        },
        {
          categories: ['populated_place.city'],
          distance: 1012,
          name: 'Calgary',
        },
      )?.name,
    ).toBe('Calgary')
  })

  it('weighs distance against the tier radius', () => {
    expect(
      pick(
        {
          categories: ['populated_place.hamlet'],
          distance: 1000,
          name: 'Hamlet',
        },
        { categories: ['populated_place.town'], distance: 3000, name: 'Town' },
      )?.name,
    ).toBe('Town')
    expect(
      pick(
        {
          categories: ['populated_place.hamlet'],
          distance: 900,
          name: 'Hamlet',
        },
        { categories: ['populated_place.city'], distance: 12000, name: 'City' },
      )?.name,
    ).toBe('Hamlet')
  })

  it('respects per-kind radii', () => {
    expect(
      pick({
        categories: ['populated_place.hamlet'],
        distance: 4500,
        name: 'H',
      }),
    ).toBeNull()
    expect(
      pick({
        categories: ['populated_place.village'],
        distance: 8500,
        name: 'V',
      }),
    ).toBeNull()
    expect(
      pick({ categories: ['populated_place.town'], distance: 14000, name: 'T' })
        ?.name,
    ).toBe('T')
    expect(
      pick({ categories: ['natural.water'], distance: 2600, name: 'Lake' }),
    ).toBeNull()
    expect(
      pick({
        categories: ['tourism.attraction.viewpoint'],
        distance: 1600,
        name: 'V',
      }),
    ).toBeNull()
  })

  it('prefers natural features to attractions and picks the nearest', () => {
    expect(
      pick(
        {
          categories: ['tourism.attraction.viewpoint'],
          distance: 100,
          name: 'View',
        },
        { categories: ['natural.water'], distance: 2000, name: 'Far Lake' },
        {
          categories: ['natural.mountain.glacier'],
          distance: 900,
          name: 'Glacier',
        },
      )?.name,
    ).toBe('Glacier')
  })

  it('skips unnamed features and unpopulated localities', () => {
    expect(
      pick(
        { categories: ['populated_place.hamlet'], distance: 100 },
        {
          categories: ['populated_place.unpopulated_locality'],
          distance: 50,
          name: 'X',
        },
        {
          categories: ['tourism.attraction.viewpoint'],
          distance: 80,
          name: 'Lookout',
        },
      )?.name,
    ).toBe('Lookout')
  })

  it('prefers name:cs, then name, then name:en', () => {
    const base = { categories: ['populated_place.city'], distance: 5 }
    expect(
      pick({ ...base, name: 'Prague', raw: { 'name:cs': 'Praha' } })?.name,
    ).toBe('Praha')
    expect(pick({ ...base, name: 'Prague' })?.name).toBe('Prague')
    expect(pick({ ...base, raw: { name: 'Praha OSM' } })?.name).toBe(
      'Praha OSM',
    )
    expect(pick({ ...base, raw: { 'name:en': 'Prague' } })?.name).toBe('Prague')
  })

  it('falls back to place_id without an OSM id and survives junk', () => {
    const noOsm = {
      properties: {
        categories: ['populated_place.town'],
        distance: 10,
        lat: 1,
        lon: 2,
        name: 'T',
        place_id: 'abc',
      },
    }
    expect(pickNearbyPlace([noOsm], here)?.sourceRef).toBe('geoapify:abc')
    expect(pickNearbyPlace([null, 5, {}, { properties: 3 }], here)).toBeNull()
    expect(pickNearbyPlace('nope', here)).toBeNull()
    expect(featuresOf({ features: [1] })).toEqual([1])
    expect(featuresOf(null)).toEqual([])
  })

  it('computes the distance itself when Geoapify omits it', () => {
    const near = {
      properties: {
        categories: ['natural.water'],
        lat: 10.01,
        lon: 20,
        name: 'Tarn',
        place_id: 'w',
      },
    }
    expect(pickNearbyPlace([near], here)?.name).toBe('Tarn') // ~1.1 km
    expect(
      pickNearbyPlace(
        [{ properties: { ...near.properties, lat: 10.05 } }],
        here,
      ),
    ).toBeNull() // ~5.5 km
  })
})

describe('geoapify urls', () => {
  it('requests settlements within 15 km, biased to the point', () => {
    const url = new URL(buildSettlementsUrl(here, 'KEY'))
    expect(url.searchParams.get('filter')).toBe(
      'circle:20.000000,10.000000,15000',
    )
    expect(url.searchParams.get('bias')).toBe('proximity:20.000000,10.000000')
    expect(url.searchParams.get('categories')).toContain(
      'populated_place.hamlet',
    )
    expect(url.searchParams.get('lang')).toBe('cs')
    expect(url.searchParams.get('apiKey')).toBe('KEY')
  })

  it('requests nature and attractions within 2.5 km', () => {
    const url = new URL(buildNearbyUrl(here, 'KEY'))
    expect(url.searchParams.get('filter')).toBe(
      'circle:20.000000,10.000000,2500',
    )
    expect(url.searchParams.get('categories')).toContain('natural.water')
  })
})
