import {
  localMedianGapMs,
  medianOf,
  sparsity,
  timeThresholdMs,
} from './density.ts'
import { centroid, distanceKm, type GeoPoint } from './geo.ts'
import type { MediaPoint } from './media-point.ts'
import {
  medianPoint,
  prepareMedia,
  type ClockShiftProposal,
  type PreparedPoint,
  type PrepareOptions,
  type ProbableDuplicate,
} from './prepare.ts'

/**
 * ZS-3 stay / point detection. Per author (all devices of one person form one
 * timeline) photos are walked in time order and joined into a visit while the
 * photographer stays about the same place. The time threshold and the radius
 * follow the local density (see density.ts), so a dense morning and a sparse
 * afternoon work in one pass: in a sparse stretch every photo is deliberate
 * evidence of presence, a lone photo is a valid stop of kind 'point'. Streams
 * of different authors stay parallel unless they are close (they merge).
 * `en_route` and trips are ZS-4.
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
/** Dense walking: >= 3 small visits in a row closer than this and ... */
export const RUN_MAX_GAP_MS = 10 * MINUTE_MS
/** ... in a stretch with at most this median gap form one movement run. */
export const RUN_MAX_MEDIAN_GAP_MS = 7 * MINUTE_MS
export const RUN_MIN_VISITS = 3
/** Parallel visits of different authors closer than this are one visit. */
export const STREAM_MERGE_DISTANCE_M = 800
export const STREAM_MERGE_GAP_MS = 10 * MINUTE_MS
const SPREAD_SAMPLE = 40

export type StopKind = 'point' | 'stay'

export interface DetectedStop {
  /** Oldest photo (ties by id), stable id basis. */
  anchorMediaId: string
  /** 0..1, for ordering the work of the user, not shown as a number. */
  confidence: number
  /** Members whose position was derived (fill-in), not a real fix. */
  derivedLocationCount: number
  endsAt: string
  kind: StopKind
  /** Time-ordered members, probable duplicate copies at the end. */
  mediaIds: string[]
  ownerIds: string[]
  /** Representative position (median of the usable positions). */
  position: GeoPoint | null
  /** Copies with a wrong clock attached to their original, not own stops. */
  probableDuplicateIds: string[]
  /** Short English diagnostics for developers, not UI text. */
  reasons: string[]
  startsAt: string
}

export interface DetectStopsResult {
  clockShiftProposals: ClockShiftProposal[]
  duplicates: ProbableDuplicate[]
  outlierMediaIds: string[]
  stops: DetectedStop[]
  undatedMediaIds: string[]
}

export type DetectStopsOptions = PrepareOptions

interface Visit {
  /** Index in the owner's timeline of the first member. */
  firstIndex: number
  members: PreparedPoint[]
  ownerId: string
  /** A dense movement run (merged small visits), always a point. */
  run: boolean
}

function byTimeThenId(a: PreparedPoint, b: PreparedPoint): number {
  return a.workTime - b.workTime || a.id.localeCompare(b.id)
}

function located(members: readonly PreparedPoint[]): GeoPoint[] {
  return members.flatMap((member) =>
    member.location === null ? [] : [member.location],
  )
}

function endOf(members: readonly PreparedPoint[]): number {
  return members.reduce((end, member) => Math.max(end, member.workEnd), 0)
}

/** Median distance (m) of the latest located members to their centre. */
function spreadM(points: readonly GeoPoint[], centre: GeoPoint): number {
  const spread = medianOf(
    points
      .slice(-SPREAD_SAMPLE)
      .map((point) => distanceKm(point, centre) * 1000),
  )
  return spread ?? 0
}

function lastLocated(members: readonly PreparedPoint[]): GeoPoint | null {
  for (let at = members.length - 1; at >= 0; at -= 1) {
    const location = members[at]?.location
    if (location !== undefined && location !== null) return location
  }
  return null
}

