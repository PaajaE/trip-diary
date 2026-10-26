import { medianOf } from './density.ts'
import { distanceKm, type GeoPoint } from './geo.ts'
import {
  pointOf,
  sortDated,
  type DatedMediaPoint,
  type MediaPoint,
} from './media-point.ts'

/**
 * ZS-3 preparation: streams by author and device, GPS outliers, location
 * fill-in, a proposed camera clock shift and clock-shifted duplicate copies.
 * Pure and deterministic; the output does not depend on the input order.
 * Nothing here changes stored data: shifts are only PROPOSED (for the
 * `shift_media_time` action) and used as a labelled working hypothesis.
 */

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000

/** A GPS fix is judged against neighbours of the same stream within this. */
export const OUTLIER_NEIGHBOUR_WINDOW_MS = 30 * MINUTE_MS
/** At least this many neighbours are needed to judge a fix by the median. */
export const OUTLIER_MIN_NEIGHBOURS = 3
/** A fix is an outlier when farther from the neighbours' median than ... */
export const OUTLIER_MIN_DISTANCE_KM = 2
/** ... and than this many times the spread of the neighbours. */
export const OUTLIER_SPREAD_FACTOR = 4
/** Implied speed above this (both ways, spike) means a bad fix. */
export const OUTLIER_MAX_SPEED_KMH = 250
/** The neighbours must agree: this share lies within 1 km of their median
 * (a lone photo between two places is not a bad fix). */
export const OUTLIER_TIGHT_KM = 1
export const OUTLIER_TIGHT_SHARE = 0.75
const OUTLIER_SPEED_MIN_KM = 1
const OUTLIER_MAX_NEIGHBOURS_PER_SIDE = 40

/** Derived positions are looked for within this time from a real fix. */
export const FILL_WINDOW_MS = 60 * MINUTE_MS
/** Derived positions below this confidence are not used (time only). */
export const FILL_MIN_CONFIDENCE = 0.5
/** Interpolating between fixes farther apart than this halves the trust. */
export const FILL_MAX_SPAN_KM = 1

/** A copy sits at the same place (<= 3 m) as the original ... */
export const DUPLICATE_MAX_DISTANCE_KM = 0.003
/** ... and its time differs by a whole number of hours (+- 60 s) ... */
export const DUPLICATE_HOUR_TOLERANCE_MS = 60_000
/** ... of at most this many hours. */
export const MAX_SHIFT_HOURS = 14

/** Stream clock shift: a photo "matches" a GPS-stream photo within this. */
export const STREAM_MATCH_MS = 5 * MINUTE_MS
export const STREAM_MIN_PHOTOS = 5
const STREAM_MAX_GPS_SHARE = 0.2
const STREAM_MIN_PARTNER_GPS_SHARE = 0.5
const STREAM_MIN_MATCH = 0.7
const STREAM_MAX_MATCH_UNSHIFTED = 0.2
const STREAM_MIN_MARGIN = 0.2

/** A video this short next to a still is the clip of a Live Photo. */
export const LIVE_PHOTO_MAX_CLIP_MS = 5000
export const LIVE_PHOTO_MAX_GAP_MS = 2000
export const LIVE_PHOTO_MAX_DISTANCE_KM = 0.03

export type LocationSource = 'cross-stream' | 'gps' | 'none' | 'same-stream'

export interface PreparedPoint {
  /** 0..1; 1 for a real fix, lower for derived positions, 0 for none. */
  confidence: number
  device: string | null
  id: string
  /** Id of the still when this is the clip of a Live Photo, else null. */
  livePhotoOf: string | null
  /** Usable position (real fix that passed the filter, or derived). */
  location: GeoPoint | null
  locationSource: LocationSource
  /** The real fix was dropped as an outlier (time is kept). */
  outlier: boolean
  /** Author, '' when unknown. */
  ownerId: string
  /** Applied hypothetical clock shift in ms (0 = none). */
  shiftMs: number
  streamKey: string
  /** Recorded capture instant (epoch ms). */
  time: number
  /** Time used for grouping: `time + shiftMs`. */
  workEnd: number
  workTime: number
}

