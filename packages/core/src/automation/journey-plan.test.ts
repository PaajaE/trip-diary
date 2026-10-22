import { describe, expect, it } from 'vitest'
import type { GeoPoint } from './geo.ts'
import {
  planJourney,
  splitAtGaps,
  findJourneyTrips,
  type DayPlace,
  type JourneyDay,
} from './journey-plan.ts'
import { CS_NAME_LABELS, nameStage, nameTrip, tripNames } from './names.ts'

// All data is synthetic: invented positions, no real journey.

type Pair = readonly [number, number]

const HOME: Pair = [50, -119]
const FAR: Pair = [52.5, -122]

function north([lat, lon]: Pair, km: number, east = 0): GeoPoint {
  return { latitude: lat + km / 111, longitude: lon + east / 70 }
}

function plusDays(date: string, count: number): string {
  const time = Date.parse(`${date}T00:00:00Z`) + count * 86_400_000
  return new Date(time).toISOString().slice(0, 10)
}

let counter = 0

function day(
  offset: number,
  points: readonly GeoPoint[],
  places: DayPlace[] = [],
): JourneyDay {
  const first = points[0]
  const last = points[points.length - 1]
  if (first === undefined || last === undefined) throw new Error('no points')
  counter += 1
  return {
    centre: {
      latitude: points.reduce((sum, p) => sum + p.latitude, 0) / points.length,
      longitude:
        points.reduce((sum, p) => sum + p.longitude, 0) / points.length,
    },
    date: plusDays('2026-07-01', offset),
    first,
    last,
    mediaIds: [`m${String(counter)}`],
    photoCount: points.length,
    places,
    points: [...points],
    timeZone: 'Zone/A',
  }
}

const nature = (name: string, photos = 10): DayPlace => ({
  kind: 'natural',
  name,
  photos,
})
const town = (name: string, photos = 10): DayPlace => ({
  kind: 'settlement',
  name,
  photos,
})

/** Days at the base, one point each. */
function baseDays(from: number, count: number, places?: DayPlace[]) {
  return Array.from({ length: count }, (_, i) =>
    day(from + i, [north(HOME, 0), north(HOME, 0)], places),
  )
}

describe('splitAtGaps', () => {
  it('cuts at a long photo gap but not at a short one', () => {
    const days = [
      day(0, [north(HOME, 0)]),
      day(2, [north(HOME, 0)]),
      day(14, [north(FAR, 0)]),
      day(15, [north(FAR, 0)]),
    ]
    expect(splitAtGaps(days).map((run) => run.length)).toEqual([2, 2])
  })

  it('does not cut when the traveller returns to a base he slept at', () => {
    const days = [
      ...baseDays(0, 4),
      day(4, [north(HOME, 30)]),
      day(9, [north(HOME, 0)]),
    ]
    expect(splitAtGaps(days)).toHaveLength(1)
  })
})

