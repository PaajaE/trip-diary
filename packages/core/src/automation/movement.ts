import { sparsity } from './density.ts'
import { centroid, distanceKm, type GeoPoint } from './geo.ts'
import {
  classifyGap,
  GAP_MIN_DISTANCE_M,
  refineWithNeighbours,
  type GapClass,
  type GapFeatures,
  type MovementMode,
} from './gaps.ts'
import type { PreparedPoint } from './prepare.ts'

/**
 * ZS-4 movement planning for ONE author's timeline of visits (stays and
 * points, see stays.ts). Pure and deterministic.
 *
 *  1. Every gap between consecutive visits is classified (gaps.ts).
 *  2. Walks or rides >= 90 min and >= 3 km form an in-day trip (trek / day /
 *     walk); its filler photos (single photos that are not at a known place)
 *     collapse into one `en_route` stop between the stops (the viewpoints).
 *  3. Photos taken while a vehicle (or a long ride) passes collapse into ONE
 *     `en_route` stop of that transit. A photo stays a regular point at a
 *     known place, when the speed drops around it, with >= 3 photos in ~300 m
 *     or >= 10 min (those are stays and never candidates), and in a sparse
 *     selection (a fully sparse stretch with no stay around it).
 *  4. Dense walking (a shot every few minutes, >= 3 small visits) is one
 *     movement, collapsed as `en_route` (the former "dense movement run").
 *
 * A collapsed stop keeps its members addressable (`members`: id and the reason
 * why it was collapsed), so promoting a photo to a stop is one split.
 */

const MINUTE_MS = 60_000

/** An in-day trip: at least this long and this far (plan 4f, point 5). */
export const TRIP_MIN_DURATION_MS = 90 * MINUTE_MS
export const TRIP_MIN_DISTANCE_M = 3000
/** Two visits of one trip are linked by a gap of at most this. */
export const TRIP_MAX_LINK_GAP_MS = 90 * MINUTE_MS
/** The trip moves on average at least this fast (km/h): not a day in a hut. */
export const TRIP_MIN_SPEED_KMH = 1
/** A trek is long even without nature data: this far, or a loop, or a climb. */
export const TREK_UNKNOWN_MIN_DISTANCE_M = 8000
export const TREK_CLIMB_M = 150
/** Loop: the end is this close to the start (or 10 % of the path). */
export const LOOP_RADIUS_M = 300
/** Dense walking: links of at most this, local median gap at most this. */
export const WALK_RUN_MAX_GAP_MS = 10 * MINUTE_MS
export const WALK_RUN_MAX_MEDIAN_GAP_MS = 7 * MINUTE_MS
export const WALK_RUN_MIN_VISITS = 3
/** A fully sparse stretch is a selection: nothing collapses without a stay. */
export const RUN_MAX_SPARSITY = 0.75
/** Fewer filler photos than this in a sparse trip are deliberate: points. */
export const TRIP_SPARSE_MIN_FILLERS = 5
/** A lone passing photo needs an unmistakable vehicle on both sides. */
export const LONE_PHOTO_MIN_CONFIDENCE = 0.8
/** A ride (bike) collapses from this many photos. */
export const RIDE_MIN_PHOTOS = 3
/**
 * A visit whose members lie farther than this from their centre was walked
 * through (a slow walk of deliberate shots chains into one visit), not stayed.
 */
export const MOVING_EXTENT_M = 120
/** Unknown fast movement still counts as passing from this speed / length. */
const FAST_TRANSIT_MIN_KMH = 15
const FAST_TRANSIT_MIN_DISTANCE_M = 3000
/** Unknown slow movement still links a walk. */
const SLOW_TRANSIT_MAX_KMH = 9.5

export interface MovementVisit {
  kind: 'point' | 'stay'
  /** Time-ordered members of the visit. */
  members: readonly PreparedPoint[]
  /** Local median gap of the author's photos around the visit (density). */
  medianGapMs: number | null
}

