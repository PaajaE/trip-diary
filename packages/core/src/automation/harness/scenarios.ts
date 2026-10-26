import type { MediaPoint } from '../media-point.ts'

/**
 * ZS-0 measurement harness: 24 synthetic scenarios (A-X) plus two extras
 * (Y video, Z Live Photo). Every scenario is a pure generator driven by a
 * seeded PRNG: no Date.now, no Math.random, so the output is reproducible.
 */

/** A media point as the harness feeds it to an algorithm. */
export interface HarnessPoint extends MediaPoint {
  /** Person who took it (stream key for parallel stops). */
  author: string
  capturedAt: string
  /** Normalised device (EXIF make + model); streams per device. */
  device: string
  /** Video length; the video occupies [capturedAt, capturedAt + duration]. */
  durationMs?: number
  kind: 'photo' | 'video'
}

export interface Scenario {
  /** What the ideal result looks like, in words. */
  expectation: string
  /**
   * In-day trips the algorithm must find (ZS-4), as trip types in time order;
   * empty = none (a walk or ride below 90 min / 3 km is no trip).
   */
  expectedTrips: ('day' | 'trek' | 'walk')[]
  /** Expected stop groups (media ids). Photos in no group are unconstrained. */
  expectedGroups: string[][]
  id: string
  /** Short human readable name. */
  label: string
  /** Pairs that are one Live Photo (must end up together, one logical point). */
  livePairs: [string, string][]
  /** Today's `clusterMoments` is known to miss the expectation (plan 4f). */
  knownFailingToday: boolean
  points: HarnessPoint[]
  /** Edits tolerated while still counting as a pass (scenario L only). */
  toleranceEdits: number
  /** Photos taken while moving; they must not become single-photo stops. */
  transitIds: string[]
  /** IANA zone of the scene (documentation; times are UTC instants). */
  zone: string
}

// ---------------------------------------------------------------------------
// Seeded PRNG and small builders
// ---------------------------------------------------------------------------

/** mulberry32: tiny deterministic PRNG returning [0, 1). */
export function createRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ORIGIN = { latitude: 50.08, longitude: 14.42 }
const METERS_PER_DEGREE = 111_320
const MINUTE_MS = 60_000
const DEFAULT_START_MS = Date.UTC(2026, 5, 12, 8, 0, 0)

function locate(eastM: number, northM: number): [number, number] {
  const latitude = ORIGIN.latitude + northM / METERS_PER_DEGREE
  const longitude =
    ORIGIN.longitude +
    eastM / (METERS_PER_DEGREE * Math.cos((latitude * Math.PI) / 180))
  return [latitude, longitude]
}

interface AddSpec {
  author?: string
  device?: string
  durationMs?: number
  east: number
  /** Default true; false = no coordinates at all. */
  gps?: boolean
  jitterM?: number
  kind?: 'photo' | 'video'
  /** Minutes from the scenario start (may be negative / fractional). */
  minute: number
  north: number
}

interface Builder {
  add(spec: AddSpec): string
  readonly points: HarnessPoint[]
  relocate(id: string, east: number, north: number): void
  readonly rng: () => number
}

function createBuilder(
  prefix: string,
  seed: number,
  startMs: number = DEFAULT_START_MS,
): Builder {
  const rng = createRng(seed)
  const points: HarnessPoint[] = []
  return {
    add(spec) {
      const id = `${prefix}${String(points.length + 1).padStart(4, '0')}`
      const jitter = spec.jitterM ?? 15
      // Always draw twice so the stream does not depend on the gps flag.
      const dEast = (rng() * 2 - 1) * jitter
      const dNorth = (rng() * 2 - 1) * jitter
      const hasGps = spec.gps ?? true
      const [latitude, longitude] = locate(
        spec.east + dEast,
        spec.north + dNorth,
      )
      const point: HarnessPoint = {
        author: spec.author ?? 'anna',
        // toISOString only formats the synthetic instant; no clock is read.
        capturedAt: new Date(
          startMs + Math.round(spec.minute * MINUTE_MS),
        ).toISOString(),
        device: spec.device ?? 'phone',
        id,
        kind: spec.kind ?? 'photo',
        latitude: hasGps ? latitude : null,
        longitude: hasGps ? longitude : null,
      }
      if (spec.durationMs !== undefined) point.durationMs = spec.durationMs
      points.push(point)
      return id
    },
    points,
    relocate(id, east, north) {
      const point = points.find((item) => item.id === id)
      if (point === undefined) return
      const [latitude, longitude] = locate(east, north)
      point.latitude = latitude
      point.longitude = longitude
    },
    rng,
  }
}