/** Does the next photo continue the running visit? */
function joins(
  members: readonly PreparedPoint[],
  next: PreparedPoint,
  medianGapMs: number | null,
): boolean {
  const gap = next.workTime - endOf(members)
  if (gap > DWELL_CEILING_MS) return false
  const threshold = timeThresholdMs(medianGapMs)
  const centre = centroid(located(members))
  const last = lastLocated(members)
  if (next.location === null || centre === null || last === null) {
    // No place to compare: the time alone decides.
    return gap <= threshold
  }
  const fromCentre = distanceKm(centre, next.location) * 1000
  const fromLast = distanceKm(last, next.location) * 1000
  const sparse = sparsity(medianGapMs)
  const known = located(members)
  const dense =
    known.length < STAY_MIN_PHOTOS
      ? STAY_RADIUS_DEFAULT_M
      : Math.min(
          STAY_RADIUS_MAX_M,
          Math.max(
            STAY_RADIUS_MIN_M,
            STAY_SPREAD_FACTOR * spreadM(known, centre),
          ),
        )
  const radius = dense + sparse * (SPARSE_RADIUS_M - dense)
  // Dense: distance to the centre (walking cannot chain forever); sparse:
  // distance to the previous photo (a slow walk of deliberate shots chains).
  const distance = (1 - sparse) * fromCentre + sparse * fromLast
  if (gap <= threshold && distance <= radius) return true
  return fromCentre <= DWELL_RADIUS_M && fromLast <= DWELL_RADIUS_M
}

function isSmall(visit: Visit): boolean {
  const first = visit.members[0]
  return (
    first !== undefined &&
    visit.members.length < STAY_MIN_PHOTOS &&
    endOf(visit.members) - first.workTime < STAY_MIN_DURATION_MS
  )
}

/** Walk one author's timeline into visits. */
function visitsOf(
  ownerId: string,
  timeline: readonly PreparedPoint[],
): Visit[] {
  const times = timeline.map((point) => point.workTime)
  const visits: Visit[] = []
  timeline.forEach((point, index) => {
    const current = visits[visits.length - 1]
    if (
      current !== undefined &&
      joins(current.members, point, localMedianGapMs(times, index))
    ) {
      current.members.push(point)
    } else {
      visits.push({ firstIndex: index, members: [point], ownerId, run: false })
    }
  })
  // Dense walking with a shot every few minutes is one movement, not many
  // visits. Merged as a point; ZS-4 classifies it (walk, ride, ...).
  const merged: Visit[] = []
  let at = 0
  while (at < visits.length) {
    let end = at
    const first = visits[at]
    if (first !== undefined && isSmall(first)) {
      while (end + 1 < visits.length) {
        const previous = visits[end]
        const next = visits[end + 1]
        if (
          previous === undefined ||
          next === undefined ||
          !isSmall(next) ||
          (next.members[0]?.workTime ?? 0) - endOf(previous.members) >
            RUN_MAX_GAP_MS ||
          (localMedianGapMs(times, next.firstIndex) ?? Infinity) >
            RUN_MAX_MEDIAN_GAP_MS
        ) {
          break
        }
        end += 1
      }
    }
    if (first !== undefined && end - at + 1 >= RUN_MIN_VISITS) {
      merged.push({
        firstIndex: first.firstIndex,
        members: visits.slice(at, end + 1).flatMap((visit) => visit.members),
        ownerId,
        run: true,
      })
      at = end + 1
    } else if (first !== undefined) {
      merged.push(first)
      at += 1
    } else {
      at += 1
    }
  }
  return merged
}

function positionOf(members: readonly PreparedPoint[]): GeoPoint | null {
  return medianPoint(located(members))
}

