import { describe, expect, it } from 'vitest'
import {
  buildPhotoDays,
  dayNumber,
  dayPlaceNames,
  firstDayKey,
  groupMomentsByDay,
  localDayKey,
  UNKNOWN_DAY,
} from '@/features/journey-workspace/model/workspace-days'
import type { WorkspaceMoment } from '@/features/journey-workspace/model/workspace-tree'
import { mom, uuid } from '@/features/journey-workspace/test-fixtures'

function entry(
  n: number,
  startsAt: string,
  tz: string | null,
  over: Partial<WorkspaceMoment['moment']> = {},
  photos = 1,
): WorkspaceMoment {
  return {
    cover: null,
    media: [],
    moment: mom(n, { startsAt, ...over }),
    photoCount: photos,
    tz,
    videoCount: 0,
  }
}

describe('localDayKey', () => {
  it('uses the local day of the zone, not UTC', () => {
    expect(localDayKey('2026-05-30T03:30:00Z', 'Europe/Prague')).toBe(
      '2026-05-30',
    )
    expect(localDayKey('2026-05-30T03:30:00Z', 'America/Edmonton')).toBe(
      '2026-05-29',
    )
  })

  it('crosses midnight at the zone boundary', () => {
    expect(localDayKey('2026-05-30T01:59:59Z', 'Europe/Prague')).toBe(
      '2026-05-29',
    )
    expect(localDayKey('2026-05-30T02:00:00Z', 'Europe/Prague')).toBe(
      '2026-05-30',
    )
  })

  it('falls back to UTC for a missing or invalid zone', () => {
    expect(localDayKey('2026-05-29T23:30:00Z', null)).toBe('2026-05-29')
    expect(localDayKey('2026-05-29T23:30:00Z', 'Nope/Zone')).toBe('2026-05-29')
  })

  it('starts the day at 04:00 local time', () => {
    expect(localDayKey('2026-05-29T22:40:00Z', 'Europe/Prague')).toBe(
      '2026-05-29',
    )
    expect(localDayKey('2026-05-30T01:59:00Z', 'Europe/Prague')).toBe(
      '2026-05-29',
    )
    expect(localDayKey('2026-05-30T02:00:00Z', 'Europe/Prague')).toBe(
      '2026-05-30',
    )
  })

  it('has no day without a usable start', () => {
    expect(localDayKey(null, 'Europe/Prague')).toBeNull()
    expect(localDayKey('garbage', 'Europe/Prague')).toBeNull()
  })
})

describe('groupMomentsByDay', () => {
  it('splits the same clock time on different days and sums photos', () => {
    const days = groupMomentsByDay([
      entry(1, '2026-05-28T08:23:00Z', 'UTC', {}, 2),
      entry(2, '2026-05-28T15:00:00Z', 'UTC', {}, 3),
      entry(3, '2026-05-29T08:23:00Z', 'UTC', {}, 4),
    ])
    expect(days.map((d) => [d.key, d.moments.length, d.photoCount])).toEqual([
      ['2026-05-28', 2, 5],
      ['2026-05-29', 1, 4],
    ])
  })

  it('uses each moment zone and the fallback zone', () => {
    const days = groupMomentsByDay(
      [
        entry(1, '2026-05-30T03:30:00Z', 'America/Edmonton'),
        entry(2, '2026-05-30T03:30:00Z', 'Europe/Prague'),
        entry(3, '2026-05-30T03:30:00Z', null),
      ],
      'Asia/Tokyo',
    )
    expect(days.map((d) => d.key)).toEqual(['2026-05-29', '2026-05-30'])
    expect(days[1]?.moments.map((m) => m.moment.id)).toEqual([uuid(2), uuid(3)])
  })

  it('puts moments with an unusable start into a trailing unknown group', () => {
    const days = groupMomentsByDay([
      entry(1, 'garbage', 'UTC'),
      entry(2, '2026-05-29T08:00:00Z', 'UTC'),
    ])
    expect(days.map((d) => d.key)).toEqual(['2026-05-29', UNKNOWN_DAY])
  })

  it('lists the two most frequent places of a day', () => {
    const a = uuid(101)
    const b = uuid(102)
    const c = uuid(103)
    const [day] = groupMomentsByDay([
      entry(1, '2026-05-29T08:00:00Z', 'UTC', { placeId: b }),
      entry(2, '2026-05-29T09:00:00Z', 'UTC', { placeId: a }),
      entry(3, '2026-05-29T10:00:00Z', 'UTC', { placeId: a }),
      entry(4, '2026-05-29T11:00:00Z', 'UTC', { placeId: c }),
    ])
    expect(day?.placeIds).toEqual([a, b])
  })
})

