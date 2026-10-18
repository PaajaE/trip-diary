import { describe, expect, it } from 'vitest'
import { distanceKm, type GeoPoint } from './geo.ts'
import {
  autoBeta,
  daysBetween,
  planStages,
  stayBase,
  type PlannedStage,
  type StageDay,
} from './stages.ts'

// All data below is synthetic: invented positions, a seeded generator.

type Pair = readonly [number, number]

function rng(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296
    return state / 4_294_967_296
  }
}

let random = rng(1)

function jitter([lat, lon]: Pair, radius = 0.02): GeoPoint {
  return {
    latitude: lat + (random() * 2 - 1) * radius,
    longitude: lon + (random() * 2 - 1) * radius,
  }
}

/** A point `km` kilometres north of `from`. */
function north([lat, lon]: Pair, km: number): Pair {
  return [lat + km / 111, lon]
}

function plusDays(date: string, count: number): string {
  const time = Date.parse(`${date}T00:00:00Z`) + count * 86_400_000
  return new Date(time).toISOString().slice(0, 10)
}

let counter = 0

function reset(): void {
  random = rng(1)
  counter = 0
}

function day(
  date: string,
  points: readonly GeoPoint[],
  timeZone = 'Zone/A',
): StageDay {
  const first = points[0]
  const last = points[points.length - 1]
  if (first === undefined || last === undefined) throw new Error('no points')
  const centre = {
    latitude: points.reduce((sum, p) => sum + p.latitude, 0) / points.length,
    longitude: points.reduce((sum, p) => sum + p.longitude, 0) / points.length,
  }
  counter += 1
  return {
    centre,
    date,
    first,
    last,
    mediaIds: [`m${String(counter)}`],
    photoCount: points.length,
    points: [...points],
    timeZone,
  }
}

function dates(plan: readonly PlannedStage[]) {
  return plan.map((stage) => [
    stage.days[0]?.date,
    stage.days[stage.days.length - 1]?.date,
    stage.kind,
  ])
}

const START = '2026-07-01'
const A: Pair = [50, -119]
const B: Pair = [52, -122]

/** Base scenario of the prototype: stay with trips, transfer, second stay. */
function baseScenario(zoneB = 'Zone/B'): StageDay[] {
  reset()
  const days: StageDay[] = []
  let offset = 0
  const push = (points: GeoPoint[], zone = 'Zone/A') => {
    days.push(day(plusDays(START, offset), points, zone))
    offset += 1
  }
  for (const away of [0, 30, 0, 40, 25]) {
    // two quiet days, three day trips of 25-40 km
    push([jitter(A), ...(away > 0 ? [jitter(north(A, away))] : []), jitter(A)])
  }
  for (let i = 0; i < 6; i += 1) {
    // six day trek: out and back, about 8 km a day
    const p: Pair = [
      i < 3 ? A[0] + 0.45 + 0.05 * i : A[0] + 0.45 + 0.05 * (5 - i),
      A[1] + 0.2,
    ]
    push([jitter(p, 0.01), jitter([p[0] + 0.03, p[1]], 0.01)])
  }
  for (let i = 0; i < 3; i += 1) push([jitter(A), jitter(A)])
  for (let i = 0; i < 3; i += 1) {
    // transfer towards B, about a quarter of the way each day
    const p: Pair = [
      A[0] + ((B[0] - A[0]) * (i + 1)) / 4,
      A[1] + ((B[1] - A[1]) * (i + 1)) / 4,
    ]
    push([jitter(p), jitter(p)])
  }
  for (let i = 0; i < 4; i += 1) push([jitter(B), jitter(B)], zoneB)
  return days
}

