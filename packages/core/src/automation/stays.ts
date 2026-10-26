import { compareText } from './compare.ts'
import {
  DENSITY_WINDOW,
  DENSITY_WINDOW_MS,
  localMedianGapMs,
  medianOf,
  sparsity,
  timeThresholdMs,
} from './density.ts'
import { distanceKm, lonDelta, wrapLon, type GeoPoint } from './geo.ts'
import type { MovementMode } from './gaps.ts'
import type { MediaPoint } from './media-point.ts'
import {
  planMovement,
  type CollapsedMember,
  type DayTripType,
  type EnRouteRun,
  type MovementVisit,
} from './movement.ts'
import {
  authorOf,
  medianPoint,
  prepareMedia,
  type ClockShiftProposal,
  type PreparedPoint,
  type PrepareOptions,
  type ProbableDuplicate,
} from './prepare.ts'

/**
 * Stay / point / en route detection (ZS-3, ZS-4). Per author (all devices of
 * one person form one timeline) photos are walked in time order and joined
 * into a visit while the photographer stays about the same place. The time
 * threshold and the radius follow the local density (see density.ts), so a
 * dense morning and a sparse afternoon work in one pass: in a sparse stretch
 * every photo is deliberate evidence of presence, a lone photo is a valid
 * stop of kind 'point'. Then the movement between the visits is classified
 * (movement.ts): photos taken while passing collapse into one 'en_route' stop,
 * walks and rides of >= 90 min and >= 3 km become in-day trips. Streams of
 * different authors stay parallel unless they are close (they merge); trips
 * are shared (membership by time).
 *
 * Limits: a stop is a time range of instants, it knows nothing about local
 * midnight or a DST change (days and their zone are cut later, days.ts), and a
 * stay across local midnight stays one stop.
 */

const MINUTE_MS = 60_000

/** Dense stay radius: 3 x the spread of the stay, clamped to 150-300 m ... */
export const STAY_RADIUS_MIN_M = 150
export const STAY_RADIUS_MAX_M = 300
export const STAY_RADIUS_DEFAULT_M = 250
export const STAY_SPREAD_FACTOR = 3
/** ... growing to this in a fully sparse stretch (spatial proximity). */
export const SPARSE_RADIUS_M = 400
/** Staying put: the same place after a long pause is still the same visit. */
export const DWELL_RADIUS_M = 150
export const DWELL_CEILING_MS = 180 * MINUTE_MS
/** At least this many photos or this long makes a visit a 'stay'. */
export const STAY_MIN_PHOTOS = 3
export const STAY_MIN_DURATION_MS = 10 * MINUTE_MS
/** Parallel visits of different authors closer than this are one visit. */
export const STREAM_MERGE_DISTANCE_M = 800
export const STREAM_MERGE_GAP_MS = 10 * MINUTE_MS
const SPREAD_SAMPLE = 40

export type StopKind = 'en_route' | 'point' | 'stay'

export interface DetectedStop {
  /** Oldest photo (ties by id), stable id basis. */
  anchorMediaId: string
  /**
   * Members of an 'en_route' stop and why each is on the way; promoting one
   * of them to a stop of its own is one split. Empty for stays and points.
   */
  collapsed: CollapsedMember[]
  /** 0..1, for ordering the work of the user, not shown as a number. */
  confidence: number
  /** Members whose position was derived (fill-in), not a real fix. */
  derivedLocationCount: number
  endsAt: string
  /** A single instant (one photo, no duration): show "around", no interval. */
  instant: boolean
  kind: StopKind
  /** Time-ordered members, probable duplicate copies at the end. */
  mediaIds: string[]
  /** Movement of an 'en_route' stop, null otherwise. */
  movement: MovementMode | null
  /** Built on a proposed clock shift (a hypothesis): review it. */
  needsReview: boolean
  ownerIds: string[]
  /** Representative position (median of the usable positions). */
  position: GeoPoint | null
  /** Copies with a wrong clock attached to their original, not own stops. */
  probableDuplicateIds: string[]
  /** Short English diagnostics for developers, not UI text. */
  reasons: string[]
  startsAt: string
}