/** Where the photographer is and what time it is (minutes, metres). */
interface Cursor {
  east: number
  minute: number
  north: number
}

interface StayOptions {
  author?: string
  device?: string
  gps?: boolean
  jitterM?: number
}

/** `count` photos at the cursor, `spacing` minutes apart. */
function stay(
  b: Builder,
  c: Cursor,
  count: number,
  spacing: number,
  options: StayOptions = {},
): string[] {
  const ids: string[] = []
  for (let index = 0; index < count; index += 1) {
    if (index > 0) c.minute += spacing
    ids.push(
      b.add({ east: c.east, minute: c.minute, north: c.north, ...options }),
    )
  }
  return ids
}

/** Moves the cursor without taking photos. */
function travel(c: Cursor, minutes: number, dEast: number, dNorth = 0): void {
  c.minute += minutes
  c.east += dEast
  c.north += dNorth
}

interface DriveOptions {
  dEast: number
  dNorth?: number
  /** Minutes after the start of the leg of the first photo. */
  firstAt?: number
  minutes: number
  /** Photo cadence in minutes; 0 = no photos on the way. */
  photoEvery: number
}

/** Straight leg with a photo every `photoEvery` minutes; returns their ids. */
function drive(b: Builder, c: Cursor, options: DriveOptions): string[] {
  const ids: string[] = []
  const dNorth = options.dNorth ?? 0
  if (options.photoEvery > 0) {
    for (
      let at = options.firstAt ?? 0;
      at < options.minutes;
      at += options.photoEvery
    ) {
      const share = at / options.minutes
      ids.push(
        b.add({
          east: c.east + options.dEast * share,
          minute: c.minute + at,
          north: c.north + dNorth * share,
        }),
      )
    }
  }
  travel(c, options.minutes, options.dEast, dNorth)
  return ids
}

// ---------------------------------------------------------------------------
// Scenarios A-Z
// ---------------------------------------------------------------------------

type ScenarioCore = Pick<
  Scenario,
  'expectation' | 'expectedGroups' | 'id' | 'label' | 'points'
> &
  Partial<
    Pick<
      Scenario,
      | 'expectedTrips'
      | 'knownFailingToday'
      | 'livePairs'
      | 'toleranceEdits'
      | 'transitIds'
      | 'zone'
    >
  >

function scenario(core: ScenarioCore): Scenario {
  return {
    expectation: core.expectation,
    expectedGroups: core.expectedGroups,
    expectedTrips: core.expectedTrips ?? [],
    id: core.id,
    knownFailingToday: core.knownFailingToday ?? false,
    label: core.label,
    livePairs: core.livePairs ?? [],
    points: core.points,
    toleranceEdits: core.toleranceEdits ?? 0,
    transitIds: core.transitIds ?? [],
    zone: core.zone ?? 'Europe/Prague',
  }
}

function start(): Cursor {
  return { east: 0, minute: 0, north: 0 }
}

function scenarioA(): Scenario {
  const b = createBuilder('A', 101)
  const c = start()
  const groups: string[][] = []
  for (let sight = 0; sight < 8; sight += 1) {
    groups.push(stay(b, c, 6, 1.5, { jitterM: 25 }))
    travel(c, 6, 400)
  }
  return scenario({
    expectation: '8 stops',
    expectedGroups: groups,
    id: 'A',
    knownFailingToday: true,
    label: 'City walk, 8 sights 400 m apart, 6 photos each',
    points: b.points,
  })
}

function scenarioB(): Scenario {
  const b = createBuilder('B', 102)
  const ids: string[] = []
  for (let index = 0; index < 30; index += 1) {
    const share = index / 29
    ids.push(
      b.add({
        east: 10_000 * share,
        jitterM: 40,
        minute: index * 12,
        north: 600 * Math.sin(share * Math.PI * 3),
      }),
    )
  }
  return scenario({
    expectation: '1 trip',
    expectedGroups: [ids],
    expectedTrips: ['trek'],
    id: 'B',
    knownFailingToday: true,
    label: 'Trek 6 h / 10 km, photo every 12 min',
    points: b.points,
  })
}

