import { describe, expect, it } from 'vitest'
import {
  buildReverseUrl,
  featureFromNaturalResult,
  lookupGridKey,
  regionFallback,
  settlementFromAddressResult,
  type NominatimResult,
} from './places.ts'

// Trimmed real Nominatim responses (© OpenStreetMap contributors, ODbL).
const calgaryDowntown: NominatimResult = {
  address: {
    city: 'Calgary',
    country: 'Kanada',
    country_code: 'ca',
    state: 'Alberta',
    suburb: 'Downtown Commercial Core',
  },
  addresstype: 'suburb',
  category: 'boundary',
  lat: '51.0473777',
  lon: '-114.0671989',
  name: 'Downtown Commercial Core',
  osm_id: 18465295,
  osm_type: 'relation',
  type: 'administrative',
}
const dawsonCity: NominatimResult = {
  address: { country_code: 'ca', state: 'Yukon', town: 'Dawson City' },
  addresstype: 'town',
  category: 'boundary',
  lat: '64.0606605',
  lon: '-139.4316950',
  name: 'Dawson City',
  osm_id: 9457300,
  osm_type: 'relation',
  type: 'administrative',
}
const skagway: NominatimResult = {
  address: { country_code: 'us', state: 'Aljaška', town: 'Skagway' },
  addresstype: 'town',
  category: 'place',
  lat: '59.4553914',
  lon: '-135.3153336',
  name: 'Skagway',
  osm_id: 150920839,
  osm_type: 'node',
  type: 'town',
}
const magogAdminArea: NominatimResult = {
  address: {
    city: 'Area G (Forster Creek/Mount Assiniboine)',
    country_code: 'ca',
    county: 'Regional District of East Kootenay',
    state: 'Britská Kolumbie',
  },
  addresstype: 'city',
  category: 'boundary',
  lat: '50.8744332',
  lon: '-116.1903417',
  name: 'Area G (Forster Creek/Mount Assiniboine)',
  osm_id: 11353011,
  osm_type: 'relation',
  type: 'administrative',
}
const moraineAdminArea: NominatimResult = {
  address: {
    country_code: 'ca',
    county: 'Improvement District No. 9',
    state: 'Alberta',
  },
  addresstype: 'county',
  category: 'boundary',
  lat: '51.4881335',
  lon: '-115.9380498',
  name: 'Improvement District No. 9',
  osm_id: 11122776,
  osm_type: 'relation',
  type: 'administrative',
}
const mountAssiniboine: NominatimResult = {
  address: { country_code: 'ca', peak: 'Mount Assiniboine', state: 'Alberta' },
  addresstype: 'peak',
  category: 'natural',
  lat: '50.8700193',
  lon: '-115.6513468',
  name: 'Mount Assiniboine',
  osm_id: 2687505274,
  osm_type: 'node',
  type: 'peak',
}

const lakeMagog = { latitude: 50.875, longitude: -115.646 }

describe('settlementFromAddressResult', () => {
  it('uses the city for a district, so all of Calgary is one place', () => {
    expect(settlementFromAddressResult(calgaryDowntown)).toMatchObject({
      countryCode: 'CA',
      name: 'Calgary',
      region: 'Alberta',
      sourceRef: 'osm-settlement:ca:alberta:calgary',
    })
  })

  it('accepts towns tagged as boundaries or place nodes', () => {
    expect(settlementFromAddressResult(dawsonCity)).toMatchObject({
      name: 'Dawson City',
      sourceRef: 'osm:relation:9457300',
    })
    expect(settlementFromAddressResult(skagway)).toMatchObject({
      countryCode: 'US',
      name: 'Skagway',
      sourceRef: 'osm:node:150920839',
    })
  })

  it('rejects administrative areas in the wilderness', () => {
    expect(settlementFromAddressResult(magogAdminArea)).toBeNull()
    expect(settlementFromAddressResult(moraineAdminArea)).toBeNull()
  })

  it('rejects error responses', () => {
    expect(
      settlementFromAddressResult({ error: 'Unable to geocode' }),
    ).toBeNull()
  })
})

describe('featureFromNaturalResult', () => {
  it('names a wilderness photo after the nearby peak', () => {
    expect(featureFromNaturalResult(mountAssiniboine, lakeMagog)).toMatchObject(
      {
        name: 'Mount Assiniboine',
        sourceRef: 'osm:node:2687505274',
      },
    )
  })

  it('ignores features too far from the photo', () => {
    expect(
      featureFromNaturalResult(mountAssiniboine, {
        latitude: 51.5,
        longitude: -116.5,
      }),
    ).toBeNull()
  })

  it('ignores administrative boundaries', () => {
    expect(featureFromNaturalResult(magogAdminArea, lakeMagog)).toBeNull()
  })
})

describe('regionFallback', () => {
  it('falls back to the province or state', () => {
    expect(regionFallback(moraineAdminArea)).toMatchObject({
      name: 'Alberta',
      sourceRef: 'osm-region:ca:alberta',
    })
  })
})

describe('request helpers', () => {
  it('builds a reverse request for the given layer', () => {
    const url = new URL(buildReverseUrl(lakeMagog, 'natural,poi'))

    expect(url.origin + url.pathname).toBe(
      'https://nominatim.openstreetmap.org/reverse',
    )
    expect(url.searchParams.get('layer')).toBe('natural,poi')
    expect(url.searchParams.get('format')).toBe('jsonv2')
    expect(url.searchParams.get('lat')).toBe('50.875000')
  })

  it('rounds lookups to about 110 m so nearby photos share one request', () => {
    expect(lookupGridKey({ latitude: 50.87512, longitude: -115.64649 })).toBe(
      lookupGridKey({ latitude: 50.87531, longitude: -115.64601 }),
    )
    expect(lookupGridKey(lakeMagog)).toBe('50.875,-115.646')
  })
})
