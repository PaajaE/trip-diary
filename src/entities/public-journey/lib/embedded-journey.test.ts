import { describe, expect, it } from 'vitest'
import { readEmbeddedJourney } from '@/entities/public-journey/lib/embedded-journey'
import { publicJourneyFixture } from '@/entities/public-journey/lib/public-journey.fixture'

function docWith(text: string | null) {
  return {
    getElementById: () => (text === null ? null : { textContent: text }),
  } as unknown as Document
}

const handle = publicJourneyFixture.journey.space.handle
const envelope = (extra = {}) =>
  JSON.stringify({
    journey: publicJourneyFixture,
    journeySlug: 'kanada',
    spaceHandle: handle,
    ...extra,
  })

describe('readEmbeddedJourney', () => {
  it('returns the tree for a matching handle and slug', () => {
    expect(readEmbeddedJourney(handle, 'kanada', docWith(envelope()))).toEqual(
      publicJourneyFixture,
    )
  })

  it('returns undefined on handle/slug mismatch', () => {
    expect(
      readEmbeddedJourney(handle, 'jina', docWith(envelope())),
    ).toBeUndefined()
    expect(
      readEmbeddedJourney('x', 'kanada', docWith(envelope())),
    ).toBeUndefined()
  })

  it('returns undefined when missing, malformed or invalid', () => {
    expect(readEmbeddedJourney(handle, 'kanada', docWith(null))).toBeUndefined()
    expect(
      readEmbeddedJourney(handle, 'kanada', docWith('{nope')),
    ).toBeUndefined()
    expect(
      readEmbeddedJourney(
        handle,
        'kanada',
        docWith(envelope({ journey: { a: 1 } })),
      ),
    ).toBeUndefined()
  })
})