function scenarioC(): Scenario {
  const b = createBuilder('C', 103)
  const c = start()
  const groups: string[][] = []
  const transit: string[] = []
  for (let leg = 0; leg < 3; leg += 1) {
    transit.push(
      ...drive(b, c, {
        dEast: 60_000,
        firstAt: 10,
        minutes: 40,
        photoEvery: 20,
      }),
    )
    if (leg < 2) {
      groups.push(stay(b, c, 3, 2, { jitterM: 30 }))
      c.minute += 12
    }
  }
  return scenario({
    expectation: '2 stops + transit',
    expectedGroups: groups,
    id: 'C',
    knownFailingToday: true,
    label: 'Drive 180 km, window photo every 20 min + 2 viewpoints',
    points: b.points,
    transitIds: transit,
  })
}

function scenarioD(): Scenario {
  const b = createBuilder('D', 104)
  const c = start()
  const ids = stay(b, c, 20, 1, { jitterM: 30 })
  const bad = ids[10]
  if (bad !== undefined) b.relocate(bad, 0, 25_000)
  return scenario({
    expectation: '1 stop (the bad fix keeps its time, loses its place)',
    expectedGroups: [ids],
    id: 'D',
    knownFailingToday: true,
    label: 'One bad GPS fix 25 km away inside a 20-photo stop',
    points: b.points,
  })
}

function scenarioE(): Scenario {
  const b = createBuilder('E', 105)
  const ids: string[] = []
  for (let index = 0; index < 10; index += 1) {
    ids.push(b.add({ east: 0, minute: index * 4, north: 0 }))
    ids.push(
      b.add({
        device: 'camera',
        east: 0,
        gps: false,
        minute: index * 4 + 2,
        north: 0,
      }),
    )
  }
  return scenario({
    expectation: '1 stop',
    expectedGroups: [ids],
    id: 'E',
    label: 'Phone with GPS + camera without GPS interleaved',
    points: b.points,
  })
}

function scenarioF(): Scenario {
  const b = createBuilder('F', 106)
  const c = start()
  const ids = stay(b, c, 3, 1, { jitterM: 20 })
  c.minute += 120
  ids.push(...stay(b, c, 3, 1, { jitterM: 20 }))
  return scenario({
    expectation: '1 stop',
    expectedGroups: [ids],
    id: 'F',
    label: 'Lunch, 2 h pause at the same place',
    points: b.points,
  })
}

function scenarioG(): Scenario {
  const b = createBuilder('G', 107)
  const c = start()
  const ids = drive(b, c, { dEast: 25_000, minutes: 75, photoEvery: 10 })
  return scenario({
    expectation: '1 ride',
    expectedGroups: [ids],
    id: 'G',
    knownFailingToday: true,
    label: 'Bike 25 km, photo every 10 min',
    points: b.points,
  })
}

function scenarioH(): Scenario {
  const b = createBuilder('H', 108)
  const c = start()
  const ride = drive(b, c, {
    dEast: 180_000,
    firstAt: 7,
    minutes: 90,
    photoEvery: 15,
  })
  const arrival = stay(b, c, 5, 2, { jitterM: 30 })
  return scenario({
    expectation: 'ride (transit) + 1 stop',
    expectedGroups: [arrival],
    id: 'H',
    knownFailingToday: true,
    label: 'Train 180 km + arrival',
    points: b.points,
    transitIds: ride,
  })
}