export interface ClockShiftProposal {
  confidence: number
  deviceId: string | null
  evidence: string
  /** 'stream-offset': a whole-hour offset against the GPS stream of the same
   * author; 'duplicate-copy': copies of earlier photos with a shifted clock. */
  kind: 'duplicate-copy' | 'stream-offset'
  mediaIds: string[]
  /** Seconds to ADD to the capture time of `mediaIds` to correct them. */
  offsetSeconds: number
  ownerId: string | null
}

export interface ProbableDuplicate {
  id: string
  originalId: string
  /** Seconds to add to the copy to land on the original's instant. */
  offsetSeconds: number
}

export interface PrepareOptions {
  /** Use proposed stream shifts as a working hypothesis (default true). */
  applyProposedClockShifts?: boolean
  /** Media that belong to locked (hand-curated) moments; left out. */
  lockedMediaIds?: ReadonlySet<string>
}

export interface PrepareResult {
  clockShiftProposals: ClockShiftProposal[]
  duplicates: ProbableDuplicate[]
  outlierMediaIds: string[]
  points: PreparedPoint[]
  undatedMediaIds: string[]
}

interface Draft {
  confidence: number
  device: string | null
  duplicateOf: string | null
  durationMs: number
  id: string
  liveOf: string | null
  location: GeoPoint | null
  outlier: boolean
  ownerId: string
  raw: GeoPoint | null
  shiftMs: number
  source: LocationSource
  src: DatedMediaPoint
  streamKey: string
  time: number
}

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id.localeCompare(b.id)
}

function lowerBound(
  items: readonly Draft[],
  time: number,
  at: (draft: Draft) => number,
): number {
  let low = 0
  let high = items.length
  while (low < high) {
    const middle = (low + high) >> 1
    const item = items[middle]
    if (item !== undefined && at(item) < time) low = middle + 1
    else high = middle
  }
  return low
}

const workOf = (draft: Draft): number => draft.time + draft.shiftMs

function groupBy<T>(items: readonly T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const list = groups.get(key(item))
    if (list === undefined) groups.set(key(item), [item])
    else list.push(item)
  }
  return groups
}

export function medianPoint(points: readonly GeoPoint[]): GeoPoint | null {
  const latitude = medianOf(points.map((point) => point.latitude))
  const longitude = medianOf(points.map((point) => point.longitude))
  return latitude === null || longitude === null
    ? null
    : { latitude, longitude }
}

// --- Live Photo -------------------------------------------------------------

function linkLivePhotos(drafts: readonly Draft[]): void {
  const known = new Map(drafts.map((draft) => [draft.id, draft]))
  const claimed = new Set<string>()
  for (const [index, clip] of drafts.entries()) {
    if (clip.src.kind !== 'video') continue
    const explicit = clip.src.livePhotoOf ?? null
    if (explicit !== null) {
      const still = known.get(explicit)
      if (
        still !== undefined &&
        still.id !== clip.id &&
        !claimed.has(still.id)
      ) {
        clip.liveOf = still.id
        claimed.add(still.id)
      }
      continue
    }
    if (clip.durationMs > LIVE_PHOTO_MAX_CLIP_MS) continue
    let best: Draft | null = null
    let bestGap = Number.POSITIVE_INFINITY
    for (const direction of [-1, 1]) {
      for (
        let at = index + direction;
        at >= 0 && at < drafts.length;
        at += direction
      ) {
        const other = drafts[at]
        if (other === undefined) break
        const gap = Math.abs(other.time - clip.time)
        if (gap > LIVE_PHOTO_MAX_GAP_MS) break
        if (
          other.src.kind === 'video' ||
          other.streamKey !== clip.streamKey ||
          claimed.has(other.id)
        ) {
          continue
        }
        const near =
          other.raw === null ||
          clip.raw === null ||
          distanceKm(other.raw, clip.raw) <= LIVE_PHOTO_MAX_DISTANCE_KM
        if (
          near &&
          (gap < bestGap ||
            (gap === bestGap && best !== null && other.id < best.id))
        ) {
          best = other
          bestGap = gap
        }
      }
    }
    if (best !== null) {
      clip.liveOf = best.id
      claimed.add(best.id)
    }
  }
}

