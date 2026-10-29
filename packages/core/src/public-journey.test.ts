import { describe, expect, it } from 'vitest'
import fixture from './fixtures/public-journey.json' with { type: 'json' }
import {
  buildJourneyStats,
  buildMapPreview,
  formatJourneyPeriod,
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

  it('parses dayNotes and defaults them for older payloads', () => {
    expect(parsePublicJourney(fixture)?.dayNotes).toEqual([
      {
        body: 'Synthetic day note: a quiet day by the lake.',
        date: '2026-06-03',
      },
    ])
    const legacy = structuredClone(fixture) as Record<string, unknown>
    delete legacy.dayNotes

    expect(publicJourneySchema.parse(legacy).dayNotes).toEqual([])
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

describe('buildJourneyStats', () => {
  it('counts stages, media, route km and days', () => {
    const tree = parsePublicJourney(fixture)
    if (tree === null) throw new Error('fixture')
    const stats = buildJourneyStats(tree)

    expect(stats.stages).toBe(2)
    expect(stats.media).toBe(2)
    expect(stats.days).toBe(1)
  })

  it('counts days with the 04:00 rule: 00:40 local joins the previous day', () => {
    const tree = parsePublicJourney(fixture)
    if (tree === null) throw new Error('fixture')
    const [first] = tree.moments
    if (first === undefined) throw new Error('fixture')
    const at = (startsAt: string) => ({ ...first, startsAt })
    const counted = buildJourneyStats({
      ...tree,
      journey: {
        ...tree.journey,
        endsAt: null,
        homeTz: 'Europe/Prague',
        startsAt: null,
      },
      media: [],
      // 22:00Z = 00:00 Prague (06-10 day), 12:00Z = 14:00 Prague (06-10 day)
      moments: [at('2026-06-10T22:00:00Z'), at('2026-06-10T12:00:00Z')],
    })
    expect(counted.days).toBe(1)
  })

  it('uses the journey dates inclusively when both are set', () => {
    const tree = parsePublicJourney(fixture)
    if (tree === null) throw new Error('fixture')
    const dated = {
      ...tree,
      journey: {
        ...tree.journey,
        endsAt: '2025-08-07',
        startsAt: '2025-07-20',
      },
    }

    expect(buildJourneyStats(dated).days).toBe(19)
  })
})

describe('formatJourneyPeriod', () => {
  it('formats a range per locale', () => {
    expect(formatJourneyPeriod('2025-07-20', '2025-08-07', 'cs')).toMatch(
      /20\. 7\.\s–\s7\. 8\. 2025/,
    )
    expect(formatJourneyPeriod('2025-07-20', '2025-08-07', 'en')).toContain(
      'Jul 20',
    )
  })

  it('handles a single day and a missing start', () => {
    expect(formatJourneyPeriod('2025-07-20', null, 'cs')).toContain('2025')
    expect(formatJourneyPeriod(null, null, 'cs')).toBeNull()
  })
})
