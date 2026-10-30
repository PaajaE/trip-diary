import { describe, expect, it } from 'vitest'
import { summarizeZonedDays } from './days.ts'
import {
  localDay,
  majorityZone,
  photoDayZones,
  pickDay,
  pickLocalDay,
} from './local-day.ts'

const t = (iso: string): number => Date.parse(iso)

// Mirrors supabase/tests/v2_local_day.test.sql.
describe('localDay (04:00 boundary)', () => {
  it('00:40 local belongs to the previous day (Prague is UTC+2 in June)', () => {
    expect(localDay(t('2026-06-10T22:40:00Z'), 'Europe/Prague')).toBe(
      '2026-06-10',
    )
  })
  it('03:59 is still the previous day, 04:00 starts the new one', () => {
    expect(localDay(t('2026-06-11T01:59:00Z'), 'Europe/Prague')).toBe(
      '2026-06-10',
    )
    expect(localDay(t('2026-06-11T02:00:00Z'), 'Europe/Prague')).toBe(
      '2026-06-11',
    )
  })
  it('00:00 belongs to the previous day, 23:59 to the same day', () => {
    expect(localDay(t('2026-06-10T22:00:00Z'), 'Europe/Prague')).toBe(
      '2026-06-10',
    )
    expect(localDay(t('2026-06-10T21:59:00Z'), 'Europe/Prague')).toBe(
      '2026-06-10',
    )
  })
  it('works in UTC and accepts a Date', () => {
    expect(localDay(t('2026-06-10T03:59:00Z'), 'UTC')).toBe('2026-06-09')
    expect(localDay(new Date('2026-06-10T04:00:00Z'), 'UTC')).toBe('2026-06-10')
  })
  it('crosses month and year boundaries', () => {
    expect(localDay(t('2026-01-01T01:00:00Z'), 'UTC')).toBe('2025-12-31')
    expect(localDay(t('2026-03-01T01:00:00Z'), 'UTC')).toBe('2026-02-28')
  })
  it('date line: the same instant is a different day on each side', () => {
    expect(localDay(t('2026-06-11T13:59:00Z'), 'Pacific/Auckland')).toBe(
      '2026-06-11',
    )
    expect(localDay(t('2026-06-11T13:59:00Z'), 'Pacific/Honolulu')).toBe(
      '2026-06-10',
    )
    expect(localDay(t('2026-06-11T14:00:00Z'), 'Pacific/Honolulu')).toBe(
      '2026-06-11',
    )
  })
  it('DST change day: the boundary stays at 04:00 wall clock', () => {
    // Prague 2026-03-29: 02:00 CET -> 03:00 CEST (clocks jump at 01:00Z).
    expect(localDay(t('2026-03-29T00:30:00Z'), 'Europe/Prague')).toBe(
      '2026-03-28',
    ) // 01:30 CET
    expect(localDay(t('2026-03-29T01:59:00Z'), 'Europe/Prague')).toBe(
      '2026-03-28',
    ) // 03:59 CEST
    expect(localDay(t('2026-03-29T02:00:00Z'), 'Europe/Prague')).toBe(
      '2026-03-29',
    ) // 04:00 CEST
    // Fall back 2026-10-25: 03:00 CEST -> 02:00 CET (01:00Z).
    expect(localDay(t('2026-10-25T02:30:00Z'), 'Europe/Prague')).toBe(
      '2026-10-24',
    ) // 03:30 CET
    expect(localDay(t('2026-10-25T03:00:00Z'), 'Europe/Prague')).toBe(
      '2026-10-25',
    ) // 04:00 CET
  })
  it('throws for an unknown zone', () => {
    expect(() => localDay(0, 'Not/AZone')).toThrow(RangeError)
  })
})

describe('pickLocalDay', () => {
  it('no photo days: falls back to the home zone', () => {
    expect(
      pickLocalDay(t('2026-06-10T22:40:00Z'), 'Europe/Prague', [], []),
    ).toBe('2026-06-10')
    expect(
      pickLocalDay(t('2026-06-11T03:00:00Z'), 'Europe/Prague', [], []),
    ).toBe('2026-06-11')
  })
  it('no home zone: falls back to UTC', () => {
    expect(pickLocalDay(t('2026-06-10T22:40:00Z'), null, [], [])).toBe(
      '2026-06-10',
    )
    expect(pickLocalDay(t('2026-06-10T22:40:00Z'), undefined, [], [])).toBe(
      '2026-06-10',
    )
  })
  it('zone crossing: the photo-day zone (Edmonton) wins over the home zone', () => {
    expect(
      pickLocalDay(
        t('2026-06-11T03:00:00Z'),
        'Europe/Prague',
        ['2026-06-10'],
        ['America/Edmonton'],
      ),
    ).toBe('2026-06-10')
  })
  it('an instant outside any photo day falls back to the home zone', () => {
    expect(
      pickLocalDay(
        t('2026-06-20T10:00:00Z'),
        'Europe/Prague',
        ['2026-06-10'],
        ['America/Edmonton'],
      ),
    ).toBe('2026-06-20')
  })
  it('picks the earliest matching photo day', () => {
    // 2026-06-11T10:00Z is 06-11 in both Prague and Edmonton.
    expect(
      pickLocalDay(
        t('2026-06-11T10:00:00Z'),
        'UTC',
        ['2026-06-11', '2026-06-11'],
        ['Europe/Prague', 'America/Edmonton'],
      ),
    ).toBe('2026-06-11')
    // 06-12 02:30 Prague (00:30Z... ) matches 06-11 in UTC-zone day and 06-12 in Auckland.
    expect(
      pickLocalDay(
        t('2026-06-11T16:00:00Z'),
        'UTC',
        ['2026-06-12', '2026-06-11'],
        ['Pacific/Auckland', 'UTC'],
      ),
    ).toBe('2026-06-11')
  })
})