function scenarioI(): Scenario {
  const b = createBuilder('I', 109)
  const c = start()
  const groups: string[][] = []
  const transit: string[] = []
  for (let sight = 0; sight < 3; sight += 1) {
    groups.push(stay(b, c, 4, 1.5, { jitterM: 25 }))
    travel(c, 8, 500)
  }
  c.minute += 10
  transit.push(
    ...drive(b, c, { dEast: 50_000, firstAt: 10, minutes: 40, photoEvery: 20 }),
  )
  // 4 h loop trek that starts and ends at the car park.
  const parking = { east: c.east, north: c.north }
  const trek: string[] = []
  const radius = 1500
  for (let index = 0; index <= 8; index += 1) {
    const angle = (2 * Math.PI * index) / 8
    trek.push(
      b.add({
        east: parking.east + radius * (1 - Math.cos(angle)),
        jitterM: 30,
        minute: c.minute + index * 30,
        north: parking.north + radius * Math.sin(angle),
      }),
    )
  }
  groups.push(trek)
  c.minute += 250
  transit.push(
    ...drive(b, c, { dEast: 50_000, firstAt: 10, minutes: 40, photoEvery: 20 }),
  )
  groups.push(stay(b, c, 5, 8, { jitterM: 20 }))
  return scenario({
    expectation: '3 city stops + trek trip + dinner stop, drives are transit',
    expectedGroups: groups,
    expectedTrips: ['trek'],
    id: 'I',
    knownFailingToday: true,
    label: 'Day: city, car, 4 h loop trek, car, dinner',
    points: b.points,
    transitIds: transit,
  })
}

function scenarioJ(): Scenario {
  const b = createBuilder('J', 110)
  const c = start()
  const groups: string[][] = []
  for (const size of [3, 2, 3, 2]) {
    groups.push(stay(b, c, size, 45, { jitterM: 40 }))
    travel(c, 45, 1000)
  }
  return scenario({
    expectation: '4 stops (3-5 acceptable; the generator knows 4 places)',
    expectedGroups: groups,
    id: 'J',
    knownFailingToday: true,
    label: 'Sparse day, 1 photo / 45 min over 3 km',
    points: b.points,
  })
}

function scenarioK(): Scenario {
  const b = createBuilder('K', 111)
  const c = start()
  const first = stay(b, c, 6, 3, { gps: false })
  c.minute += 120
  const second = stay(b, c, 6, 3, { gps: false })
  return scenario({
    expectation: '2 groups',
    expectedGroups: [first, second],
    id: 'K',
    label: 'No GPS, 2 h gap',
    points: b.points,
  })
}

function scenarioL(): Scenario {
  const b = createBuilder('L', 112)
  const c = start()
  const ids: string[] = []
  for (let pair = 0; pair < 4; pair += 1) {
    ids.push(...stay(b, c, 2, 1, { jitterM: 20 }))
    travel(c, 29, 300)
  }
  return scenario({
    expectation: '1 or a few groups (tolerance 3 edits = up to 4 groups)',
    expectedGroups: [ids],
    id: 'L',
    label: 'Street walk, 2 photos / 30 min',
    points: b.points,
    toleranceEdits: 3,
  })
}

function scenarioM(): Scenario {
  const b = createBuilder('M', 113)
  const c = start()
  const groups: string[][] = []
  for (let stop = 0; stop < 6; stop += 1) {
    groups.push(stay(b, c, 2, 1, { jitterM: 30 }))
    drive(b, c, { dEast: 70_000, minutes: 47, photoEvery: 0 })
  }
  return scenario({
    expectation: '6 stops',
    expectedGroups: groups,
    id: 'M',
    label: 'Roadtrip, 2-photo stops every 70 km',
    points: b.points,
  })
}

function scenarioN(): Scenario {
  const b = createBuilder('N', 114)
  const ids: string[] = []
  for (let index = 0; index < 8; index += 1) {
    ids.push(b.add({ east: 0, minute: index * 2, north: 0 }))
    ids.push(
      b.add({
        device: 'camera',
        east: 0,
        gps: false,
        minute: index * 2 + 1 - 180,
        north: 0,
      }),
    )
  }
  return scenario({
    expectation: '1 stop (clock shift is only proposed, never silent)',
    expectedGroups: [ids],
    id: 'N',
    knownFailingToday: true,
    label: 'Phone with GPS + camera without GPS, camera clock -3 h',
    points: b.points,
  })
}

function scenarioO(): Scenario {
  const b = createBuilder('O', 115)
  const c = start()
  const ids = stay(b, c, 6, 2)
  c.minute += 40
  ids.push(...stay(b, c, 6, 2, { device: 'camera', gps: false }))
  return scenario({
    expectation: '1 stop',
    expectedGroups: [ids],
    id: 'O',
    knownFailingToday: true,
    label: 'Camera without GPS 40 min after the phone, same place',
    points: b.points,
  })
}

