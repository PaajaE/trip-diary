import { describe, expect, it } from 'vitest'
import { canadaV1Media } from './fixtures/canada-v1.ts'
import { suggestStageBoundaries, summarizeDays } from './days.ts'

describe('summarizeDays', () => {
  it('groups by local calendar day, not by UTC', () => {
    // 23:30 in Whitehorse (UTC-7) is already the next day in UTC.
    const days = summarizeDays(
      [
        {
          capturedAt: '2026-08-02T06:30:00Z',
          id: 'late',
          latitude: 60.72,
          longitude: -135.05,
        },
        {
          capturedAt: '2026-08-01T18:00:00Z',
          id: 'noon',
          latitude: 60.72,
          longitude: -135.05,
        },
      ],
      'America/Whitehorse',
    )

    expect(days.map((day) => [day.date, day.mediaIds])).toEqual([
      ['2026-08-01', ['noon', 'late']],
    ])
  })

  it('sums the distance travelled within a day', () => {
    const [day] = summarizeDays(
      [
        {
          capturedAt: '2026-06-01T16:00:00Z',
          id: 'a',
          latitude: 51.0,
          longitude: -115.0,
        },
        {
          capturedAt: '2026-06-01T17:00:00Z',
          id: 'b',
          latitude: 51.1,
          longitude: -115.0,
        },
        {
          capturedAt: '2026-06-01T18:00:00Z',
          id: 'c',
          latitude: 51.0,
          longitude: -115.0,
        },
      ],
      'America/Edmonton',
    )

    expect(day?.travelledKm).toBeCloseTo(22.2, 0)
    expect(day?.firstPoint).toEqual({ latitude: 51.0, longitude: -115.0 })
  })

  it('covers every day of the Canada sample in order', () => {
    const days = summarizeDays(canadaV1Media, 'America/Edmonton')

    expect(days[0]?.date).toBe('2026-05-26')
    expect(days[days.length - 1]?.date).toBe('2026-06-03')
    expect(days.reduce((sum, day) => sum + day.mediaCount, 0)).toBe(
      canadaV1Media.length,
    )
  })
})

describe('suggestStageBoundaries', () => {
  const days = summarizeDays(canadaV1Media, 'America/Edmonton')
  const suggestions = suggestStageBoundaries(days)

  it('suggests the arrival after the layover abroad', () => {
    expect(suggestions[0]?.startsOn).toBe('2026-05-27')
    expect(suggestions[0]?.shiftKm).toBeGreaterThan(5000)
  })

  it('suggests moving from the city to the mountains', () => {
    expect(suggestions[1]?.startsOn).toBe('2026-05-28')
  })

  it('does not split ordinary day trips inside the mountains', () => {
    const dates = suggestions.map((suggestion) => suggestion.startsOn)

    expect(dates).not.toContain('2026-05-29')
    expect(dates).not.toContain('2026-05-30')
    expect(dates).not.toContain('2026-05-31')
  })

  it('respects a custom threshold', () => {
    expect(
      suggestStageBoundaries(days, { minShiftKm: 1000 }).map(
        (suggestion) => suggestion.startsOn,
      ),
    ).toEqual(['2026-05-27'])
  })
})