// --- Outliers ---------------------------------------------------------------

function speedKmh(a: Draft, b: Draft): number {
  if (a.raw === null || b.raw === null) return 0
  const hours = Math.abs(b.time - a.time) / HOUR_MS
  const km = distanceKm(a.raw, b.raw)
  return hours === 0 ? (km > 0 ? Number.POSITIVE_INFINITY : 0) : km / hours
}

/**
 * A fix is an outlier when it is far from the median of its neighbours
 * (+- 30 min, same stream) compared to their own spread, or when it is a
 * spike with an impossible speed both ways although its neighbours are
 * consistent with each other. It loses the position, never the time.
 */
function markOutliers(streams: Map<string, Draft[]>): void {
  for (const stream of streams.values()) {
    const located = stream.filter((draft) => draft.raw !== null)
    const flagged: Draft[] = []
    located.forEach((draft, index) => {
      const own = draft.raw
      if (own === null) return
      const neighbours: GeoPoint[] = []
      for (const direction of [-1, 1]) {
        let taken = 0
        for (
          let at = index + direction;
          at >= 0 && at < located.length;
          at += direction
        ) {
          const other = located[at]
          if (
            other?.raw == null ||
            Math.abs(other.time - draft.time) > OUTLIER_NEIGHBOUR_WINDOW_MS ||
            taken >= OUTLIER_MAX_NEIGHBOURS_PER_SIDE
          ) {
            break
          }
          neighbours.push(other.raw)
          taken += 1
        }
      }
      let bad = false
      if (neighbours.length >= OUTLIER_MIN_NEIGHBOURS) {
        const middle = medianPoint(neighbours)
        if (middle !== null) {
          const away = distanceKm(own, middle)
          const spread =
            medianOf(neighbours.map((point) => distanceKm(point, middle))) ?? 0
          const tight =
            neighbours.filter(
              (point) => distanceKm(point, middle) <= OUTLIER_TIGHT_KM,
            ).length >=
            OUTLIER_TIGHT_SHARE * neighbours.length
          // A photo on the way between two places is far from the median of
          // its neighbours too; only a detour from the path is a bad fix.
          const before = located[index - 1]?.raw ?? null
          const after = located[index + 1]?.raw ?? null
          const detour =
            before === null || after === null
              ? Number.POSITIVE_INFINITY
              : distanceKm(before, own) +
                distanceKm(own, after) -
                distanceKm(before, after)
          bad =
            tight &&
            away > OUTLIER_MIN_DISTANCE_KM &&
            away > OUTLIER_SPREAD_FACTOR * spread &&
            detour > OUTLIER_MIN_DISTANCE_KM
        }
      }
      const previous = located[index - 1]
      const next = located[index + 1]
      if (
        !bad &&
        previous !== undefined &&
        next !== undefined &&
        previous.raw !== null &&
        next.raw !== null &&
        distanceKm(previous.raw, own) > OUTLIER_SPEED_MIN_KM &&
        distanceKm(own, next.raw) > OUTLIER_SPEED_MIN_KM
      ) {
        bad =
          speedKmh(previous, draft) > OUTLIER_MAX_SPEED_KMH &&
          speedKmh(draft, next) > OUTLIER_MAX_SPEED_KMH &&
          speedKmh(previous, next) <= OUTLIER_MAX_SPEED_KMH
      }
      if (bad) flagged.push(draft)
    })
    for (const draft of flagged) draft.outlier = true
  }
}

