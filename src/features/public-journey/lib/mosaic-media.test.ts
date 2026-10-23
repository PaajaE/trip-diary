import { describe, expect, it } from 'vitest'
import {
  FIXTURE_IDS,
  publicJourneyFixture,
} from '@/entities/public-journey/lib/public-journey.fixture'
import { pickMosaicMedia } from '@/features/public-journey/lib/mosaic-media'

const [a, b] = publicJourneyFixture.media
if (a === undefined || b === undefined) throw new Error('fixture media')

describe('pickMosaicMedia', () => {
  it('puts the cover first, then starred, then the rest', () => {
    const plain = { ...a, id: 'c', starred: false }
    const picked = pickMosaicMedia([plain, a, b], b.id)

    expect(picked.map((m) => m.id)).toEqual([b.id, a.id, 'c'])
  })

  it('skips media without an image and caps the count', () => {
    const noImage = { ...a, id: 'x', variants: [] }

    expect(pickMosaicMedia([noImage, a, b], null, 1)).toHaveLength(1)
    expect(pickMosaicMedia([noImage], null)).toEqual([])
    expect(FIXTURE_IDS.media1).toBe(a.id)
  })
})