export interface GapInfo extends GapClass {
  distanceM: number
  durationMs: number
}

export interface CollapsedMember {
  mediaId: string
  /** Short English diagnostic: why this photo is on the way. */
  reason: string
}

/** Consecutive visits `from..to` collapsed into one `en_route` stop. */
export interface EnRouteRun {
  from: number
  members: CollapsedMember[]
  mode: MovementMode
  reason: string
  to: number
}

export type DayTripType = 'day' | 'trek' | 'walk'

/** An in-day trip over the visits `from..to` of the timeline. */
export interface DayTrip {
  distanceM: number
  durationMs: number
  endsAt: number
  from: number
  mode: 'bike' | 'walk'
  reason: string
  startsAt: number
  to: number
  tripType: DayTripType
}

/** The classified movement between two neighbouring stops (visits). */
export interface Transit extends GapClass {
  distanceM: number
  durationMs: number
  endsAt: number
  /** Visit before / after (indices of the timeline, runs not collapsed). */
  from: number
  startsAt: number
  to: number
}

export interface MovementPlan {
  gaps: GapInfo[]
  runs: EnRouteRun[]
  transits: Transit[]
  trips: DayTrip[]
}

interface VisitFacts {
  altitudeFirst: number | null
  altitudeLast: number | null
  end: number
  first: GeoPoint | null
  /** At a known place a vehicle run must not swallow the photo. */
  knownFast: boolean
  /** At a viewpoint-like place a walking run must not swallow the photo. */
  knownWalk: boolean
  last: GeoPoint | null
  /** The members are spread along a path, not gathered at one place. */
  moving: boolean
  natural: number
  settlement: number
  single: boolean
  start: number
}

function factsOf(visit: MovementVisit): VisitFacts {
  let first: GeoPoint | null = null
  let last: GeoPoint | null = null
  let altitudeFirst: number | null = null
  let altitudeLast: number | null = null
  let end = 0
  let natural = 0
  let settlement = 0
  let knownFast = false
  let knownWalk = false
  for (const member of visit.members) {
    if (member.location !== null) {
      first = first ?? member.location
      last = member.location
    }
    if (member.altitude !== null) {
      altitudeFirst = altitudeFirst ?? member.altitude
      altitudeLast = member.altitude
    }
    end = Math.max(end, member.workEnd)
    if (member.placeKind === 'natural') natural += 1
    if (member.placeKind === 'settlement') settlement += 1
    if (
      member.placeKind === 'natural' ||
      member.placeKind === 'attraction' ||
      member.placeKind === 'settlement'
    ) {
      knownFast = true
    }
    if (member.placeKind === 'natural' || member.placeKind === 'attraction') {
      knownWalk = true
    }
  }
  let extentM = 0
  if (visit.members.length > 1) {
    const centre = centroid(
      visit.members.flatMap((member) => member.location ?? []),
    )
    if (centre !== null) {
      for (const member of visit.members) {
        if (member.location === null) continue
        extentM = Math.max(extentM, distanceKm(centre, member.location) * 1000)
      }
    }
  }
  return {
    altitudeFirst,
    altitudeLast,
    end,
    first,
    knownFast,
    knownWalk,
    last,
    moving: extentM > MOVING_EXTENT_M,
    natural,
    settlement,
    single: visit.members.length === 1,
    start: visit.members[0]?.workTime ?? 0,
  }
}

function environmentOf(
  a: VisitFacts,
  b: VisitFacts,
): GapFeatures['environment'] {
  const natural = a.natural + b.natural
  const settlement = a.settlement + b.settlement
  if (natural > 0 && settlement === 0) return 'nature'
  if (settlement > 0 && natural === 0) return 'city'
  return null
}

const UNKNOWN_GAP: GapClass = {
  confidence: 0,
  mode: 'transit',
  reason: 'transit: no position to measure the movement',
  scores: { bike: 0, vehicle: 0, walk: 0 },
  speedKmh: 0,
}