function scenarioP(): Scenario {
  const b = createBuilder('P', 116)
  const annaIds: string[] = []
  const bobIds: string[] = []
  for (let index = 0; index < 20; index += 1) {
    annaIds.push(b.add({ east: 0, jitterM: 40, minute: index * 6, north: 0 }))
    bobIds.push(
      b.add({
        author: 'bob',
        device: 'phone-bob',
        east: 20_000,
        jitterM: 40,
        minute: index * 6 + 3,
        north: 0,
      }),
    )
  }
  return scenario({
    expectation: '2 parallel stops (one per person)',
    expectedGroups: [annaIds, bobIds],
    id: 'P',
    knownFailingToday: true,
    label: 'Two phones 20 km apart, alternating every 3 min',
    points: b.points,
  })
}

function scenarioQ(): Scenario {
  const b = createBuilder('Q', 117)
  const ids: string[] = []
  for (let index = 0; index < 10; index += 1) {
    ids.push(b.add({ east: 0, jitterM: 30, minute: index * 6, north: 0 }))
    ids.push(
      b.add({
        author: 'bob',
        device: 'phone-bob',
        east: 600,
        jitterM: 30,
        minute: index * 6 + 3,
        north: 0,
      }),
    )
  }
  return scenario({
    expectation: '1 stop',
    expectedGroups: [ids],
    id: 'Q',
    label: 'Two phones 600 m apart',
    points: b.points,
  })
}

function scenarioR(): Scenario {
  // 23:30 CEST = 21:30 UTC; the party crosses local midnight.
  const b = createBuilder('R', 118, Date.UTC(2026, 5, 12, 21, 30, 0))
  const c = start()
  const ids = stay(b, c, 12, 6, { jitterM: 40 })
  return scenario({
    expectation: '1 evening',
    expectedGroups: [ids],
    id: 'R',
    label: 'Party 23:30-00:40 local',
    points: b.points,
  })
}

function scenarioS(): Scenario {
  const b = createBuilder('S', 119)
  const c = start()
  const ids = drive(b, c, { dEast: 5000, minutes: 56, photoEvery: 4 })
  return scenario({
    expectation: '1 walk',
    expectedGroups: [ids],
    id: 'S',
    label: 'Promenade 5 km, photo every 4 min',
    points: b.points,
  })
}

function scenarioT(): Scenario {
  const b = createBuilder('T', 120)
  const c = start()
  const ids = stay(b, c, 5, 3, { jitterM: 30 })
  c.minute += 50
  ids.push(...stay(b, c, 5, 3, { jitterM: 30 }))
  return scenario({
    expectation: '1 stop',
    expectedGroups: [ids],
    id: 'T',
    label: 'Museum, 50 min gap inside',
    points: b.points,
  })
}

function scenarioU(): Scenario {
  const b = createBuilder('U', 121)
  const groups: string[][] = []
  for (let index = 0; index < 8; index += 1) {
    groups.push([b.add({ east: index * 1000, minute: index * 12, north: 0 })])
  }
  return scenario({
    expectation: '8 single-photo stops',
    expectedGroups: groups,
    id: 'U',
    knownFailingToday: true,
    label: 'Selection: 8 single photos ~1 km apart',
    points: b.points,
  })
}

function scenarioV(): Scenario {
  const b = createBuilder('V', 122)
  const groups: string[][] = []
  for (let index = 0; index < 6; index += 1) {
    groups.push([b.add({ east: index * 25_000, minute: index * 20, north: 0 })])
  }
  return scenario({
    expectation: '6 single-photo stops',
    expectedGroups: groups,
    id: 'V',
    label: 'Selection: 6 single photos 25 km apart',
    points: b.points,
  })
}

function scenarioW(): Scenario {
  const b = createBuilder('W', 123)
  const c = start()
  const first = stay(b, c, 3, 2, { jitterM: 25 })
  travel(c, 10, 4500)
  const lone = stay(b, c, 1, 0)
  travel(c, 10, 0, 4500)
  const last = stay(b, c, 4, 2, { jitterM: 25 })
  return scenario({
    expectation: '3 stops (the lone photo is a valid point stop)',
    expectedGroups: [first, lone, last],
    id: 'W',
    knownFailingToday: true,
    label: 'Selection: 3 photos / lone photo 5 km away / 4 photos',
    points: b.points,
  })
}

