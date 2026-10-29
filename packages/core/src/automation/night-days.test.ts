import { describe, expect, it } from 'vitest'
import type { MediaPoint } from './media-point.ts'
import { assignNightDays, createNightDayResolver } from './night-days.ts'

// Edmonton, June: UTC-6.
function shot(id: string, local: string): MediaPoint {
  const [date = '', time = ''] = local.split(' ')
  return {
    capturedAt: new Date(
      `${date}T${time}:00Z`.replace('Z', '-06:00'),
    ).toISOString(),
    id,
    latitude: 51.18,
    longitude: -115.57,
  }
}

const dates = (media: MediaPoint[]): Record<string, string> =>
  Object.fromEntries(
    [...assignNightDays(media, 'America/Edmonton')].map(([id, a]) => [
      id,
      a.date,
    ]),
  )

describe('assignNightDays', () => {
  it('keeps a night shot after midnight with the evening before', () => {
    expect(
      dates([
        shot('eve', '2026-06-10 21:00'),
        shot('fire', '2026-06-10 23:50'),
        shot('lights', '2026-06-11 00:40'),
        shot('morning', '2026-06-11 08:20'),
      ]),
    ).toEqual({
      eve: '2026-06-10',
      fire: '2026-06-10',
      lights: '2026-06-10',
      morning: '2026-06-11',
    })
  })

  it('is plain calendar days when nobody shoots at night', () => {
    expect(
      dates([
        shot('a', '2026-06-10 10:00'),
        shot('b', '2026-06-10 20:00'),
        shot('c', '2026-06-11 09:00'),
      ]),
    ).toEqual({ a: '2026-06-10', b: '2026-06-10', c: '2026-06-11' })
  })

  it('splits in the middle of the sleep gap, not at midnight', () => {
    // Gap 01:00 -> 07:00 inside the window: boundary 04:00. Photo at 03:00
    // is still the previous day; photo at 05:30 would be... none here.
    const result = dates([
      shot('late', '2026-06-11 01:00'),
      shot('up', '2026-06-11 07:30'),
    ])
    expect(result).toEqual({ late: '2026-06-10', up: '2026-06-11' })
  })

  it('falls back to 04:00 when the night has no long gap', () => {
    const assigned = assignNightDays(
      [
        shot('a', '2026-06-11 00:30'),
        shot('b', '2026-06-11 02:30'),
        shot('c', '2026-06-11 04:30'),
        shot('d', '2026-06-11 06:30'),
      ],
      'America/Edmonton',
    )
    expect(assigned.get('a')).toMatchObject({ date: '2026-06-10' })
    expect(assigned.get('b')).toMatchObject({ date: '2026-06-10' })
    expect(assigned.get('c')).toMatchObject({ date: '2026-06-11' })
    expect(assigned.get('a')?.reason).toBe('fallback')
  })

  it('does not depend on input order and skips undated media', () => {
    const media = [
      shot('a', '2026-06-10 23:50'),
      shot('b', '2026-06-11 00:40'),
      shot('c', '2026-06-11 08:20'),
      { capturedAt: null, id: 'x', latitude: null, longitude: null },
    ]
    const forward = assignNightDays(media, 'America/Edmonton')
    const backward = assignNightDays([...media].reverse(), 'America/Edmonton')
    expect([...forward]).toEqual([...backward])
    expect(forward.has('x')).toBe(false)
  })
})

describe('createNightDayResolver (local clock of each photo)', () => {
  const ms = (iso: string): number => Date.parse(iso)

  it('reads each instant in its own zone, not in the home or viewer zone', () => {
    // 2026-06-21 23:30 in Whitehorse (UTC-7) = 2026-06-22 06:30 UTC = 08:30 in
    // Prague. It is still the evening of the 21st where the photo was taken.
    const resolve = createNightDayResolver([
      { time: ms('2026-06-22T06:30:00Z'), zone: 'America/Whitehorse' },
    ])
    expect(resolve(ms('2026-06-22T06:30:00Z'), 'America/Whitehorse').date).toBe(
      '2026-06-21',
    )
    expect(resolve(ms('2026-06-22T06:30:00Z'), 'Europe/Prague').date).toBe(
      '2026-06-22',
    )
  })

  it('a day can last 23 or 25 hours across a zone change without a lost or doubled day', () => {
    // Flight Calgary (UTC-6) -> Whitehorse (UTC-7): clocks go back an hour.
    const resolve = createNightDayResolver([])
    const calgaryEvening = ms('2026-06-20T04:30:00Z') // 22:30 on the 19th
    const yukonMorning = ms('2026-06-20T15:30:00Z') // 08:30 on the 20th
    expect(resolve(calgaryEvening, 'America/Edmonton').date).toBe('2026-06-19')
    expect(resolve(yukonMorning, 'America/Whitehorse').date).toBe('2026-06-20')
  })
})