/** The classified movement between two neighbouring stops of one author. */
export interface DetectedTransit {
  confidence: number
  distanceM: number
  endsAt: string
  /** Oldest photo of the stop before / after (null at the ends). */
  fromAnchorMediaId: string | null
  mode: MovementMode
  ownerId: string
  reason: string
  speedKmh: number
  startsAt: string
  toAnchorMediaId: string | null
}

/** A walk or ride of >= 90 min and >= 3 km inside a day. */
export interface DetectedDayTrip {
  distanceM: number
  endsAt: string
  /** Photos of the trip (primary media, time ordered). */
  mediaIds: string[]
  ownerIds: string[]
  reason: string
  startsAt: string
  tripType: DayTripType
}

export interface DetectStopsResult {
  clockShiftProposals: ClockShiftProposal[]
  dayTrips: DetectedDayTrip[]
  duplicates: ProbableDuplicate[]
  outlierMediaIds: string[]
  stops: DetectedStop[]
  transits: DetectedTransit[]
  undatedMediaIds: string[]
}

export type DetectStopsOptions = PrepareOptions

/** Running aggregates of a visit, so joining a photo is O(1) (not a rescan). */
interface Aggregate {
  /** Reference longitude and the sum of offsets from it (antimeridian). */
  lastLocated: GeoPoint | null
  located: number
  latitudeSum: number
  longitudeOffsetSum: number
  maxEnd: number
  recent: GeoPoint[]
  referenceLongitude: number
}

interface Visit {
  aggregate: Aggregate
  enRoute: EnRouteRun | null
  /** Index in the owner's timeline of the first member. */
  firstIndex: number
  members: PreparedPoint[]
  ownerId: string
}

function byTimeThenId(a: PreparedPoint, b: PreparedPoint): number {
  return a.workTime - b.workTime || compareText(a.id, b.id)
}

function newAggregate(): Aggregate {
  return {
    lastLocated: null,
    latitudeSum: 0,
    located: 0,
    longitudeOffsetSum: 0,
    maxEnd: 0,
    recent: [],
    referenceLongitude: 0,
  }
}

function addTo(aggregate: Aggregate, member: PreparedPoint): void {
  aggregate.maxEnd = Math.max(aggregate.maxEnd, member.workEnd)
  const location = member.location
  if (location === null) return
  if (aggregate.located === 0) aggregate.referenceLongitude = location.longitude
  aggregate.located += 1
  aggregate.latitudeSum += location.latitude
  aggregate.longitudeOffsetSum += lonDelta(
    aggregate.referenceLongitude,
    location.longitude,
  )
  aggregate.lastLocated = location
  aggregate.recent.push(location)
  if (aggregate.recent.length > SPREAD_SAMPLE) aggregate.recent.shift()
}

function centreOf(aggregate: Aggregate): GeoPoint | null {
  if (aggregate.located === 0) return null
  return {
    latitude: aggregate.latitudeSum / aggregate.located,
    longitude: wrapLon(
      aggregate.referenceLongitude +
        aggregate.longitudeOffsetSum / aggregate.located,
    ),
  }
}

function located(members: readonly PreparedPoint[]): GeoPoint[] {
  return members.flatMap((member) =>
    member.location === null ? [] : [member.location],
  )
}

function endOf(members: readonly PreparedPoint[]): number {
  let end = 0
  for (const member of members) end = Math.max(end, member.workEnd)
  return end
}

function startOf(members: readonly PreparedPoint[]): number {
  let start = Number.POSITIVE_INFINITY
  for (const member of members) start = Math.min(start, member.workTime)
  return start
}

/** Median distance (m) of the latest located members to their centre. */
function spreadM(points: readonly GeoPoint[], centre: GeoPoint): number {
  const spread = medianOf(
    points.map((point) => distanceKm(point, centre) * 1000),
  )
  return spread ?? 0
}

