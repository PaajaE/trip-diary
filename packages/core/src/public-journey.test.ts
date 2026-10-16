import { describe, expect, it } from 'vitest'
import fixture from './fixtures/public-journey.json' with { type: 'json' }
import {
  buildMapPreview,
  MAP_PREVIEW_HEIGHT,
  MAP_PREVIEW_WIDTH,
  mapPreviewSvg,
  parsePublicJourney,
  publicJourneySchema,
} from './public-journey.ts'

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

describe('buildMapPreview', () => {
  const tree = () => {
    const journey = parsePublicJourney(fixture)
    if (journey === null) throw new Error('fixture')
    return journey
  }
  const located = (id: string, startsAt: string, lng: number, lat: number) => ({
    ...tree().moments[0]!,
    id,
    latitude: lat,
    longitude: lng,
    startsAt,
  })

  it('is null without located moments or tracks', () => {
    expect(buildMapPreview({ ...tree(), moments: [], tracks: [] })).toBeNull()
  })

  it('fits pins into the box and connects them with a dashed line', () => {
    const preview = buildMapPreview({
      ...tree(),
      moments: [
        located(
          '00000000-0000-4000-8000-000000000002',
          '2026-07-17T10:00:00Z',
          -114,
          51,
        ),
        located(
          '00000000-0000-4000-8000-000000000001',
          '2026-07-16T10:00:00Z',
          -116,
          51.5,
        ),
      ],
      tracks: [],
    })

    expect(preview?.dashed).toBe(true)
    expect(preview?.points).toHaveLength(2)
    for (const p of preview?.points ?? []) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(MAP_PREVIEW_WIDTH)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(MAP_PREVIEW_HEIGHT)
    }
    // Chronological: the western (earlier) moment comes first.
    expect(preview?.lines[0]?.[0]?.x).toBeLessThan(
      preview?.lines[0]?.[1]?.x ?? 0,
    )
  })

  it('centres a single pin and renders SVG without user text', () => {
    const preview = buildMapPreview({
      ...tree(),
      moments: [
        located(
          '00000000-0000-4000-8000-000000000003',
          '2026-07-16T10:00:00Z',
          14.4,
          50.1,
        ),
      ],
      tracks: [],
    })

    expect(preview?.points[0]).toEqual({
      x: MAP_PREVIEW_WIDTH / 2,
      y: MAP_PREVIEW_HEIGHT / 2,
    })
    expect(preview?.dashed).toBe(false)
    expect(mapPreviewSvg(preview!)).toMatch(/^<svg [^>]*viewBox="0 0 372 352"/)
  })
})