describe('planStages: base scenario', () => {
  const plan = planStages(baseScenario())

  it('finds a stay, a transfer and a second stay', () => {
    expect(dates(plan)).toEqual([
      ['2026-07-01', '2026-07-14', 'stay'],
      ['2026-07-15', '2026-07-17', 'transfer'],
      ['2026-07-18', '2026-07-21', 'stay'],
    ])
  })

  it('finds day trips and the trek inside the first stay', () => {
    const trips = plan[0]?.trips.map((trip) => [trip.kind, trip.days.length])
    expect(trips).toEqual([
      ['day', 1],
      ['day', 1],
      ['day', 1],
      ['trek', 7], // six days out plus the day back at the base
    ])
    expect(plan[1]?.trips).toEqual([])
  })

  it('does not depend on the zone for this layout, only on a boundary', () => {
    expect(dates(planStages(baseScenario('Zone/A')))).toEqual(dates(plan))
  })

  it('is deterministic', () => {
    expect(planStages(baseScenario())).toEqual(planStages(baseScenario()))
  })
})

/** Eight roaming days in a region, optional far detour, six more days. */
function roamingDays(detourKm: number | null, detourDays = 3): StageDay[] {
  reset()
  const centre: Pair = [45, 10]
  const days: StageDay[] = []
  let offset = 0
  const add = (p: Pair) => {
    days.push(day(plusDays(START, offset), [jitter(p, 0.05), jitter(p, 0.05)]))
    offset += 1
  }
  const around = (index: number): Pair => [
    centre[0] + 0.2 * Math.sin(index),
    centre[1] + 0.35 * index - 1.5,
  ]
  for (let i = 0; i < 8; i += 1) add(around(i))
  if (detourKm !== null) {
    for (let i = 0; i < detourDays; i += 1) {
      add(north([45, 10], detourKm + i * 20))
    }
  }
  for (let i = 8; i < 14; i += 1) add(around(i - 3))
  return days
}

describe('planStages: detours and regions', () => {
  it('keeps a far detour (>100 km) as its own stage', () => {
    const plan = planStages(roamingDays(300))
    expect(plan.map((stage) => stage.kind)).toEqual([
      'region',
      'detour',
      'region',
    ])
    expect(plan[1]?.days).toHaveLength(3)
  })

  it('folds a local detour (12-100 km, back within a week) into the stay', () => {
    const days: StageDay[] = []
    for (let i = 0; i < 12; i += 1) {
      const far = i >= 5 && i <= 6
      const p: Pair = far ? north(A, 60) : A
      days.push(day(plusDays(START, i), [jitter(p), jitter(p)]))
    }
    const plan = planStages(days, { beta: 2000 })
    expect(plan).toHaveLength(1)
    expect(plan[0]?.kind).toBe('stay')
    expect(plan[0]?.trips.map((trip) => trip.kind)).toEqual(['trek'])
    expect(plan[0]?.trips[0]?.days).toHaveLength(2)
  })
})

describe('planStages: silence', () => {
  function twoBlocks(secondAt: Pair): StageDay[] {
    return [
      ...Array.from({ length: 5 }, (_, i) =>
        day(plusDays(START, i), [jitter(A), jitter(A)]),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        day(plusDays(START, 14 + i), [jitter(secondAt), jitter(secondAt)]),
      ),
    ]
  }

  it('a week of silence at the same place stays one stay', () => {
    const plan = planStages(twoBlocks(A))
    expect(dates(plan)).toEqual([['2026-07-01', '2026-07-19', 'stay']])
  })

  it('a week of silence with a move over 25 km is a boundary', () => {
    const plan = planStages(twoBlocks(north(A, 40)))
    expect(plan).toHaveLength(2)
    expect(plan[0]?.days).toHaveLength(5)
    expect(plan[1]?.days[0]?.date).toBe('2026-07-15')
  })
})