/** Does the next photo continue the running visit? */
function joins(
  aggregate: Aggregate,
  next: PreparedPoint,
  medianGapMs: number | null,
): boolean {
  const gap = next.workTime - aggregate.maxEnd
  if (gap > DWELL_CEILING_MS) return false
  const threshold = timeThresholdMs(medianGapMs)
  const centre = centreOf(aggregate)
  const last = aggregate.lastLocated
  if (next.location === null || centre === null || last === null) {
    // No place to compare: the time alone decides.
    return gap <= threshold
  }
  const fromCentre = distanceKm(centre, next.location) * 1000
  const fromLast = distanceKm(last, next.location) * 1000
  const sparse = sparsity(medianGapMs)
  const dense =
    aggregate.located < STAY_MIN_PHOTOS
      ? STAY_RADIUS_DEFAULT_M
      : Math.min(
          STAY_RADIUS_MAX_M,
          Math.max(
            STAY_RADIUS_MIN_M,
            STAY_SPREAD_FACTOR * spreadM(aggregate.recent, centre),
          ),
        )
  const radius = dense + sparse * (SPARSE_RADIUS_M - dense)
  // Dense: distance to the centre (walking cannot chain forever); sparse:
  // distance to the previous photo (a slow walk of deliberate shots chains).
  const distance = (1 - sparse) * fromCentre + sparse * fromLast
  if (gap <= threshold && distance <= radius) return true
  return fromCentre <= DWELL_RADIUS_M && fromLast <= DWELL_RADIUS_M
}

function visitKind(members: readonly PreparedPoint[]): 'point' | 'stay' {
  return members.length >= STAY_MIN_PHOTOS ||
    endOf(members) - startOf(members) >= STAY_MIN_DURATION_MS
    ? 'stay'
    : 'point'
}

/** Walk one author's timeline into visits. */
function visitsOf(
  ownerId: string,
  timeline: readonly PreparedPoint[],
): { medianGaps: (number | null)[]; visits: Visit[] } {
  const times = timeline.map((point) => point.workTime)
  const visits: Visit[] = []
  const medianGaps: (number | null)[] = []
  timeline.forEach((point, index) => {
    const median = localMedianGapMs(
      times,
      index,
      DENSITY_WINDOW,
      DENSITY_WINDOW_MS,
    )
    const current = visits[visits.length - 1]
    if (current !== undefined && joins(current.aggregate, point, median)) {
      current.members.push(point)
      addTo(current.aggregate, point)
    } else {
      const aggregate = newAggregate()
      addTo(aggregate, point)
      visits.push({
        aggregate,
        enRoute: null,
        firstIndex: index,
        members: [point],
        ownerId,
      })
      medianGaps.push(median)
    }
  })
  return { medianGaps, visits }
}

function positionOf(members: readonly PreparedPoint[]): GeoPoint | null {
  return medianPoint(located(members))
}

const METRES_PER_DEGREE = 111_320

/**
 * Distance (m) from a point to the path through the located members of a
 * run, counting only where the point falls BETWEEN two of its photos (null
 * when it is before the first or after the last: the two runs were simply
 * sampled at different places of the same road).
 */
function distanceToPathM(
  point: GeoPoint,
  members: readonly PreparedPoint[],
): number | null {
  const path = members.flatMap((member) => member.location ?? [])
  const cosine = Math.cos((point.latitude * Math.PI) / 180)
  const flat = (at: GeoPoint): [number, number] => [
    lonDelta(point.longitude, at.longitude) * cosine * METRES_PER_DEGREE,
    (at.latitude - point.latitude) * METRES_PER_DEGREE,
  ]
  let best: number | null = null
  for (let index = 0; index + 1 < path.length; index += 1) {
    const from = path[index]
    const to = path[index + 1]
    if (from === undefined || to === undefined) continue
    const [ax, ay] = flat(from)
    const [bx, by] = flat(to)
    const dx = bx - ax
    const dy = by - ay
    const length = dx * dx + dy * dy
    const share = length === 0 ? 0 : -(ax * dx + ay * dy) / length
    if (share <= 0 || share >= 1) continue
    const distance = Math.hypot(ax + share * dx, ay + share * dy)
    best = best === null ? distance : Math.min(best, distance)
  }
  return best
}

/**
 * Distance (m) between two parallel visits of different authors, or null when
 * they are not about the same place. Stays and points compare their own
 * positions; en route runs compare each photo with the path of the other
 * run (a shared car), never stays with runs.
 */