describe('planJourney', () => {
  it('leaves a long photo gap uncovered', () => {
    const days = [
      ...baseDays(0, 5),
      ...Array.from({ length: 4 }, (_, i) => day(20 + i, [north(FAR, 0)])),
    ]
    const stages = planJourney(days)
    expect(stages.length).toBeGreaterThanOrEqual(2)
    for (const stage of stages) {
      const dates = stage.days.map((d) => d.date)
      expect(dates.some((d) => d <= '2026-07-05')).not.toBe(
        dates.some((d) => d >= '2026-07-21'),
      )
    }
    expect(stages.some((stage) => stage.gapAfter)).toBe(true)
  })

  it('recognises a short stage in nature as one trek', () => {
    const days = [
      ...baseDays(0, 6, [town('Hometown')]),
      day(30, [north(FAR, 0), north(FAR, 4)], [nature('Granite Peak', 20)]),
      day(31, [north(FAR, 6), north(FAR, 9)], [nature('Granite Peak', 20)]),
      day(32, [north(FAR, 11), north(FAR, 8)], [nature('Aster Lake', 20)]),
    ]
    const stage = planJourney(days).find((s) => s.kind === 'trek')
    expect(stage?.days.map((d) => d.date)).toEqual([
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ])
    expect(stage?.trips).toHaveLength(1)
    expect(stage?.trips[0]?.kind).toBe('trek')
  })

  it('keeps a base stay with repeated visits free of treks', () => {
    // Four overnight absences without place information: a base stay.
    const days: JourneyDay[] = []
    let offset = 0
    for (let round = 0; round < 4; round += 1) {
      days.push(...baseDays(offset, 3))
      offset += 3
      days.push(day(offset, [north(HOME, 20), north(HOME, 25)]))
      days.push(day(offset + 1, [north(HOME, 20), north(HOME, 2)]))
      offset += 2
    }
    days.push(...baseDays(offset, 3))
    const stages = planJourney(days)
    expect(stages.flatMap((s) => s.trips).some((t) => t.kind !== 'day')).toBe(
      false,
    )
    expect(stages.some((s) => s.kind === 'trek')).toBe(false)
  })

  it('finds a trek from a base only when a night is far and places are natural', () => {
    const away = (km: number, place: DayPlace) => [
      day(5, [north(HOME, km), north(HOME, km + 1)], [place]),
      day(6, [north(HOME, km + 2), north(HOME, km + 3)], [place]),
      day(7, [north(HOME, 1), north(HOME, 0)], [place]),
    ]
    const build = (km: number, place: DayPlace) =>
      findJourneyTrips([
        ...baseDays(0, 5, [town('Hometown')]),
        ...away(km, place),
        ...baseDays(8, 5, [town('Hometown')]),
      ])
    expect(build(20, nature('Granite Peak')).map((t) => t.kind)).toEqual([
      'trek',
    ])
    // a few km from the base is a long day trip, not a trek
    expect(build(6, nature('Granite Peak')).map((t) => t.kind)).not.toContain(
      'trek',
    )
    // a town is not a trek
    expect(build(20, town('Elsewhere')).map((t) => t.kind)).not.toContain(
      'trek',
    )
  })

  it('cuts the days of getting to a base off the stay', () => {
    const approach = Array.from({ length: 4 }, (_, i) =>
      day(i, [north(FAR, i * 40), north(FAR, i * 40 + 20)]),
    )
    const stages = planJourney([...approach, ...baseDays(4, 8)])
    expect(stages.length).toBeGreaterThanOrEqual(2)
    const stay = stages.find((s) => s.kind === 'stay')
    expect(stay?.days[0]?.date).toBe('2026-07-05')
  })

  it('treats a trail that names its length as a trek day', () => {
    const trips = findJourneyTrips([
      day(0, [north(HOME, 0)], [town('Hometown')]),
      day(1, [north(HOME, 20)], [nature('Ridge trail (3days)', 12)]),
      day(2, [north(HOME, 0)], [town('Hometown')]),
    ])
    expect(trips.map((t) => t.kind)).toEqual(['trek'])
  })
})

describe('single-day stages', () => {
  it('merges a one-day stage into the following stage', () => {
    const days = [
      ...baseDays(0, 5),
      day(5, [north(HOME, 60)]),
      ...Array.from({ length: 5 }, (_, i) =>
        day(6 + i, [north(HOME, 120), north(HOME, 121)]),
      ),
    ]
    const stages = planJourney(days)
    expect(stages.every((stage) => stage.days.length > 1)).toBe(true)
  })

  it('keeps a long-haul day as its own stage', () => {
    const far = { latitude: 50, longitude: 14 }
    const days = [
      day(0, [far, north(HOME, 0)]),
      ...Array.from({ length: 5 }, (_, i) => day(1 + i, [north(HOME, 0)])),
    ]
    const first = planJourney(days)[0]
    expect(first?.days).toHaveLength(1)
  })
})