// --- Clock-shifted duplicate copies ----------------------------------------

function cellOf(point: GeoPoint): [number, number] {
  return [Math.round(point.latitude * 1e4), Math.round(point.longitude * 1e4)]
}

/**
 * Real-data finding: a photo exists twice, the copy has no `captured_tz`, the
 * very same coordinates and a clock that is a whole number of hours off. Such
 * a copy would form its own stop hours away at the same place.
 */
function findDuplicates(drafts: readonly Draft[]): ProbableDuplicate[] {
  const grid = new Map<string, Draft[]>()
  for (const draft of drafts) {
    if (
      draft.raw === null ||
      draft.outlier ||
      (draft.src.capturedTz ?? null) === null
    ) {
      continue
    }
    const [row, column] = cellOf(draft.raw)
    const key = `${String(row)}:${String(column)}`
    const cell = grid.get(key)
    if (cell === undefined) grid.set(key, [draft])
    else cell.push(draft)
  }
  const found: ProbableDuplicate[] = []
  for (const copy of drafts) {
    if (
      copy.raw === null ||
      copy.outlier ||
      (copy.src.capturedTz ?? null) !== null
    ) {
      continue
    }
    const [row, column] = cellOf(copy.raw)
    let best: { hours: number; original: Draft; residual: number } | null = null
    for (let dRow = -1; dRow <= 1; dRow += 1) {
      for (let dColumn = -1; dColumn <= 1; dColumn += 1) {
        const cell = grid.get(
          `${String(row + dRow)}:${String(column + dColumn)}`,
        )
        for (const original of cell ?? []) {
          if (
            original.id === copy.id ||
            original.ownerId !== copy.ownerId ||
            original.raw === null ||
            distanceKm(original.raw, copy.raw) > DUPLICATE_MAX_DISTANCE_KM
          ) {
            continue
          }
          const delta = copy.time - original.time
          const hours = Math.round(delta / HOUR_MS)
          const residual = Math.abs(delta - hours * HOUR_MS)
          if (
            hours === 0 ||
            Math.abs(hours) > MAX_SHIFT_HOURS ||
            residual >= DUPLICATE_HOUR_TOLERANCE_MS
          ) {
            continue
          }
          if (
            best === null ||
            Math.abs(hours) < Math.abs(best.hours) ||
            (Math.abs(hours) === Math.abs(best.hours) &&
              (residual < best.residual ||
                (residual === best.residual && original.id < best.original.id)))
          ) {
            best = { hours, original, residual }
          }
        }
      }
    }
    if (best !== null) {
      copy.duplicateOf = best.original.id
      found.push({
        id: copy.id,
        offsetSeconds: -best.hours * 3600,
        originalId: best.original.id,
      })
    }
  }
  return found.sort(byId)
}