function parallelDistanceM(a: Visit, b: Visit): number | null {
  if ((a.enRoute === null) !== (b.enRoute === null)) return null
  if (a.enRoute === null) {
    const positionA = positionOf(a.members)
    const positionB = positionOf(b.members)
    return positionA === null || positionB === null
      ? null
      : distanceKm(positionA, positionB) * 1000
  }
  let worst = -1
  for (const [from, to] of [
    [a, b],
    [b, a],
  ] as const) {
    for (const member of from.members) {
      if (member.location === null) continue
      const distance = distanceToPathM(member.location, to.members)
      if (distance !== null) worst = Math.max(worst, distance)
    }
  }
  return worst < 0 ? null : worst
}

/**
 * Parallel visits of different authors that are close and overlap in time
 * merge, one visit per author in a group. Pairs are compared by their own
 * positions and joined nearest first, so a third visit between two far ones
 * cannot chain them into one stop.
 */
function mergeParallel(visits: readonly Visit[]): Visit[][] {
  const order = [...visits].sort(
    (a, b) =>
      startOf(a.members) - startOf(b.members) ||
      compareText(a.members[0]?.id ?? '', b.members[0]?.id ?? ''),
  )
  const ends = order.map((visit) => visit.aggregate.maxEnd)
  const starts = order.map((visit) => startOf(visit.members))
  const pairs: { a: number; b: number; distance: number }[] = []
  for (let a = 0; a < order.length; a += 1) {
    for (let b = a + 1; b < order.length; b += 1) {
      if ((starts[b] ?? 0) > (ends[a] ?? 0) + STREAM_MERGE_GAP_MS) break
      const visitA = order[a]
      const visitB = order[b]
      if (
        visitA === undefined ||
        visitB === undefined ||
        visitA.ownerId === visitB.ownerId
      ) {
        continue
      }
      const distance = parallelDistanceM(visitA, visitB)
      if (distance !== null && distance <= STREAM_MERGE_DISTANCE_M) {
        pairs.push({ a, b, distance })
      }
    }
  }
  pairs.sort((p, q) => p.distance - q.distance || p.a - q.a || p.b - q.b)
  const parent = order.map((_, index) => index)
  const find = (index: number): number => {
    let root = index
    while ((parent[root] ?? root) !== root) root = parent[root] ?? root
    return root
  }
  const owners = order.map((visit) => new Set([visit.ownerId]))
  for (const { a, b } of pairs) {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA === rootB) continue
    const ownersA = owners[rootA]
    const ownersB = owners[rootB]
    if (ownersA === undefined || ownersB === undefined) continue
    if ([...ownersB].some((owner) => ownersA.has(owner))) continue
    parent[rootB] = rootA
    for (const owner of ownersB) ownersA.add(owner)
  }
  const groups = new Map<number, Visit[]>()
  order.forEach((visit, index) => {
    const root = find(index)
    const list = groups.get(root)
    if (list === undefined) groups.set(root, [visit])
    else list.push(visit)
  })
  return [...groups.values()]
}

function clock(ms: number): string {
  // Formats an instant of the data; no clock is read.
  return new Date(ms).toISOString()
}

const EN_ROUTE_CONFIDENCE: Record<MovementMode, number> = {
  bike: 0.7,
  transit: 0.4,
  vehicle: 0.8,
  walk: 0.65,
}