describe('majorityZone / photoDayZones', () => {
  it('majority wins, tie goes to the alphabetically first zone', () => {
    expect(majorityZone(['B/x', 'A/y', 'B/x'])).toBe('B/x')
    expect(majorityZone(['Europe/Prague', 'America/Edmonton'])).toBe(
      'America/Edmonton',
    )
    expect(majorityZone([])).toBeNull()
  })
  it('mirrors journey_day_zones: own-zone days, majority, tie-break', () => {
    const result = photoDayZones([
      { instant: t('2026-06-10T16:00:00Z'), zone: 'America/Edmonton' },
      { instant: t('2026-06-10T16:10:00Z'), zone: 'America/Edmonton' },
      { instant: t('2026-06-10T16:20:00Z'), zone: 'America/Edmonton' },
      { instant: t('2026-06-10T16:30:00Z'), zone: 'Europe/Prague' },
      { instant: t('2026-06-12T10:00:00Z'), zone: 'Europe/Prague' },
      { instant: t('2026-06-14T12:00:00Z'), zone: 'Europe/Prague' },
      { instant: t('2026-06-14T12:00:00Z'), zone: 'America/Edmonton' },
    ])
    expect(result.dates).toEqual(['2026-06-10', '2026-06-12', '2026-06-14'])
    expect(result.zones).toEqual([
      'America/Edmonton',
      'Europe/Prague',
      'America/Edmonton',
    ])
  })
})

describe('summarizeZonedDays', () => {
  const photo = (
    id: string,
    capturedAt: string,
    capturedTz: string | null,
  ) => ({
    capturedAt,
    capturedTz,
    id,
    latitude: null,
    longitude: null,
  })

  it('resolves moments like the SQL: Edmonton day vs home Prague', () => {
    const days = summarizeZonedDays(
      [
        photo('a', '2026-06-10T16:00:00Z', 'America/Edmonton'),
        photo('b', '2026-06-10T16:10:00Z', 'America/Edmonton'),
        photo('c', '2026-06-10T16:30:00Z', null),
        photo('d', '2026-06-12T10:00:00Z', null),
      ],
      'Europe/Prague',
    )
    // c has no zone and no GPS: it inherits Edmonton from the photo before it.
    expect(days.map((day) => [day.date, day.timeZone, day.mediaIds])).toEqual([
      ['2026-06-10', 'America/Edmonton', ['a', 'b', 'c']],
      ['2026-06-12', 'America/Edmonton', ['d']],
    ])
  })

  it('assigns a late-night photo to the previous day', () => {
    const days = summarizeZonedDays(
      [
        photo('evening', '2026-06-10T18:00:00Z', 'Europe/Prague'),
        photo('late', '2026-06-10T22:40:00Z', 'Europe/Prague'),
        photo('morning', '2026-06-11T02:00:00Z', 'Europe/Prague'),
      ],
      'Europe/Prague',
    )
    expect(days.map((day) => [day.date, day.mediaIds])).toEqual([
      ['2026-06-10', ['evening', 'late']],
      ['2026-06-11', ['morning']],
    ])
  })

  it('uses the home zone before any zone is known', () => {
    const [day] = summarizeZonedDays(
      [photo('a', '2026-06-10T22:40:00Z', null)],
      'Europe/Prague',
    )
    expect(day?.date).toBe('2026-06-10')
    expect(day?.timeZone).toBe('Europe/Prague')
  })

  it('tie between zones goes to the alphabetically first', () => {
    const [day] = summarizeZonedDays(
      [
        photo('p', '2026-06-14T12:00:00Z', 'Europe/Prague'),
        photo('e', '2026-06-14T12:00:00Z', 'America/Edmonton'),
      ],
      'UTC',
    )
    expect(day?.timeZone).toBe('America/Edmonton')
  })

  it('ignores an unknown captured zone', () => {
    const [day] = summarizeZonedDays(
      [photo('a', '2026-06-10T12:00:00Z', 'Not/AZone')],
      'Europe/Prague',
    )
    expect(day?.timeZone).toBe('Europe/Prague')
  })
})

describe('pickDay reads a stop on the clock of its own photo', () => {
  // Prague at dawn, then most of the same day in Dublin (an hour behind), the
  // evening there. The Dublin majority must not pull the Prague dawn back.
  const t = (iso: string) => Date.parse(iso)
  const photos = [
    { instant: t('2026-05-26T02:08:00Z'), zone: 'Europe/Prague' },
    { instant: t('2026-05-26T02:18:00Z'), zone: 'Europe/Prague' },
    { instant: t('2026-05-26T03:43:00Z'), zone: 'Europe/Prague' },
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
      instant: t('2026-05-26T11:32:00Z') + i * 60_000,
      zone: 'Europe/Dublin',
    })),
    { instant: t('2026-05-27T16:10:00Z'), zone: 'America/Edmonton' },
  ]

  it('puts 04:08 in Prague on 26 May, not on 25 May', () => {
    const days = photoDayZones(photos)
    expect(days.zones[0]).toBe('Europe/Dublin')
    expect(pickDay(t('2026-05-26T02:08:00Z'), null, days)).toBe('2026-05-26')
    expect(pickDay(t('2026-05-26T11:32:00Z'), null, days)).toBe('2026-05-26')
    expect(pickDay(t('2026-05-27T16:10:00Z'), null, days)).toBe('2026-05-27')
  })

  it('keeps the home zone far from every photo', () => {
    const days = photoDayZones(photos)
    // A month after the last photo: nothing to read a clock from.
    expect(pickDay(t('2026-07-10T01:00:00Z'), 'Europe/Prague', days)).toBe(
      '2026-07-09',
    )
  })
})