/** Parallel visits of different authors that are close and overlap in time. */
function mergeParallel(visits: readonly Visit[]): Visit[][] {
  const order = [...visits].sort(
    (a, b) =>
      (a.members[0]?.workTime ?? 0) - (b.members[0]?.workTime ?? 0) ||
      (a.members[0]?.id ?? '').localeCompare(b.members[0]?.id ?? ''),
  )
  const parent = order.map((_, index) => index)
  const find = (index: number): number => {
    let root = index
    while ((parent[root] ?? root) !== root) root = parent[root] ?? root
    return root
  }
  const positions = order.map((visit) => positionOf(visit.members))
  const ends = order.map((visit) => endOf(visit.members))
  for (let a = 0; a < order.length; a += 1) {
    const positionA = positions[a]
    for (let b = a + 1; b < order.length; b += 1) {
      const startB = order[b]?.members[0]?.workTime ?? 0
      if (startB > (ends[a] ?? 0) + STREAM_MERGE_GAP_MS) break
      const positionB = positions[b]
      if (
        order[a]?.ownerId === order[b]?.ownerId ||
        positionA === null ||
        positionA === undefined ||
        positionB === null ||
        positionB === undefined ||
        distanceKm(positionA, positionB) * 1000 > STREAM_MERGE_DISTANCE_M
      ) {
        continue
      }
      parent[find(b)] = find(a)
    }
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
  const start = Math.min(...all.map((member) => member.workTime))
  const end = endOf(all)
  const run = visits.length === 1 && visits[0]?.run === true
  const kind: StopKind =
    !run &&
    (primaries.length >= STAY_MIN_PHOTOS || end - start >= STAY_MIN_DURATION_MS)
      ? 'stay'
      : 'point'
  const position = positionOf(primaries)
  const derived = all.filter(
    (member) =>
      member.locationSource === 'same-stream' ||
      member.locationSource === 'cross-stream',
  ).length
  const oldest = [...all].sort(
    (a, b) => a.time - b.time || a.id.localeCompare(b.id),
  )[0]
  const owners = [...new Set(all.map((member) => member.ownerId))].sort()
  const shifted = all.filter((member) => member.shiftMs !== 0)
  const reasons: string[] = []
  if (run) {
    reasons.push(
      `dense movement run of ${String(primaries.length)} photos, no stay (classified later)`,
    )
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
  if (owners.length > 1) {
    reasons.push(`parallel streams of ${String(owners.length)} authors merged`)
  }
  if (shifted.length > 0) {
    const hours = (shifted[0]?.shiftMs ?? 0) / 3_600_000
    reasons.push(
      `${String(shifted.length)} photo(s) placed with a proposed clock shift of ${String(hours)} h (not applied to the data)`,
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
  const base = run
    ? 0.35
    : kind === 'stay'
      ? Math.min(0.9, 0.6 + 0.03 * primaries.length)
      : 0.5
  const derivedShare = derived / Math.max(1, all.length)
  const confidence = Math.min(
    1,
    Math.max(
      0.05,
      base * (1 - 0.3 * derivedShare) * (position === null ? 0.6 : 1),
    ),
  )
  return {
    anchorMediaId: (oldest ?? first).id,
    confidence: Math.round(confidence * 1000) / 1000,
    derivedLocationCount: derived,
    endsAt: clock(end),
    kind,
    mediaIds: [
      ...all.sort(byTimeThenId).map((member) => member.id),
      ...[...duplicates].sort(
        (a, b) =>
          (duplicateTimes.get(a) ?? 0) - (duplicateTimes.get(b) ?? 0) ||
          a.localeCompare(b),
      ),
    ],
    ownerIds: owners,
    position,
    probableDuplicateIds: [...duplicates].sort(),
    reasons,
    startsAt: clock(start),
  }
}

/**
 * Detects stays and points. Pure and deterministic; the result does not
 * depend on the input order. Media without a capture time are listed in
 * `undatedMediaIds`, clock shifts are only proposed.
 */
export function detectStops(
  media: readonly MediaPoint[],
  options: DetectStopsOptions = {},
): DetectStopsResult {
  const prepared = prepareMedia(media, options)
  const present = new Set(prepared.points.map((point) => point.id))
  const isClip = (point: PreparedPoint): boolean =>
    point.livePhotoOf !== null && present.has(point.livePhotoOf)
  const primaries = prepared.points.filter((point) => !isClip(point))
  const clips = prepared.points.filter(isClip)

  const timelines = new Map<string, PreparedPoint[]>()
  for (const point of primaries) {
    const list = timelines.get(point.ownerId)
    if (list === undefined) timelines.set(point.ownerId, [point])
    else list.push(point)
  }
  const visits: Visit[] = []
  for (const owner of [...timelines.keys()].sort()) {
    visits.push(...visitsOf(owner, timelines.get(owner) ?? []))
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
    const index = groupOf.get(clip.livePhotoOf ?? '')
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
      a.startsAt.localeCompare(b.startsAt) ||
      a.anchorMediaId.localeCompare(b.anchorMediaId),
  )

  return {
    clockShiftProposals: prepared.clockShiftProposals,
    duplicates: prepared.duplicates,
    outlierMediaIds: prepared.outlierMediaIds,
    stops,
    undatedMediaIds: prepared.undatedMediaIds,
  }
}