function buildStop(
  visits: readonly Visit[],
  clips: readonly PreparedPoint[],
  duplicates: readonly string[],
  duplicateTimes: ReadonlyMap<string, number>,
): DetectedStop | null {
  const primaries = visits.flatMap((visit) => visit.members).sort(byTimeThenId)
  const first = primaries[0]
  if (first === undefined) return null
  const all = [...primaries, ...clips]
  const start = startOf(all)
  const end = endOf(all)
  const runs = visits.flatMap((visit) =>
    visit.enRoute === null ? [] : [visit.enRoute],
  )
  const enRoute = runs.length > 0
  const kind: StopKind = enRoute
    ? 'en_route'
    : visitKind(primaries) === 'stay'
      ? 'stay'
      : 'point'
  const position = positionOf(primaries)
  const derived = all.filter(
    (member) =>
      member.locationSource === 'same-stream' ||
      member.locationSource === 'cross-stream',
  ).length
  let oldest: PreparedPoint | undefined
  for (const member of all) {
    if (
      oldest === undefined ||
      member.time < oldest.time ||
      (member.time === oldest.time && compareText(member.id, oldest.id) < 0)
    ) {
      oldest = member
    }
  }
  const owners = [...new Set(all.map((member) => authorOf(member.ownerId)))]
    .filter((owner) => owner !== '')
    .sort(compareText)
  const shifted = all.filter((member) => member.shiftMs !== 0)
  const reasons: string[] = []
  const movement = enRoute ? (runs[0]?.mode ?? 'transit') : null
  if (enRoute) {
    for (const run of runs) reasons.push(run.reason)
  } else if (kind === 'stay') {
    reasons.push(
      `stay: ${String(primaries.length)} photos over ${String(Math.round((end - start) / MINUTE_MS))} min`,
    )
  } else if (primaries.length === 1) {
    reasons.push('point: a single photo is evidence of presence')
  } else {
    reasons.push(`point: ${String(primaries.length)} photos in a short moment`)
  }
  if (position === null) reasons.push('no usable position, grouped by time')
  if (derived > 0) {
    reasons.push(`${String(derived)} position(s) derived from nearby photos`)
  }
  const dropped = all.filter((member) => member.outlier).length
  if (dropped > 0) {
    reasons.push(
      `${String(dropped)} GPS fix(es) dropped as outliers, time kept`,
    )
  }
  if (visits.length > 1) {
    reasons.push(`parallel streams of ${String(visits.length)} authors merged`)
  }
  if (shifted.length > 0) {
    const hours = (shifted[0]?.shiftMs ?? 0) / 3_600_000
    reasons.push(
      `${String(shifted.length)} photo(s) placed with a proposed clock shift of ${String(hours)} h (hypothesis, not applied to the data): review`,
    )
  }
  if (clips.length > 0) {
    reasons.push(
      `${String(clips.length)} Live Photo clip(s) joined their still`,
    )
  }
  if (duplicates.length > 0) {
    reasons.push(
      `${String(duplicates.length)} probable clock-shifted duplicate(s) attached to the original`,
    )
  }
  const base = enRoute
    ? EN_ROUTE_CONFIDENCE[movement ?? 'transit'] *
      (primaries.length === 1 ? 0.8 : 1)
    : kind === 'stay'
      ? Math.min(0.9, 0.6 + 0.03 * primaries.length)
      : 0.5
  const derivedShare = derived / Math.max(1, all.length)
  const confidence = Math.min(
    1,
    Math.max(
      0.05,
      base *
        (1 - 0.3 * derivedShare) *
        (position === null ? 0.6 : 1) *
        (shifted.length > 0 ? 0.6 : 1),
    ),
  )
  return {
    anchorMediaId: (oldest ?? first).id,
    collapsed: runs.flatMap((run) => run.members),
    confidence: Math.round(confidence * 1000) / 1000,
    derivedLocationCount: derived,
    endsAt: clock(end),
    instant: all.length === 1 && start === end,
    kind,
    mediaIds: [
      ...all.sort(byTimeThenId).map((member) => member.id),
      ...[...duplicates].sort(
        (a, b) =>
          (duplicateTimes.get(a) ?? 0) - (duplicateTimes.get(b) ?? 0) ||
          compareText(a, b),
      ),
    ],
    movement,
    needsReview: shifted.length > 0,
    ownerIds: owners,
    position,
    probableDuplicateIds: [...duplicates].sort(compareText),
    reasons,
    startsAt: clock(start),
  }
}

/** Overlap of two trips (ms) and the shorter duration. */
function overlapOf(a: DetectedDayTrip, b: DetectedDayTrip) {
  const start = Math.max(Date.parse(a.startsAt), Date.parse(b.startsAt))
  const end = Math.min(Date.parse(a.endsAt), Date.parse(b.endsAt))
  const shorter = Math.min(
    Date.parse(a.endsAt) - Date.parse(a.startsAt),
    Date.parse(b.endsAt) - Date.parse(b.startsAt),
  )
  return { overlap: end - start, shorter }
}

/**
 * Shared trips: the same walk or ride of two authors is one trip. Only trips
 * of the SAME type merge, only when they overlap by at least half of the
 * shorter one and come from different authors, and a merged trip is never
 * merged again, so overlaps cannot chain into one long trip.
 */
