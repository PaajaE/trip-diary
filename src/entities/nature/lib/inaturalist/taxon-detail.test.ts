import { describe, expect, it } from 'vitest'
import { parseInaturalistTaxonResponse } from '@/entities/nature/lib/inaturalist/taxon-detail'

describe('parseInaturalistTaxonResponse', () => {
  it('returns public taxon details', () => {
    expect(
      parseInaturalistTaxonResponse({
        results: [
          {
            iconic_taxon_name: 'Mammalia',
            id: 41964,
            name: 'Lynx lynx',
            observations_count: 1200,
            preferred_common_name: 'Eurasian lynx',
            wikipedia_url: 'http://en.wikipedia.org/wiki/Eurasian_lynx',
          },
        ],
      }),
    ).toEqual({
      commonName: 'Eurasian lynx',
      iconicTaxon: 'Mammalia',
      observationCount: 1200,
      scientificName: 'Lynx lynx',
      taxonId: 41964,
      wikipediaUrl: 'http://en.wikipedia.org/wiki/Eurasian_lynx',
    })
  })
})