function duplicateProposals(
  duplicates: readonly ProbableDuplicate[],
  drafts: ReadonlyMap<string, Draft>,
): ClockShiftProposal[] {
  const groups = groupBy(duplicates, (duplicate) => {
    const copy = drafts.get(duplicate.id)
    return `${copy?.streamKey ?? ''}|${String(duplicate.offsetSeconds)}`
  })
  const proposals: ClockShiftProposal[] = []
  for (const [, list] of [...groups.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const first = list[0]
    const copy = first === undefined ? undefined : drafts.get(first.id)
    if (first === undefined || copy === undefined) continue
    const hours = first.offsetSeconds / 3600
    proposals.push({
      confidence: 0.9,
      deviceId: copy.device,
      evidence: `${String(list.length)} photo(s) repeat earlier photos at the same coordinates (within 3 m), their clock is ${String(Math.abs(hours))} h ${hours > 0 ? 'behind' : 'ahead'} and the originals carry a time zone`,
      kind: 'duplicate-copy',
      mediaIds: list.map((duplicate) => duplicate.id).sort(),
      offsetSeconds: first.offsetSeconds,
      ownerId: copy.ownerId === '' ? null : copy.ownerId,
    })
  }
  return proposals
}

// --- Stream clock offset ----------------------------------------------------

interface Stream {
  device: string | null
  drafts: Draft[]
  gpsShare: number
  key: string
}

function matchShare(
  candidate: Stream,
  partnerTimes: readonly number[],
  offsetMs: number,
): number {
  let matched = 0
  for (const draft of candidate.drafts) {
    const target = draft.time + offsetMs
    let low = 0
    let high = partnerTimes.length
    while (low < high) {
      const middle = (low + high) >> 1
      const value = partnerTimes[middle]
      if (value !== undefined && value < target) low = middle + 1
      else high = middle
    }
    const after = partnerTimes[low]
    const before = partnerTimes[low - 1]
    if (
      (after !== undefined && after - target <= STREAM_MATCH_MS) ||
      (before !== undefined && target - before <= STREAM_MATCH_MS)
    ) {
      matched += 1
    }
  }
  return matched / candidate.drafts.length
}

/**
 * A stream with (almost) no GPS whose times line up with the GPS stream of
 * the same author only after a whole number of hours is a camera with a
 * wrong clock. Returns proposals; the caller decides what to do with them.
 */
function proposeStreamOffsets(streams: ReadonlyMap<string, Draft[]>): {
  proposals: ClockShiftProposal[]
  shifts: Map<string, number>
} {
  const proposals: ClockShiftProposal[] = []
  const shifts = new Map<string, number>()
  const byOwner = groupBy(
    [...streams.entries()].sort(([a], [b]) => a.localeCompare(b)),
    ([, drafts]) => drafts[0]?.ownerId ?? '',
  )
  for (const entries of byOwner.values()) {
    const owned: Stream[] = entries.flatMap(([key, drafts]) => {
      const first = drafts[0]
      if (first === undefined) return []
      const withGps = drafts.filter((d) => d.raw !== null && !d.outlier)
      return [
        {
          device: first.device,
          drafts,
          gpsShare: withGps.length / drafts.length,
          key,
        },
      ]
    })
    for (const camera of owned) {
      if (
        camera.drafts.length < STREAM_MIN_PHOTOS ||
        camera.gpsShare > STREAM_MAX_GPS_SHARE
      ) {
        continue
      }
      let chosen: {
        hours: number
        partner: Stream
        score: number
        unshifted: number
      } | null = null
      for (const partner of owned) {
        if (
          partner.key === camera.key ||
          partner.drafts.length < STREAM_MIN_PHOTOS ||
          partner.gpsShare < STREAM_MIN_PARTNER_GPS_SHARE
        ) {
          continue
        }
        const times = partner.drafts.map((draft) => draft.time)
        const unshifted = matchShare(camera, times, 0)
        if (unshifted > STREAM_MAX_MATCH_UNSHIFTED) continue
        const scores: { hours: number; score: number }[] = []
        for (
          let hours = -MAX_SHIFT_HOURS;
          hours <= MAX_SHIFT_HOURS;
          hours += 1
        ) {
          if (hours !== 0) {
            scores.push({
              hours,
              score: matchShare(camera, times, hours * HOUR_MS),
            })
          }
        }
        scores.sort(
          (a, b) => b.score - a.score || Math.abs(a.hours) - Math.abs(b.hours),
        )
        const top = scores[0]
        const second = scores[1]
        if (
          top === undefined ||
          top.score < STREAM_MIN_MATCH ||
          (second !== undefined && second.score > top.score - STREAM_MIN_MARGIN)
        ) {
          continue
        }
        if (chosen === null || top.score > chosen.score) {
          chosen = { hours: top.hours, partner, score: top.score, unshifted }
        }
      }
      if (chosen === null) continue
      const matched = Math.round(chosen.score * camera.drafts.length)
      proposals.push({
        confidence: Math.min(0.95, 0.5 + 0.45 * chosen.score),
        deviceId: camera.device,
        evidence: `${String(matched)} of ${String(camera.drafts.length)} photos of this device line up (within 5 min) with the GPS stream of the same author only after ${chosen.hours > 0 ? '+' : ''}${String(chosen.hours)} h; unshifted ${String(Math.round(chosen.unshifted * 100))} %`,
        kind: 'stream-offset',
        mediaIds: camera.drafts.map((draft) => draft.id).sort(),
        offsetSeconds: chosen.hours * 3600,
        ownerId:
          camera.drafts[0]?.ownerId === ''
            ? null
            : (camera.drafts[0]?.ownerId ?? null),
      })
      shifts.set(camera.key, chosen.hours * HOUR_MS)
    }
  }
  return { proposals, shifts }
}

// --- Location fill-in -------------------------------------------------------

function baseConfidence(gapMs: number): number {
  return Math.min(0.9, Math.max(0.5, 0.9 - (0.4 * gapMs) / HOUR_MS))
}

interface Fill {
  confidence: number
  location: GeoPoint
  source: LocationSource
}

function lerp(a: GeoPoint, b: GeoPoint, share: number): GeoPoint {
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * share,
    longitude: a.longitude + (b.longitude - a.longitude) * share,
  }
}

