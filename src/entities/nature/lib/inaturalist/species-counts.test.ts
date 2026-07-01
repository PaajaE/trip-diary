import { describe, expect, it } from 'vitest'
import { parseInaturalistSpeciesCountsResponse } from '@/entities/nature/lib/inaturalist/species-counts'

describe('parseInaturalistSpeciesCountsResponse', () => {
  it('maps species counts to ranked taxon matches', () => {
    expect(
      parseInaturalistSpeciesCountsResponse({
        results: [
          {
            count: 12,
            taxon: {
              english_common_name: 'Eurasian lynx',
              iconic_taxon_name: 'Mammalia',
              id: 41964,
              name: 'Lynx lynx',
            },
          },
          {
            count: 42,
            taxon: {
              id: 3,
              name: 'Alcedo atthis',
              preferred_common_name: 'Common Kingfisher',
            },
          },
        ],
      }),
    ).toEqual([
      {
        commonName: 'Common Kingfisher',
        iconicTaxon: null,
        localObservationCount: 42,
        scientificName: 'Alcedo atthis',
        taxonId: 3,
      },
      {
        commonName: 'Eurasian lynx',
        iconicTaxon: 'Mammalia',
        localObservationCount: 12,
        scientificName: 'Lynx lynx',
        taxonId: 41964,
      },
    ])
  })
})