function featuresOf(
  a: VisitFacts,
  b: VisitFacts,
): { features: GapFeatures; distanceM: number; durationMs: number } | null {
  if (a.last === null || b.first === null) return null
  const distanceM = distanceKm(a.last, b.first) * 1000
  const durationMs = Math.max(0, b.start - a.end)
  return {
    distanceM,
    durationMs,
    features: {
      altitudeChangeM:
        a.altitudeLast === null || b.altitudeFirst === null
          ? null
          : Math.abs(b.altitudeFirst - a.altitudeLast),
      distanceM,
      durationMs,
      environment: environmentOf(a, b),
      next: null,
      previous: null,
    },
  }
}

function classifyGaps(facts: readonly VisitFacts[]): GapInfo[] {
  const measured = facts.slice(0, -1).map((fact, index) => {
    const next = facts[index + 1]
    return next === undefined ? null : featuresOf(fact, next)
  })
  const first = measured.map((item) =>
    item === null ? UNKNOWN_GAP : classifyGap(item.features),
  )
  return measured.map((item, index) => {
    if (item === null) {
      return { ...UNKNOWN_GAP, distanceM: 0, durationMs: 0 }
    }
    const own = first[index] ?? UNKNOWN_GAP
    const refined = refineWithNeighbours(
      {
        ...item.features,
        next: first[index + 1] ?? null,
        previous: first[index - 1] ?? null,
      },
      own,
    )
    return {
      ...refined,
      distanceM: item.distanceM,
      durationMs: item.durationMs,
    }
  })
}

/** Passing: a vehicle or ride, or unknown but clearly fast movement. */
function isFast(gap: GapInfo): boolean {
  return (
    gap.mode === 'vehicle' ||
    gap.mode === 'bike' ||
    (gap.mode === 'transit' &&
      gap.speedKmh >= FAST_TRANSIT_MIN_KMH &&
      gap.distanceM >= FAST_TRANSIT_MIN_DISTANCE_M)
  )
}

/** Walking, or unclear but slow movement (resting, climbing). */
function isWalkLink(gap: GapInfo): boolean {
  return (
    gap.mode === 'walk' ||
    (gap.mode === 'transit' &&
      gap.distanceM >= GAP_MIN_DISTANCE_M &&
      gap.speedKmh <= SLOW_TRANSIT_MAX_KMH)
  )
}

function isTripLink(gap: GapInfo): boolean {
  return (
    (isWalkLink(gap) || gap.mode === 'bike') &&
    gap.durationMs <= TRIP_MAX_LINK_GAP_MS
  )
}

function speedText(gaps: readonly (GapInfo | undefined)[]): string {
  const known = gaps.filter((gap): gap is GapInfo => gap !== undefined)
  if (known.length === 0) return 'no speed'
  const mean = known.reduce((sum, gap) => sum + gap.speedKmh, 0) / known.length
  return `${mean.toFixed(0)} km/h`
}

interface Claim {
  from: number
  mode: MovementMode
  to: number
  /** Why the run was collapsed (head of the reason). */
  why: string
}

function runOf(
  claim: Claim,
  visits: readonly MovementVisit[],
  gaps: readonly GapInfo[],
): EnRouteRun {
  const members: CollapsedMember[] = []
  for (let at = claim.from; at <= claim.to; at += 1) {
    const visit = visits[at]
    if (visit === undefined) continue
    const around = [gaps[at - 1], gaps[at]]
    for (const member of visit.members) {
      members.push({
        mediaId: member.id,
        reason: `on the way (${claim.mode}) at about ${speedText(around)}, no stay`,
      })
    }
  }
  const photos = members.length
  return {
    from: claim.from,
    members,
    mode: claim.mode,
    reason: `en route: ${String(photos)} photo(s) ${claim.why}`,
    to: claim.to,
  }
}