function mergeTrips(trips: readonly DetectedDayTrip[]): DetectedDayTrip[] {
  const sorted = [...trips].sort(
    (a, b) =>
      compareText(a.startsAt, b.startsAt) ||
      compareText(a.endsAt, b.endsAt) ||
      compareText(a.tripType, b.tripType),
  )
  const out: DetectedDayTrip[] = []
  const merged = new Set<DetectedDayTrip>()
  for (const trip of sorted) {
    const partner = out.find((other) => {
      if (
        merged.has(other) ||
        other.tripType !== trip.tripType ||
        other.ownerIds.length === 0 ||
        trip.ownerIds.length === 0 ||
        other.ownerIds.some((owner) => trip.ownerIds.includes(owner))
      ) {
        return false
      }
      const { overlap, shorter } = overlapOf(other, trip)
      return shorter > 0 && overlap >= 0.5 * shorter
    })
    if (partner === undefined) {
      out.push(trip)
      continue
    }
    const longer = trip.distanceM > partner.distanceM ? trip : partner
    const union: DetectedDayTrip = {
      distanceM: longer.distanceM,
      endsAt: trip.endsAt > partner.endsAt ? trip.endsAt : partner.endsAt,
      mediaIds: [...new Set([...partner.mediaIds, ...trip.mediaIds])],
      ownerIds: [...new Set([...partner.ownerIds, ...trip.ownerIds])].sort(
        compareText,
      ),
      reason: `${longer.reason} (merged with the same trip of another author)`,
      startsAt:
        partner.startsAt < trip.startsAt ? partner.startsAt : trip.startsAt,
      tripType: longer.tripType,
    }
    out[out.indexOf(partner)] = union
    merged.add(union)
  }
  return out
}

/**
 * Detects stays, points, passing photos ("en route") and in-day trips. Pure
 * and deterministic; the result does not depend on the input order. Media
 * without a capture time are listed in `undatedMediaIds`, clock shifts are
 * only proposed (and used as a flagged hypothesis only when asked for).
 * Every input id (except `lockedMediaIds`) is in exactly one stop or in
 * `undatedMediaIds`; Live Photo clips and clock-shifted copies are members of
 * the stop of their still / original.
 */