function scenarioX(): Scenario {
  const b = createBuilder('X', 124)
  const c = start()
  const first = stay(b, c, 3, 1, { jitterM: 25 })
  const window = drive(b, c, {
    dEast: 60_000,
    firstAt: 20,
    minutes: 40,
    photoEvery: 40,
  })
  const last = stay(b, c, 3, 1, { jitterM: 25 })
  return scenario({
    expectation: '2 stops + 1 transit photo',
    expectedGroups: [first, last],
    id: 'X',
    knownFailingToday: true,
    label: 'Stop (3) / window photo at 90 km/h / stop (3)',
    points: b.points,
    transitIds: window,
  })
}

function scenarioY(): Scenario {
  const b = createBuilder('Y', 125)
  const c = start()
  const ids = stay(b, c, 4, 1, { jitterM: 20 })
  ids.push(
    b.add({
      durationMs: 25 * MINUTE_MS,
      east: 0,
      jitterM: 20,
      kind: 'video',
      minute: c.minute + 5,
      north: 0,
    }),
  )
  // The next photos come 10 min after the video ended (30 min after it began).
  c.minute += 35
  ids.push(...stay(b, c, 2, 1, { jitterM: 20 }))
  return scenario({
    expectation: '1 stop (the video counts with its duration)',
    expectedGroups: [ids],
    id: 'Y',
    label: 'Video with duration inside a stop',
    points: b.points,
  })
}

function scenarioZ(): Scenario {
  const b = createBuilder('Z', 126)
  const ids: string[] = []
  const pairs: [string, string][] = []
  for (let index = 0; index < 6; index += 1) {
    const minute = index * 4
    const still = b.add({ east: 0, jitterM: 20, minute, north: 0 })
    ids.push(still)
    if (index % 2 === 0) {
      // Live Photo: same instant, position within a couple of metres.
      const clip = b.add({
        durationMs: 3000,
        east: 0,
        jitterM: 2,
        kind: 'video',
        minute,
        north: 0,
      })
      ids.push(clip)
      pairs.push([still, clip])
    }
  }
  return scenario({
    expectation: '1 stop; a Live Photo pair never forms a second point',
    expectedGroups: [ids],
    id: 'Z',
    label: 'Live Photo pairs (same instant, near-identical position)',
    livePairs: pairs,
    points: b.points,
  })
}

/**
 * AA (ZS-3, real-data finding): copies of photos with no time zone, the very
 * same coordinates and a clock whole hours off. They must join the stop of
 * the original instead of forming bogus stops hours away.
 */
function scenarioAA(): Scenario {
  const b = createBuilder('AA', 127)
  const c = start()
  const first = stay(b, c, 6, 1, { jitterM: 20 })
  travel(c, 40, 2000)
  const second = stay(b, c, 6, 1, { jitterM: 20 })
  for (const point of b.points) point.capturedTz = 'Europe/Prague'
  const copy = (id: string | undefined, hours: number, group: string[]) => {
    const original = b.points.find((point) => point.id === id)
    if (original === undefined) return
    const copyId = `AA${String(b.points.length + 1).padStart(4, '0')}`
    b.points.push({
      ...original,
      capturedAt: new Date(
        Date.parse(original.capturedAt) + hours * 3_600_000,
      ).toISOString(),
      capturedTz: null,
      id: copyId,
    })
    group.push(copyId)
  }
  copy(first[0], 2, first)
  copy(first[2], 2, first)
  copy(first[4], 5, first)
  copy(second[1], 1, second)
  copy(second[3], 8, second)
  return scenario({
    expectation:
      '2 stops; the clock-shifted copies join the stop of their original',
    expectedGroups: [first, second],
    id: 'AA',
    knownFailingToday: true,
    label: 'Copies without time zone, same coordinates, whole hours off',
    points: b.points,
  })
}

/**
 * AB (ZS-4): an urban walk above the trip threshold (~2 h, 5.4 km, geocoded
 * to a settlement): 7 stops of 4 photos and a `walk` trip around them.
 */
