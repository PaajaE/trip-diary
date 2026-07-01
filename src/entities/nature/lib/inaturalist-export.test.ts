import { describe, expect, it } from 'vitest'
import { buildINaturalistObservationUrl } from '@/entities/nature/lib/inaturalist-export'

describe('buildINaturalistObservationUrl', () => {
  it('prefers scientific name and includes coordinates', () => {
    const url = new URL(
      buildINaturalistObservationUrl({
        commonName: 'Rys ostrovid',
        latitude: 49.2,
        longitude: 13.36,
        scientificName: 'Lynx lynx',
      }),
    )

    expect(url.hostname).toBe('www.inaturalist.org')
    expect(url.pathname).toBe('/observations/new')
    expect(url.searchParams.get('taxon_name')).toBe('Lynx lynx')
    expect(url.searchParams.get('latitude')).toBe('49.2')
    expect(url.searchParams.get('longitude')).toBe('13.36')
  })

  it('falls back to common name without coordinates', () => {
    const url = new URL(
      buildINaturalistObservationUrl({
        commonName: 'Kingfisher',
      }),
    )

    expect(url.searchParams.get('taxon_name')).toBe('Kingfisher')
    expect(url.searchParams.has('latitude')).toBe(false)
  })
})
