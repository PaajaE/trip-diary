import { describe, expect, it } from 'vitest'
import {
  dayPeriodOfHour,
  deriveStopNames,
  type StopNameInput,
} from './stop-names.ts'

function stop(
  id: string,
  startsAt: string,
  over: Partial<StopNameInput> = {},
): StopNameInput {
  return {
    id,
    place: null,
    placePending: false,
    startsAt,
    timeZone: 'America/Edmonton',
    title: null,
    ...over,
  }
}

describe('deriveStopNames', () => {
  it('a manual title wins over the place', () => {
    const names = deriveStopNames([
      stop('a', '2026-09-03T16:00:00Z', {
        place: { kind: 'settlement', name: 'Banff' },
        title: 'Our lake',
      }),
    ])
    expect(names.get('a')?.base).toEqual({ kind: 'title', text: 'Our lake' })
  })

  it('uses a specific place, quarter + city, then "near <city>"', () => {
    const names = deriveStopNames([
      stop('peak', '2026-09-03T16:00:00Z', {
        place: { kind: 'natural', name: 'Sulphur Mountain' },
      }),
      stop('quarter', '2026-09-04T16:00:00Z', {
        place: { district: 'Kitsilano', kind: 'settlement', name: 'Vancouver' },
      }),
      stop('near', '2026-09-05T16:00:00Z', {
        place: { kind: 'near', name: 'u Canmore' },
      }),
      stop('prefixed', '2026-09-06T16:00:00Z', {
        place: { kind: null, name: 'u Golden' },
      }),
    ])
    expect(names.get('peak')?.base).toEqual({
      kind: 'place',
      text: 'Sulphur Mountain',
    })
    expect(names.get('quarter')?.base).toEqual({
      city: 'Vancouver',
      district: 'Kitsilano',
      kind: 'district',
    })
    expect(names.get('near')?.base).toEqual({ city: 'Canmore', kind: 'near' })
    expect(names.get('prefixed')?.base).toEqual({
      city: 'Golden',
      kind: 'near',
    })
  })

  it('falls back to the weekday and part of the day in the stop zone', () => {
    // 2026-09-03 is a Thursday; 21:30Z = 15:30 MDT.
    const names = deriveStopNames([stop('a', '2026-09-03T21:30:00Z')])
    expect(names.get('a')).toEqual({
      base: { kind: 'dayPart', period: 'afternoon', weekday: 4 },
      dayKey: '2026-09-03',
      ordinal: null,
      period: null,
    })
  })

  it('uses the 04:00 day for the weekday (a night stop belongs to the day before)', () => {
    // 08:30Z = 02:30 MDT on Friday 09-04, still Thursday's day.
    const names = deriveStopNames([stop('a', '2026-09-04T08:30:00Z')])
    expect(names.get('a')?.base).toEqual({
      kind: 'dayPart',
      period: 'night',
      weekday: 4,
    })
  })

  it('treats a region or country as no place', () => {
    const names = deriveStopNames([
      stop('a', '2026-09-03T21:30:00Z', {
        place: { kind: 'region', name: 'Alberta' },
      }),
    ])
    expect(names.get('a')?.base.kind).toBe('dayPart')
  })

  it('is pending while the place is looked up', () => {
    const names = deriveStopNames([
      stop('a', '2026-09-03T21:30:00Z', { placePending: true }),
    ])
    expect(names.get('a')?.base).toEqual({ kind: 'pending' })
  })

  it('tells equal names of one day apart by the time of day, then a number', () => {
    const banff = { kind: 'settlement' as const, name: 'Banff' }
    const names = deriveStopNames([
      // 15:00Z = 09:00 MDT (morning); 21:00Z and 22:00Z = 15:00 and 16:00
      stop('m', '2026-09-03T15:00:00Z', { place: banff }),
      stop('a1', '2026-09-03T21:00:00Z', { place: banff }),
      stop('a2', '2026-09-03T22:00:00Z', { place: banff }),
      stop('other-day', '2026-09-05T15:00:00Z', { place: banff }),
    ])
    expect(
      ['m', 'a1', 'a2', 'other-day'].map((id) => {
        const name = names.get(id)
        return [name?.period, name?.ordinal]
      }),
    ).toEqual([
      ['morning', null],
      ['afternoon', null],
      ['afternoon', 2],
      [null, null],
    ])
  })

  it('numbers equal time-of-day names of one day', () => {
    const names = deriveStopNames([
      stop('b', '2026-09-03T21:40:00Z'),
      stop('a', '2026-09-03T21:30:00Z'),
    ])
    expect(names.get('a')?.ordinal).toBeNull()
    expect(names.get('b')?.ordinal).toBe(2)
    expect(names.get('b')?.period).toBeNull()
  })

  it('never disambiguates manual titles and is order independent', () => {
    const list = [
      stop('x', '2026-09-03T15:00:00Z', { title: 'Lake' }),
      stop('y', '2026-09-03T21:00:00Z', { title: 'Lake' }),
    ]
    const names = deriveStopNames(list)
    expect(names.get('y')?.period).toBeNull()
    expect(names.get('y')?.ordinal).toBeNull()
    expect(Object.fromEntries(deriveStopNames([...list].reverse()))).toEqual(
      Object.fromEntries(names),
    )
  })

  it('maps hours to periods', () => {
    expect(
      [0, 3, 4, 9, 10, 11, 12, 16, 17, 21, 22, 23].map(dayPeriodOfHour),
    ).toEqual([
      'night',
      'night',
      'morning',
      'morning',
      'lateMorning',
      'lateMorning',
      'afternoon',
      'afternoon',
      'evening',
      'evening',
      'night',
      'night',
    ])
  })
})
