import { describe, expect, it } from 'vitest'
import fixture from './fixtures/public-journey.json' with { type: 'json' }
import { parsePublicJourney, publicJourneySchema } from './public-journey.ts'

// fixtures/public-journey.json is real output of get_public_journey for the
// v1 -> v2 migration fixture (supabase/tests/v2_migration.test.sql), so this
// test guards the SQL <-> TypeScript contract.

describe('parsePublicJourney', () => {
  it('parses the real RPC output', () => {
    const journey = parsePublicJourney(fixture)

    expect(journey?.journey.title).toBe('Kanada 2026')
    expect(journey?.segments.map((segment) => segment.kind)).toEqual([
      'stage',
      'stage',
    ])
    expect(journey?.moments).toHaveLength(1)
    expect(journey?.media.map((media) => media.kind)).toEqual([
      'photo',
      'video',
    ])
  })

  it('keeps hidden locations as null coordinates', () => {
    const journey = parsePublicJourney(fixture)
    const video = journey?.media.find((media) => media.kind === 'video')

    expect(video?.latitude).toBeNull()
    expect(video?.longitude).toBeNull()
    expect(video?.durationMs).toBe(42_000)
  })

  it('returns null for a missing or private journey', () => {
    expect(parsePublicJourney(null)).toBeNull()
  })

  it('rejects a payload with an unknown media kind', () => {
    const broken = structuredClone(fixture) as {
      media: { kind: string }[]
    }
    const first = broken.media[0]
    if (first !== undefined) {
      first.kind = 'audio'
    }

    expect(publicJourneySchema.safeParse(broken).success).toBe(false)
  })
})