export function detectStops(
  media: readonly MediaPoint[],
  options: DetectStopsOptions = {},
): DetectStopsResult {
  const prepared = prepareMedia(media, options)
  const byId = new Map(prepared.points.map((point) => [point.id, point]))
  // A clip is a member of the stop of its still; chains of explicit
  // `livePhotoOf` links resolve to the root, and a cycle (no root) leaves its
  // members as stops of their own so that nothing is dropped.
  const rootOf = new Map<string, string>()
  for (const point of prepared.points) {
    let current: PreparedPoint | undefined = point
    const seen = new Set<string>()
    while (
      current !== undefined &&
      current.livePhotoOf !== null &&
      byId.has(current.livePhotoOf) &&
      !seen.has(current.id)
    ) {
      seen.add(current.id)
      current = byId.get(current.livePhotoOf)
    }
    const parent = current?.livePhotoOf ?? null
    const stillClip = parent !== null && byId.has(parent)
    if (current !== undefined && !stillClip && current.id !== point.id) {
      rootOf.set(point.id, current.id)
    }
  }
  const primaries = prepared.points.filter((point) => !rootOf.has(point.id))
  const clips = prepared.points.filter((point) => rootOf.has(point.id))

  const timelines = new Map<string, PreparedPoint[]>()
  for (const point of primaries) {
    const list = timelines.get(point.ownerId)
    if (list === undefined) timelines.set(point.ownerId, [point])
    else list.push(point)
  }
  const visits: Visit[] = []
  const transits: DetectedTransit[] = []
  const trips: DetectedDayTrip[] = []
  for (const owner of [...timelines.keys()].sort(compareText)) {
    const timeline = timelines.get(owner) ?? []
    const raw = visitsOf(owner, timeline)
    const plan = planMovement(
      raw.visits.map(
        (visit, index): MovementVisit => ({
          kind: visitKind(visit.members),
          members: visit.members,
          medianGapMs: raw.medianGaps[index] ?? null,
        }),
      ),
    )
    const runAt = new Map<number, EnRouteRun>()
    for (const run of plan.runs) runAt.set(run.from, run)
    let at = 0
    while (at < raw.visits.length) {
      const run = runAt.get(at)
      const visit = raw.visits[at]
      if (visit === undefined) break
      if (run === undefined) {
        visits.push(visit)
        at += 1
        continue
      }
      const members = raw.visits
        .slice(run.from, run.to + 1)
        .flatMap((item) => item.members)
      const aggregate = newAggregate()
      for (const member of members) addTo(aggregate, member)
      visits.push({
        aggregate,
        enRoute: run,
        firstIndex: visit.firstIndex,
        members,
        ownerId: owner,
      })
      at = run.to + 1
    }
    const anchorOf = (index: number | undefined): string | null => {
      const members = raw.visits[index ?? -1]?.members
      if (members === undefined) return null
      let oldest: PreparedPoint | undefined
      for (const member of members) {
        if (oldest === undefined || member.time < oldest.time) oldest = member
      }
      return oldest?.id ?? null
    }
    for (const transit of plan.transits) {
      transits.push({
        confidence: transit.confidence,
        distanceM: transit.distanceM,
        endsAt: clock(transit.endsAt),
        fromAnchorMediaId: anchorOf(transit.from),
        mode: transit.mode,
        ownerId: authorOf(owner),
        reason: transit.reason,
        speedKmh: transit.speedKmh,
        startsAt: clock(transit.startsAt),
        toAnchorMediaId: anchorOf(transit.to),
      })
    }
    for (const trip of plan.trips) {
      trips.push({
        distanceM: trip.distanceM,
        endsAt: clock(trip.endsAt),
        mediaIds: raw.visits
          .slice(trip.from, trip.to + 1)
          .flatMap((item) => item.members)
          .map((member) => member.id),
        ownerIds: authorOf(owner) === '' ? [] : [authorOf(owner)],
        reason: trip.reason,
        startsAt: clock(trip.startsAt),
        tripType: trip.tripType,
      })
    }
  }

  const groups = mergeParallel(visits)
  const groupOf = new Map<string, number>()
  groups.forEach((group, index) => {
    for (const visit of group) {
      for (const member of visit.members) groupOf.set(member.id, index)
    }
  })
  const clipsOf = new Map<number, PreparedPoint[]>()
  for (const clip of clips) {
    const index = groupOf.get(rootOf.get(clip.id) ?? '')
    if (index === undefined) continue
    clipsOf.set(index, [...(clipsOf.get(index) ?? []), clip])
    groupOf.set(clip.id, index)
  }
  const duplicatesOf = new Map<number, string[]>()
  const duplicateTimes = new Map<string, number>()
  const timeById = new Map(media.map((item) => [item.id, item.capturedAt]))
  for (const duplicate of prepared.duplicates) {
    const index = groupOf.get(duplicate.originalId)
    if (index === undefined) continue
    duplicatesOf.set(index, [...(duplicatesOf.get(index) ?? []), duplicate.id])
    duplicateTimes.set(
      duplicate.id,
      Date.parse(timeById.get(duplicate.id) ?? ''),
    )
  }

  const stops: DetectedStop[] = []
  groups.forEach((group, index) => {
    const stop = buildStop(
      group,
      clipsOf.get(index) ?? [],
      duplicatesOf.get(index) ?? [],
      duplicateTimes,
    )
    if (stop !== null) stops.push(stop)
  })
  stops.sort(
    (a, b) =>
      compareText(a.startsAt, b.startsAt) ||
      compareText(a.anchorMediaId, b.anchorMediaId),
  )
  transits.sort(
    (a, b) =>
      compareText(a.startsAt, b.startsAt) ||
      compareText(a.fromAnchorMediaId ?? '', b.fromAnchorMediaId ?? ''),
  )

  return {
    clockShiftProposals: prepared.clockShiftProposals,
    dayTrips: mergeTrips(trips),
    duplicates: prepared.duplicates,
    outlierMediaIds: prepared.outlierMediaIds,
    stops,
    transits,
    undatedMediaIds: prepared.undatedMediaIds,
  }
}
