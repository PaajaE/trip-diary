import { describe, expect, it } from 'vitest'
import { aggregateGbifResults } from '@/entities/nature/lib/gbif-regional-species'

describe('aggregateGbifResults', () => {
  it('aggregates occurrence counts by species key', () => {
    expect(
      aggregateGbifResults(
        [
          {
            species: 'Lynx lynx',
            speciesKey: 1,
            vernacularName: 'Rys ostrovid',
          },
          { species: 'Lynx lynx', speciesKey: 1 },
          {
            species: 'Alcedo atthis',
            speciesKey: 2,
            vernacularName: 'Ledňáček',
          },
        ],
        2,
      ),
    ).toEqual([
      {
        commonName: 'Rys ostrovid',
        occurrenceCount: 2,
        scientificName: 'Lynx lynx',
        source: 'gbif',
        taxonKey: 1,
      },
      {
        commonName: 'Ledňáček',
        occurrenceCount: 1,
        scientificName: 'Alcedo atthis',
        source: 'gbif',
        taxonKey: 2,
      },
    ])
  })
})