describe('planStages: spike days', () => {
  it('isolates a far one-day visit between two stays at one place', () => {
    const days = [
      ...Array.from({ length: 5 }, (_, i) =>
        day(plusDays(START, i), [jitter(A), jitter(A)]),
      ),
      day(plusDays(START, 5), [jitter(north(A, 400)), jitter(north(A, 400))]),
      ...Array.from({ length: 5 }, (_, i) =>
        day(plusDays(START, 6 + i), [jitter(A), jitter(A)]),
      ),
    ]
    const plan = planStages(days)
    // out and back to the same place: the day stays its own stage (a detour)
    expect(dates(plan)).toEqual([
      ['2026-07-01', '2026-07-05', 'stay'],
      ['2026-07-06', '2026-07-06', 'detour'],
      ['2026-07-07', '2026-07-11', 'stay'],
    ])
  })

  it('marks a lone far stop between two different places as a remote stop', () => {
    const C = north(A, 400)
    const days = [
      ...Array.from({ length: 5 }, (_, i) =>
        day(plusDays(START, i), [jitter(A), jitter(A)]),
      ),
      day(plusDays(START, 5), [jitter(north(A, 200)), jitter(north(A, 200))]),
      ...Array.from({ length: 5 }, (_, i) =>
        day(plusDays(START, 6 + i), [jitter(C), jitter(C)]),
      ),
    ]
    expect(dates(planStages(days))).toEqual([
      ['2026-07-01', '2026-07-05', 'stay'],
      ['2026-07-06', '2026-07-06', 'remoteStop'],
      ['2026-07-07', '2026-07-11', 'stay'],
    ])
  })
})

describe('planStages: arrival', () => {
  it('splits the arrival city after a flight of over 600 km', () => {
    const home: Pair = [48, 16]
    const city: Pair = [45, -75]
    const days: StageDay[] = []
    for (let i = 0; i < 3; i += 1) {
      days.push(day(plusDays(START, i), [jitter(home), jitter(home)], 'Zone/H'))
    }
    for (let i = 0; i < 2; i += 1) {
      days.push(
        day(
          plusDays(START, 3 + i),
          Array.from({ length: 6 }, () => jitter(city, 0.05)),
          'Zone/F',
        ),
      )
    }
    for (let i = 0; i < 5; i += 1) {
      // a road trip around an area about 150 km from the city
      const p: Pair = [city[0] + 0.3 * (i % 2), city[1] + 2 + 0.2 * i]
      days.push(day(plusDays(START, 5 + i), [jitter(p, 0.1)], 'Zone/F'))
    }
    const plan = planStages(days, { beta: 60_000 })
    const arrival = plan.find((stage) => stage.kind === 'arrival')
    expect(arrival?.days.map((d) => d.date)).toEqual([
      '2026-07-04',
      '2026-07-05',
    ])
    expect(plan[0]?.days).toHaveLength(3)
  })

  it('does not split a gateway when no long arrival precedes it', () => {
    const city: Pair = [45, -75]
    const days: StageDay[] = [
      ...Array.from({ length: 2 }, (_, i) =>
        day(
          plusDays(START, i),
          Array.from({ length: 6 }, () => jitter(city, 0.05)),
        ),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        day(plusDays(START, 2 + i), [
          jitter([city[0], city[1] + 1.8 + 1.0 * i], 0.05),
        ]),
      ),
    ]
    expect(planStages(days).some((stage) => stage.kind === 'arrival')).toBe(
      false,
    )
  })
})

describe('helpers', () => {
  it('counts whole days between dates', () => {
    expect(daysBetween('2026-02-27', '2026-03-02')).toBe(3)
  })

  it('finds the base only with two evenings close together', () => {
    const one = [day('2026-07-01', [jitter(A)])]
    expect(stayBase(one)).toBeNull()
    const two = [...one, day('2026-07-02', [jitter(A)])]
    const base = stayBase(two)
    expect(
      base && distanceKm(base, { latitude: 50, longitude: -119 }),
    ).toBeLessThan(8)
  })

  it('chooses a penalty that gives an average stage of about a week', () => {
    const beta = autoBeta(baseScenario())
    expect(beta).toBeGreaterThan(0)
    expect(planStages(baseScenario(), { beta }).length).toBeLessThanOrEqual(3)
  })

  it('returns nothing for no days', () => {
    expect(planStages([])).toEqual([])
  })
})