function scenarioAB(): Scenario {
  const b = createBuilder('AB', 128)
  const c = start()
  const groups: string[][] = []
  for (let sight = 0; sight < 7; sight += 1) {
    groups.push(stay(b, c, 4, 1.5, { jitterM: 25 }))
    travel(c, 13, 900)
  }
  for (const point of b.points) point.placeKind = 'settlement'
  return scenario({
    expectation: '7 stops inside one walk trip',
    expectedGroups: groups,
    expectedTrips: ['walk'],
    id: 'AB',
    label: 'Urban walk 2 h / 5.4 km, 7 stops of 4 photos',
    points: b.points,
  })
}

/** AC (ZS-4): a 2 h bike ride, a photo every 15 min: one ride, a `day` trip. */
function scenarioAC(): Scenario {
  const b = createBuilder('AC', 129)
  const c = start()
  const ids = drive(b, c, { dEast: 40_000, minutes: 120, photoEvery: 15 })
  return scenario({
    expectation: '1 ride inside one day trip',
    expectedGroups: [ids],
    expectedTrips: ['day'],
    id: 'AC',
    label: 'Bike 2 h / 40 km, photo every 15 min',
    points: b.points,
  })
}

/** Scenarios added after ZS-0 (ids AA and on), kept apart from the 26. */
export function buildExtraScenarios(): Scenario[] {
  return [scenarioAA(), scenarioAB(), scenarioAC()]
}

/** All 26 scenarios in id order. Fresh objects on every call. */
export function buildScenarios(): Scenario[] {
  return [
    scenarioA(),
    scenarioB(),
    scenarioC(),
    scenarioD(),
    scenarioE(),
    scenarioF(),
    scenarioG(),
    scenarioH(),
    scenarioI(),
    scenarioJ(),
    scenarioK(),
    scenarioL(),
    scenarioM(),
    scenarioN(),
    scenarioO(),
    scenarioP(),
    scenarioQ(),
    scenarioR(),
    scenarioS(),
    scenarioT(),
    scenarioU(),
    scenarioV(),
    scenarioW(),
    scenarioX(),
    scenarioY(),
    scenarioZ(),
  ]
}

/**
 * `count` photos of a plausible multi-day trip: stops of 3-12 photos,
 * overnight pauses and hops of 0.3-60 km. For the performance test.
 */
export function generatePerfPoints(
  count: number,
  seed: number,
): HarnessPoint[] {
  const b = createBuilder('F', seed)
  const c = start()
  while (b.points.length < count) {
    const size = 3 + Math.floor(b.rng() * 10)
    stay(b, c, Math.min(size, count - b.points.length), 1 + b.rng() * 2, {
      jitterM: 40,
    })
    const hop = 300 + b.rng() * 60_000
    const angle = b.rng() * 2 * Math.PI
    travel(
      c,
      b.rng() < 0.2 ? 600 + b.rng() * 600 : 20 + b.rng() * 100,
      hop * Math.cos(angle),
      hop * Math.sin(angle),
    )
  }
  return b.points
}

/** All-day stay at one place: a photo every 30 s (long visit, perf). */
export function generateLongStayPoints(count: number, seed: number) {
  const b = createBuilder('L', seed)
  for (let index = 0; index < count; index += 1) {
    b.add({ east: 0, jitterM: 40, minute: index * 0.5, north: 0 })
  }
  return b.points
}

/** Bursts with equal capture timestamps, a few places (perf, ties). */
export function generateEqualTimestampPoints(count: number, seed: number) {
  const b = createBuilder('Q', seed)
  for (let index = 0; index < count; index += 1) {
    const burst = Math.floor(index / 100)
    b.add({
      east: (burst % 5) * 2000,
      jitterM: 30,
      minute: burst * 20,
      north: 0,
    })
  }
  return b.points
}

/** Photos without any GPS, one a minute (perf, time-only chain). */
export function generateNoGpsPoints(count: number, seed: number) {
  const b = createBuilder('N', seed)
  for (let index = 0; index < count; index += 1) {
    b.add({ east: 0, gps: false, minute: index, north: 0 })
  }
  return b.points
}