function sameStreamFill(draft: Draft, anchors: readonly Draft[]): Fill | null {
  const time = workOf(draft)
  const index = lowerBound(anchors, time, workOf)
  const before = anchors[index - 1]
  const after = anchors[index]
  const gapBefore = before === undefined ? Infinity : time - workOf(before)
  const gapAfter = after === undefined ? Infinity : workOf(after) - time
  const beforeOk = gapBefore <= FILL_WINDOW_MS
  const afterOk = gapAfter <= FILL_WINDOW_MS
  const from = before?.raw ?? null
  const to = after?.raw ?? null
  if (beforeOk && afterOk && from !== null && to !== null) {
    const span = gapBefore + gapAfter
    const trust = distanceKm(from, to) <= FILL_MAX_SPAN_KM ? 1 : 0.5
    return {
      confidence: baseConfidence(Math.min(gapBefore, gapAfter)) * trust,
      location: lerp(from, to, span === 0 ? 0 : gapBefore / span),
      source: 'same-stream',
    }
  }
  if (beforeOk && from !== null && (!afterOk || gapBefore <= gapAfter)) {
    return {
      confidence: baseConfidence(gapBefore) * 0.9,
      location: from,
      source: 'same-stream',
    }
  }
  if (afterOk && to !== null) {
    return {
      confidence: baseConfidence(gapAfter) * 0.9,
      location: to,
      source: 'same-stream',
    }
  }
  return null
}

function crossStreamFill(
  draft: Draft,
  others: readonly (readonly Draft[])[],
): Fill | null {
  const time = workOf(draft)
  let best: { gap: number; location: GeoPoint } | null = null
  for (const anchors of others) {
    const index = lowerBound(anchors, time, workOf)
    for (const candidate of [anchors[index - 1], anchors[index]]) {
      if (candidate?.raw == null) continue
      const gap = Math.abs(workOf(candidate) - time)
      if (gap <= FILL_WINDOW_MS && (best === null || gap < best.gap)) {
        best = { gap, location: candidate.raw }
      }
    }
  }
  return best === null
    ? null
    : {
        confidence: baseConfidence(best.gap) * 0.9,
        location: best.location,
        source: 'cross-stream',
      }
}