function modeOfGaps(gaps: readonly (GapInfo | undefined)[]): MovementMode {
  let bike = 0
  let vehicle = 0
  let walk = 0
  for (const gap of gaps) {
    if (gap === undefined) continue
    if (gap.mode === 'bike') bike += gap.distanceM
    else if (gap.mode === 'vehicle') vehicle += gap.distanceM
    else if (isWalkLink(gap)) walk += gap.distanceM
    else if (isFast(gap)) vehicle += gap.distanceM / 4
  }
  if (bike === 0 && vehicle === 0 && walk === 0) return 'transit'
  if (walk > bike && walk > vehicle) return 'walk'
  return bike > vehicle ? 'bike' : 'vehicle'
}

/** In-day trips: chains of visits linked by walking or cycling gaps. */
function findTrips(
  visits: readonly MovementVisit[],
  facts: readonly VisitFacts[],
  gaps: readonly GapInfo[],
): DayTrip[] {
  const trips: DayTrip[] = []
  let from = 0
  while (from < visits.length - 1) {
    if (!isTripLink(gaps[from] ?? UNKNOWN_GAP_INFO)) {
      from += 1
      continue
    }
    let to = from + 1
    while (to < visits.length - 1 && isTripLink(gaps[to] ?? UNKNOWN_GAP_INFO)) {
      to += 1
    }
    const trip = judgeChain(visits, facts, gaps, from, to)
    if (trip !== null) trips.push(trip)
    from = to + 1
  }
  return trips
}

const UNKNOWN_GAP_INFO: GapInfo = {
  ...UNKNOWN_GAP,
  distanceM: 0,
  durationMs: 0,
}

function judgeChain(
  visits: readonly MovementVisit[],
  facts: readonly VisitFacts[],
  gaps: readonly GapInfo[],
  from: number,
  to: number,
): DayTrip | null {
  const startFact = facts[from]
  const endFact = facts[to]
  if (startFact === undefined || endFact === undefined) return null
  const startsAt = startFact.start
  let endsAt = startFact.end
  for (let at = from; at <= to; at += 1) {
    endsAt = Math.max(endsAt, facts[at]?.end ?? 0)
  }
  const durationMs = endsAt - startsAt
  let pathM = 0
  let walkM = 0
  let bikeM = 0
  for (let at = from; at < to; at += 1) {
    const gap = gaps[at]
    if (gap === undefined) continue
    pathM += gap.distanceM
    if (gap.mode === 'bike') bikeM += gap.distanceM
    else walkM += gap.distanceM
  }
  if (
    durationMs < TRIP_MIN_DURATION_MS ||
    pathM < TRIP_MIN_DISTANCE_M ||
    pathM / 1000 / (durationMs / 3.6e6) < TRIP_MIN_SPEED_KMH
  ) {
    return null
  }
  let natural = 0
  let settlement = 0
  let low = Number.POSITIVE_INFINITY
  let high = Number.NEGATIVE_INFINITY
  for (let at = from; at <= to; at += 1) {
    const fact = facts[at]
    if (fact === undefined) continue
    natural += fact.natural
    settlement += fact.settlement
    for (const altitude of [fact.altitudeFirst, fact.altitudeLast]) {
      if (altitude === null) continue
      low = Math.min(low, altitude)
      high = Math.max(high, altitude)
    }
  }
  const climbM = high > low ? high - low : 0
  const loop =
    startFact.first !== null &&
    endFact.last !== null &&
    distanceKm(startFact.first, endFact.last) * 1000 <=
      Math.max(LOOP_RADIUS_M, 0.1 * pathM)
  const mode = bikeM > walkM ? 'bike' : 'walk'
  const city = settlement > natural && settlement > 0
  const nature = natural > settlement
  let tripType: DayTripType
  let basis: string
  if (mode === 'bike') {
    tripType = 'day'
    basis = 'ride'
  } else if (city) {
    tripType = 'walk'
    basis = 'urban walk'
  } else if (nature || loop || climbM >= TREK_CLIMB_M) {
    tripType = 'trek'
    basis = nature
      ? 'in nature'
      : loop
        ? 'loop'
        : `climb ${String(Math.round(climbM))} m`
  } else if (pathM >= TREK_UNKNOWN_MIN_DISTANCE_M) {
    tripType = 'trek'
    basis = 'long walk, no place data'
  } else {
    tripType = 'walk'
    basis = 'walk, no place data'
  }
  const stops = visits
    .slice(from, to + 1)
    .filter((visit) => visit.kind === 'stay').length
  return {
    distanceM: Math.round(pathM),
    durationMs,
    endsAt,
    from,
    mode,
    reason: `${tripType} trip (${basis}): ${(pathM / 1000).toFixed(1)} km on foot/bike in ${String(Math.round(durationMs / MINUTE_MS))} min, ${String(stops)} stay(s)`,
    startsAt,
    to,
    tripType,
  }
}

