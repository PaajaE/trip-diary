import { describe, expect, it } from 'vitest'
import { summarizeDays } from './days.ts'
import type { MediaPoint } from './media-point.ts'
import { findBase, suggestTrips } from './trips.ts'

// Synthetic, publicly known places (trailheads, towns); not real user data.
const CANMORE = [51.089, -115.358] as const
const MORAINE_LAKE = [51.322, -116.186] as const
const MT_SHARK = [50.86, -115.42] as const
const BIG_SPRINGS = [50.84, -115.49] as const
const MAGOG = [50.875, -115.646] as const
const OG_LAKE = [50.93, -115.66] as const
const SUNSHINE = [51.07, -115.77] as const

let counter = 0
// Local Canmore time (UTC-6 in summer) -> media point.
function at(
  date: string,
  hour: number,
  [latitude, longitude]: readonly [number, number],
): MediaPoint {
  counter += 1
  const utcHour = String(hour + 6).padStart(2, '0')
  return {
    capturedAt: `${date}T${utcHour}:00:00Z`,
    id: `m${String(counter).padStart(3, '0')}`,
    latitude,
    longitude,
  }
}

function rockiesStay(): MediaPoint[] {
  return [
    at('2026-09-01', 9, CANMORE),
    at('2026-09-01', 17, CANMORE),
    // day hike to Moraine Lake, back in Canmore for the night
    at('2026-09-02', 8, CANMORE),
    at('2026-09-02', 12, MORAINE_LAKE),
    at('2026-09-02', 17, CANMORE),
    at('2026-09-03', 10, CANMORE),
    at('2026-09-03', 16, CANMORE),
    // six-day Assiniboine trek
    at('2026-09-04', 9, MT_SHARK),
    at('2026-09-04', 17, BIG_SPRINGS),
    at('2026-09-05', 15, MAGOG),
    at('2026-09-06', 12, MAGOG),
    at('2026-09-06', 18, MAGOG),
    at('2026-09-07', 17, OG_LAKE),
    at('2026-09-08', 16, SUNSHINE),
    at('2026-09-09', 11, SUNSHINE),
    at('2026-09-09', 18, CANMORE),
    at('2026-09-10', 10, CANMORE),
    at('2026-09-10', 18, CANMORE),
  ]
}

describe('findBase', () => {
  it('finds where most days end', () => {
    const base = findBase(summarizeDays(rockiesStay(), 'America/Edmonton'))

    expect(base?.latitude).toBeCloseTo(CANMORE[0], 2)
    expect(base?.longitude).toBeCloseTo(CANMORE[1], 2)
  })

  it('has no base when every night is somewhere else', () => {
    const roadTrip = [
      at('2026-07-01', 18, [60.72, -135.05]), // Whitehorse
      at('2026-07-02', 18, [62.09, -136.29]), // Carmacks
      at('2026-07-03', 18, [64.06, -139.43]), // Dawson
    ]

    expect(findBase(summarizeDays(roadTrip, 'America/Whitehorse'))).toBeNull()
  })
})

describe('suggestTrips', () => {
  const { trips } = suggestTrips(
    summarizeDays(rockiesStay(), 'America/Edmonton'),
  )

  it('suggests the day hike from base', () => {
    expect(trips[0]).toMatchObject({
      dates: ['2026-09-02'],
      tripType: 'day',
    })
    expect(trips[0]?.reason.maxDistanceFromBaseKm).toBeGreaterThan(60)
  })

  it('suggests the multi-day trek including the walk back', () => {
    expect(trips[1]).toMatchObject({
      dates: [
        '2026-09-04',
        '2026-09-05',
        '2026-09-06',
        '2026-09-07',
        '2026-09-08',
        '2026-09-09',
      ],
      tripType: 'trek',
    })
    expect(trips[1]?.reason.avgDailyShiftKm).toBeLessThan(25)
  })

  it('does not turn days at base into trips', () => {
    const tripDates = trips.flatMap((trip) => trip.dates)

    expect(tripDates).not.toContain('2026-09-01')
    expect(tripDates).not.toContain('2026-09-03')
    expect(tripDates).not.toContain('2026-09-10')
    expect(trips).toHaveLength(2)
  })

  it('classifies fast multi-day movement away from base as a transfer', () => {
    const whitehorse = [60.72, -135.05] as const
    const { trips: northTrips } = suggestTrips(
      summarizeDays(
        [
          at('2026-07-01', 18, whitehorse),
          at('2026-07-02', 18, whitehorse),
          at('2026-07-03', 18, [62.09, -136.29]), // Carmacks
          at('2026-07-04', 18, [64.06, -139.43]), // Dawson
          at('2026-07-05', 18, [64.5, -138.2]), // Tombstone
        ],
        'America/Whitehorse',
      ),
    )

    expect(northTrips).toHaveLength(1)
    expect(northTrips[0]?.tripType).toBe('transfer')
    expect(northTrips[0]?.dates).toEqual([
      '2026-07-03',
      '2026-07-04',
      '2026-07-05',
    ])
  })

  it('suggests nothing for a journey without a base', () => {
    const result = suggestTrips(
      summarizeDays(
        [
          at('2026-07-01', 18, [60.72, -135.05]),
          at('2026-07-02', 18, [62.09, -136.29]),
        ],
        'America/Whitehorse',
      ),
    )

    expect(result).toEqual({ base: null, trips: [] })
  })
})