function fillLocations(streams: ReadonlyMap<string, Draft[]>): void {
  const anchorsOf = new Map<string, Draft[]>()
  for (const [key, drafts] of streams) {
    anchorsOf.set(
      key,
      drafts
        .filter(
          (draft) =>
            draft.raw !== null && !draft.outlier && draft.duplicateOf === null,
        )
        .sort((a, b) => workOf(a) - workOf(b) || byId(a, b)),
    )
  }
  const keysOfOwner = groupBy([...streams.keys()].sort(), (key) => {
    return streams.get(key)?.[0]?.ownerId ?? ''
  })
  for (const [key, drafts] of streams) {
    const owner = drafts[0]?.ownerId ?? ''
    const others = (keysOfOwner.get(owner) ?? [])
      .filter((other) => other !== key)
      .map((other) => anchorsOf.get(other) ?? [])
    const own = anchorsOf.get(key) ?? []
    for (const draft of drafts) {
      if (
        draft.duplicateOf !== null ||
        (draft.raw !== null && !draft.outlier)
      ) {
        continue
      }
      const candidates = [
        sameStreamFill(draft, own),
        crossStreamFill(draft, others),
      ]
      let best: Fill | null = null
      for (const fill of candidates) {
        if (
          fill !== null &&
          (best === null || fill.confidence > best.confidence)
        ) {
          best = fill
        }
      }
      if (best !== null && best.confidence >= FILL_MIN_CONFIDENCE) {
        draft.location = best.location
        draft.confidence = best.confidence
        draft.source = best.source
      }
    }
  }
}

// --- Entry ------------------------------------------------------------------

export function prepareMedia(
  media: readonly MediaPoint[],
  options: PrepareOptions = {},
): PrepareResult {
  const locked = options.lockedMediaIds ?? new Set<string>()
  const { dated, undated } = sortDated(
    media.filter((item) => !locked.has(item.id)),
  )
  const drafts: Draft[] = dated.map((item) => {
    const ownerId = item.ownerId ?? ''
    const device = item.device ?? null
    const raw = pointOf(item)
    return {
      confidence: raw === null ? 0 : 1,
      device,
      duplicateOf: null,
      durationMs: item.kind === 'video' ? Math.max(0, item.durationMs ?? 0) : 0,
      id: item.id,
      liveOf: null,
      location: raw,
      outlier: false,
      ownerId,
      raw,
      shiftMs: 0,
      source: raw === null ? 'none' : 'gps',
      src: item,
      streamKey: `${ownerId}\u0000${device ?? ''}`,
      time: item.time,
    }
  })

  linkLivePhotos(drafts)
  const streams = groupBy(drafts, (draft) => draft.streamKey)
  markOutliers(streams)
  for (const draft of drafts) {
    if (draft.outlier) {
      draft.location = null
      draft.confidence = 0
      draft.source = 'none'
    }
  }

  const draftById = new Map(drafts.map((draft) => [draft.id, draft]))
  const duplicates = findDuplicates(drafts)
  const proposals = duplicateProposals(duplicates, draftById)

  const regular = groupBy(
    drafts.filter((draft) => draft.duplicateOf === null),
    (draft) => draft.streamKey,
  )
  const streamOffsets = proposeStreamOffsets(regular)
  proposals.push(...streamOffsets.proposals)
  if (options.applyProposedClockShifts !== false) {
    for (const draft of drafts) {
      draft.shiftMs = streamOffsets.shifts.get(draft.streamKey) ?? 0
    }
  }

  fillLocations(regular)

  const points: PreparedPoint[] = drafts
    .filter((draft) => draft.duplicateOf === null)
    .map((draft) => ({
      confidence: draft.confidence,
      device: draft.device,
      id: draft.id,
      livePhotoOf: draft.liveOf,
      location: draft.location,
      locationSource: draft.source,
      outlier: draft.outlier,
      ownerId: draft.ownerId,
      shiftMs: draft.shiftMs,
      streamKey: draft.streamKey,
      time: draft.time,
      workEnd: workOf(draft) + draft.durationMs,
      workTime: workOf(draft),
    }))
    .sort((a, b) => a.workTime - b.workTime || byId(a, b))

  return {
    clockShiftProposals: proposals,
    duplicates,
    outlierMediaIds: drafts
      .filter((draft) => draft.outlier)
      .map((draft) => draft.id)
      .sort(),
    points,
    undatedMediaIds: undated.map((item) => item.id),
  }
}