/** Splits `[from, to]` into maximal sequences of `claimable` visits. */
function sequences(
  from: number,
  to: number,
  claimable: (index: number) => boolean,
): [number, number][] {
  const out: [number, number][] = []
  let start = -1
  for (let at = from; at <= to + 1; at += 1) {
    const ok = at <= to && claimable(at)
    if (ok && start < 0) start = at
    if (!ok && start >= 0) {
      out.push([start, at - 1])
      start = -1
    }
  }
  return out
}

export function planMovement(visits: readonly MovementVisit[]): MovementPlan {
  const facts = visits.map(factsOf)
  const gaps = classifyGaps(facts)
  const trips = findTrips(visits, facts, gaps)
  const claimed = new Array<boolean>(visits.length).fill(false)
  const claims: Claim[] = []

  // 1. Trip filler: single photos (or visits walked through) that are not at
  // a viewpoint. A few deliberate photos over a sparse stretch stay points.
  for (const trip of trips) {
    const runs = sequences(trip.from, trip.to, (index) => {
      const fact = facts[index]
      return (
        fact !== undefined && (fact.single || fact.moving) && !fact.knownWalk
      )
    })
    let fillers = 0
    let sparse = 0
    for (const [from, to] of runs) {
      for (let at = from; at <= to; at += 1) {
        fillers += 1
        sparse += sparsity(visits[at]?.medianGapMs ?? null)
      }
    }
    if (fillers === 0) continue
    if (
      sparse / fillers > RUN_MAX_SPARSITY &&
      fillers < TRIP_SPARSE_MIN_FILLERS
    ) {
      continue
    }
    for (const [from, to] of runs) {
      claims.push({
        from,
        mode: modeOfGaps(gaps.slice(Math.max(0, from - 1), to + 1)),
        to,
        why: `on a ${trip.tripType} trip between its stops`,
      })
      for (let at = from; at <= to; at += 1) claimed[at] = true
    }
  }

  // 2. Passing photos: a vehicle (or a long ride) goes by.
  const passing = (index: number): boolean => {
    const fact = facts[index]
    const visit = visits[index]
    if (
      claimed[index] === true ||
      fact === undefined ||
      visit === undefined ||
      !fact.single ||
      visit.kind !== 'point' ||
      fact.knownFast
    ) {
      return false
    }
    const around = [gaps[index - 1], gaps[index]].filter(
      (gap): gap is GapInfo => gap !== undefined,
    )
    return around.length > 0 && around.every(isFast)
  }
  const isCandidate = visits.map((_, index) => passing(index))
  for (const [from, to] of sequences(
    0,
    visits.length - 1,
    (i) => isCandidate[i] === true,
  )) {
    const size = to - from + 1
    const around = gaps.slice(Math.max(0, from - 1), to + 1)
    const mode = modeOfGaps(around)
    const before = from > 0
    const after = to < visits.length - 1
    // The neighbours of a run are never candidates themselves: they are stays,
    // pairs, places or photos where the speed drops.
    const anchored = before || after
    let meanSparsity = 0
    for (let at = from; at <= to; at += 1) {
      meanSparsity += sparsity(visits[at]?.medianGapMs ?? null)
    }
    meanSparsity /= size
    let ok: boolean
    let why: string
    if (size === 1) {
      ok =
        anchored &&
        mode === 'vehicle' &&
        around.every(
          (gap) =>
            gap.mode === 'vehicle' &&
            gap.confidence >= LONE_PHOTO_MIN_CONFIDENCE,
        )
      why = 'passed by a vehicle'
    } else if (mode === 'bike') {
      ok =
        size >= RIDE_MIN_PHOTOS &&
        (anchored || meanSparsity <= RUN_MAX_SPARSITY)
      why = 'taken during a ride'
    } else {
      ok = anchored || meanSparsity <= RUN_MAX_SPARSITY
      why = mode === 'vehicle' ? 'taken while travelling' : 'taken in transit'
    }
    if (!ok) continue
    claims.push({ from, mode, to, why })
    for (let at = from; at <= to; at += 1) claimed[at] = true
  }

  // 3. Dense walking: a shot every few minutes is one movement.
  const smallWalk = (index: number): boolean => {
    const fact = facts[index]
    const visit = visits[index]
    return (
      claimed[index] !== true &&
      fact !== undefined &&
      visit?.kind === 'point' &&
      !fact.knownWalk &&
      (visit.medianGapMs ?? Number.POSITIVE_INFINITY) <=
        WALK_RUN_MAX_MEDIAN_GAP_MS
    )
  }
  const linked = (index: number): boolean => {
    const gap = gaps[index]
    return (
      gap !== undefined &&
      isWalkLink(gap) &&
      gap.durationMs <= WALK_RUN_MAX_GAP_MS
    )
  }
  let at = 0
  while (at < visits.length) {
    if (!smallWalk(at)) {
      at += 1
      continue
    }
    let end = at
    while (end + 1 < visits.length && smallWalk(end + 1) && linked(end))
      end += 1
    if (end - at + 1 >= WALK_RUN_MIN_VISITS) {
      claims.push({
        from: at,
        mode: 'walk',
        to: end,
        why: 'walking with a shot every few minutes, no stay',
      })
      for (let k = at; k <= end; k += 1) claimed[k] = true
    }
    at = end + 1
  }

  claims.sort((a, b) => a.from - b.from)
  const runs = claims.map((claim) => runOf(claim, visits, gaps))

  // Transits: the movement between neighbouring stops (runs collapsed).
  const inRun = new Map<number, EnRouteRun>()
  for (const run of runs) {
    for (let k = run.from; k <= run.to; k += 1) inRun.set(k, run)
  }
  const anchors: number[] = []
  for (let k = 0; k < visits.length; k += 1) {
    if (!inRun.has(k)) anchors.push(k)
  }
  const transits: Transit[] = []
  for (let k = 0; k + 1 < anchors.length; k += 1) {
    const from = anchors[k] ?? 0
    const to = anchors[k + 1] ?? 0
    const a = facts[from]
    const b = facts[to]
    if (a === undefined || b === undefined) continue
    let pathM = 0
    for (let g = from; g < to; g += 1) pathM += gaps[g]?.distanceM ?? 0
    const durationMs = Math.max(0, b.start - a.end)
    const measured = featuresOf(a, b)
    const features: GapFeatures = {
      altitudeChangeM: measured?.features.altitudeChangeM ?? null,
      distanceM: to - from > 1 ? pathM : (measured?.distanceM ?? 0),
      durationMs,
      environment: environmentOf(a, b),
      next: null,
      previous: null,
    }
    const own = measured === null ? UNKNOWN_GAP : classifyGap(features)
    transits.push({
      ...own,
      distanceM: Math.round(features.distanceM),
      durationMs,
      endsAt: b.start,
      from,
      startsAt: a.end,
      to,
    })
  }
  return { gaps, runs, transits, trips }
}
