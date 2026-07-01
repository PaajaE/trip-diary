import { describe, expect, it } from 'vitest'
import { parseInaturalistAutocompleteResponse } from '@/entities/nature/lib/inaturalist-taxon-search'

describe('parseInaturalistAutocompleteResponse', () => {
  it('maps preferred common names and scientific names', () => {
    expect(
      parseInaturalistAutocompleteResponse({
        results: [
          {
            english_common_name: 'Eurasian lynx',
            id: 41964,
            name: 'Lynx lynx',
            rank: 'species',
          },
        ],
      }),
    ).toEqual([
      {
        commonName: 'Eurasian lynx',
        id: 41964,
        rank: 'species',
        scientificName: 'Lynx lynx',
      },
    ])
  })

  it('skips incomplete taxa', () => {
    expect(
      parseInaturalistAutocompleteResponse({
        results: [{ name: 'Lynx lynx' }],
      }),
    ).toEqual([])
  })
})