describe('place names', () => {
  it('prefers settlements over nature in a stage name', () => {
    const days = [
      day(0, [north(HOME, 0)], [nature('Big Peak', 90), town('Banff', 5)]),
      day(1, [north(HOME, 5)], [town('Field', 4), nature('Lake Ice', 50)]),
    ]
    const stage = {
      centre: north(HOME, 0),
      days,
      gapAfter: true,
      kind: 'region' as const,
      radiusKm: 5,
      reason: '',
      trips: [],
    }
    expect(nameStage(stage)).toBe('Banff a Field')
  })

  it('names a trek stage after its main natural place', () => {
    const trekDays = [
      day(0, [north(HOME, 0)], [nature('Aster Peak', 9), town('Hut', 20)]),
    ]
    expect(
      nameStage({ ...stage('region'), days: trekDays, kind: 'trek' }),
    ).toBe('Trek kolem Aster Peak')
  })

  it('uses only settlements for travel and borrows a missing end', () => {
    const near: DayPlace = { kind: 'near', name: 'Elsewhere', photos: 50 }
    const travelDays = [day(0, [north(HOME, 0)], [town('Calgary', 5), near])]
    const next = {
      ...stage('region'),
      days: [day(1, [north(HOME, 60)], [town('Banff', 5)])],
    }
    expect(
      nameStage({ ...stage('transfer'), days: travelDays }, CS_NAME_LABELS, {
        next,
      }),
    ).toBe('Calgary → Banff')
  })

  it('names a long transfer by countries', () => {
    const far = { latitude: 50, longitude: 14 }
    const days = [
      day(
        0,
        [far, north(HOME, 0)],
        [
          { country: 'CZ', kind: 'settlement', name: 'Praha', photos: 3 },
          { country: 'CA', kind: 'settlement', name: 'Calgary', photos: 3 },
        ],
      ),
    ]
    expect(nameStage({ ...stage('transfer'), days })).toBe('Česko → Kanada')
  })

  it('names a stay from a settlement or near town, never a viewpoint', () => {
    const days = baseDays(0, 4, [
      { kind: 'attraction', name: 'Hill Viewpoint', photos: 99 },
      { kind: 'near', name: 'Smalltown', photos: 5 },
    ])
    expect(nameStage({ ...stage('stay'), days })).toBe('Pobyt Smalltown')
    const nat = baseDays(0, 4, [
      { kind: 'natural', name: 'Aster Lake Viewpoint', photos: 9 },
    ])
    expect(nameStage({ ...stage('stay'), days: nat })).toBe('Pobyt Aster Lake')
  })

  it('offers further places for a trip name', () => {
    const trip = {
      awayKm: 20,
      days: [day(0, [north(HOME, 0)], [town('Vernon', 9), town('Fintry', 4)])],
      kind: 'day' as const,
    }
    expect(tripNames(trip)).toEqual(['Výlet: Vernon', 'Výlet: Fintry'])
  })

  const days = [
    day(0, [north(HOME, 0)], [town('Banff', 30), town('Yoho', 20)]),
    day(1, [north(HOME, 5)], [town('Banff', 5), town('Field', 2)]),
  ]
  const stage = (kind: 'region' | 'stay' | 'transfer') => ({
    centre: north(HOME, 0),
    days,
    gapAfter: true,
    kind,
    radiusKm: 5,
    reason: '',
    trips: [],
  })

  it('names a stage by its two most photographed places', () => {
    expect(nameStage(stage('region'))).toBe('Banff a Yoho')
  })

  it('names a travel stage from first to last settlement', () => {
    const travelDays = [
      day(0, [north(HOME, 0)], [town('Calgary', 5)]),
      day(1, [north(HOME, 50)], [town('Banff', 5)]),
    ]
    expect(nameStage({ ...stage('transfer'), days: travelDays })).toBe(
      'Calgary → Banff',
    )
  })

  it('names a stay from its settlement and a trek from its peak', () => {
    expect(nameStage(stage('stay'))).toBe('Pobyt Banff')
    const trek = {
      awayKm: 10,
      days: [
        day(0, [north(HOME, 0)], [nature('Aster Peak', 9), town('Hut', 20)]),
      ],
      kind: 'trek' as const,
    }
    expect(nameTrip(trek)).toBe('Trek: Aster Peak')
    expect(
      nameTrip({ ...trek, days: [day(0, [north(HOME, 0)], [town('Hut', 3)])] }),
    ).toBe('Trek kolem Hut')
  })

  it('returns null without place information and honours custom labels', () => {
    expect(
      nameStage({ ...stage('region'), days: [day(0, [north(HOME, 0)])] }),
    ).toBeNull()
    expect(
      nameStage(stage('stay'), { ...CS_NAME_LABELS, stay: (n) => `Stay ${n}` }),
    ).toBe('Stay Banff')
  })

  it('ignores region and country names', () => {
    const only = [
      day(
        0,
        [north(HOME, 0)],
        [{ kind: 'region', name: 'Yukon', photos: 99 }, town('Dawson', 1)],
      ),
    ]
    expect(nameStage({ ...stage('region'), days: only })).toBe('Dawson')
  })
})