describe('dayPlaceNames', () => {
  it('dedupes case-insensitively, skips empty names and caps the list', () => {
    const [a, b, c, d, e] = [
      uuid(701),
      uuid(702),
      uuid(703),
      uuid(704),
      uuid(705),
    ]
    const day = groupMomentsByDay([
      entry(1, '2026-05-29T08:00:00Z', 'UTC', { placeId: a }),
      entry(2, '2026-05-29T09:00:00Z', 'UTC', { placeId: b }),
      entry(3, '2026-05-29T10:00:00Z', 'UTC', { placeId: c }),
      entry(4, '2026-05-29T11:00:00Z', 'UTC', { placeId: d }),
      entry(5, '2026-05-29T12:00:00Z', 'UTC', { placeId: e }),
    ])[0]
    const names = new Map([
      [a, 'Banff'],
      [b, 'BANFF'],
      [c, ' '],
      [d, 'Lake'],
      [e, 'Peak'],
    ])
    if (day === undefined) throw new Error('no day')
    expect(dayPlaceNames(day, (id) => names.get(id), 3)).toEqual([
      'Banff',
      'Lake',
      'Peak',
    ])
    expect(dayPlaceNames(day, (id) => names.get(id), 2)).toEqual([
      'Banff',
      'Lake',
    ])
  })
})

describe('day numbers', () => {
  it('counts local calendar days from the first moment of the journey', () => {
    const entries = [
      entry(1, '2026-06-03T09:00:00Z', 'America/Edmonton'),
      entry(2, '2026-05-26T12:00:00Z', 'America/Edmonton'),
    ]
    const first = firstDayKey(entries)
    expect(first).toBe('2026-05-26')
    expect(dayNumber(first, '2026-05-26')).toBe(1)
    expect(dayNumber(first, '2026-06-03')).toBe(9)
    expect(dayNumber(first, UNKNOWN_DAY)).toBeNull()
    expect(dayNumber(null, '2026-06-03')).toBeNull()
  })
})

describe('photo days (SQL pick_local_day rule)', () => {
  const photo = (at: string, tz: string | null) => ({
    capturedAt: at,
    capturedTz: tz,
  })

  it('puts 00:40 on the previous day in the home zone', () => {
    const days = groupMomentsByDay(
      [entry(1, '2026-05-29T22:40:00Z', null)],
      'Europe/Prague',
      buildPhotoDays([], 'Europe/Prague'),
    )
    expect(days.map((d) => d.key)).toEqual(['2026-05-29'])
  })

  it('follows the zone of the photo day (zone crossing)', () => {
    // Photos of 2026-06-02 were taken in Edmonton; 02:30Z on 3 June is
    // 20:30 on 2 June there, but 04:30 on 3 June in Prague (home).
    const photoDays = buildPhotoDays(
      [photo('2026-06-02T18:00:00Z', 'America/Edmonton')],
      'Europe/Prague',
    )
    expect(photoDays).toEqual({
      dates: ['2026-06-02'],
      zones: ['America/Edmonton'],
    })
    const moments = [
      entry(1, '2026-06-03T02:30:00Z', null),
      entry(2, '2026-06-03T11:30:00Z', null),
    ]
    expect(
      groupMomentsByDay(moments, 'Europe/Prague', photoDays).map((d) => d.key),
    ).toEqual(['2026-06-02', '2026-06-03'])
    expect(firstDayKey(moments, 'Europe/Prague', photoDays)).toBe('2026-06-02')
  })

  it('falls back to the home zone, UTC when unset, without photo days', () => {
    const none = buildPhotoDays([], null)
    expect(
      groupMomentsByDay(
        [entry(1, '2026-05-29T23:30:00Z', 'Asia/Tokyo')],
        null,
        none,
      )[0]?.key,
    ).toBe('2026-05-29')
  })

  it('lets only ready, dated media vote; own zone else home', () => {
    const days = buildPhotoDays(
      [
        photo('2026-06-02T10:00:00Z', null),
        { ...photo('2026-06-02T11:00:00Z', 'Asia/Tokyo'), status: 'failed' },
        photo('garbage', 'Asia/Tokyo'),
        { capturedAt: null, capturedTz: 'Asia/Tokyo' },
      ],
      'Europe/Prague',
    )
    expect(days).toEqual({ dates: ['2026-06-02'], zones: ['Europe/Prague'] })
  })
})
