import { describe, expect, it } from 'vitest'
import { parseWikidataSearchResponse } from '@/entities/nature/lib/wikidata'

describe('parseWikidataSearchResponse', () => {
  it('returns the first search hit', () => {
    expect(
      parseWikidataSearchResponse({
        search: [
          {
            description: 'species of mammal',
            id: 'Q6779',
            label: 'Eurasian lynx',
          },
        ],
      }),
    ).toEqual({
      description: 'species of mammal',
      id: 'Q6779',
      label: 'Eurasian lynx',
    })
  })

  it('returns null when search is empty', () => {
    expect(parseWikidataSearchResponse({ search: [] })).toBeNull()
  })
})
