import { describe, expect, it } from 'vitest'
import { parseInaturalistAutocompleteResponse } from '@/entities/nature/lib/inaturalist/taxon-search'

describe('parseInaturalistAutocompleteResponse', () => {
  it('returns the first search hit', () => {
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

  it('returns empty list when search is empty', () => {
    expect(parseInaturalistAutocompleteResponse({ results: [] })).toEqual([])
  })
})
