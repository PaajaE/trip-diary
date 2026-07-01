import { describe, expect, it } from 'vitest'
import { parseInaturalistIdentifyResponse } from '@/entities/nature/lib/inaturalist-identify'

describe('parseInaturalistIdentifyResponse', () => {
  it('returns ranked suggestions with common names', () => {
    expect(
      parseInaturalistIdentifyResponse({
        results: [
          {
            combined_score: 0.42,
            taxon: {
              english_common_name: 'Eurasian lynx',
              id: 41964,
              name: 'Lynx lynx',
            },
          },
          {
            combined_score: 0.91,
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
        score: 0.91,
        scientificName: 'Alcedo atthis',
        taxonId: 3,
      },
      {
        commonName: 'Eurasian lynx',
        iconicTaxon: null,
        score: 0.42,
        scientificName: 'Lynx lynx',
        taxonId: 41964,
      },
    ])
  })
})
