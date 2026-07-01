import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  aggregateGbifResults,
  identifyResponseSchema,
} from '@/entities/nature/lib/gbif-regional-species'

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

describe('identifyResponseSchema', () => {
  it('accepts edge function suggestion payloads', () => {
    const payload = {
      suggestions: [
        {
          commonName: 'Common Kingfisher',
          iconicTaxon: 'Aves',
          score: 0.91,
          scientificName: 'Alcedo atthis',
          taxonId: 3,
        },
      ],
    }

    expect(identifyResponseSchema.parse(payload)).toEqual(payload)
  })

  it('rejects malformed payloads', () => {
    expect(() =>
      identifyResponseSchema.parse({
        suggestions: [{ commonName: 'Lynx' }],
      }),
    ).toThrow(z.ZodError)
  })
})
