import { summarizeDays, suggestStageBoundaries } from './days.ts'
import { sortDated, type MediaPoint } from './media-point.ts'
import { clusterMoments, type MomentClusterOptions } from './moments.ts'
import { wallClockToInstant } from './time-zone.ts'
import {
  suggestTrips,
  type SuggestedTripType,
  type TripSuggestionOptions,
} from './trips.ts'

/** A ready media item of the journey. Only ready media are organised. */
export interface OrganizeMedia {
  capturedAt: string | null
  id: string
  latitude: number | null
  longitude: number | null
  momentId: string | null
}

export interface OrganizeMoment {
  endsAt: string
  id: string
  locked: boolean
  origin: 'auto' | 'manual'
  startsAt: string
}

export interface OrganizeSegment {
  endsAt: string
  id: string
  kind: 'stage' | 'trip'
  origin: 'manual' | 'suggested' | 'accepted' | 'rejected'
  startsAt: string
  tripType: string | null
}

export interface SegmentTitleInput {
  kind: 'stage' | 'trip'
  /** 1-based position among the suggestions of the same kind. */
  index: number
  /** First local date (YYYY-MM-DD) covered by the suggestion. */
  startsOn: string
  tripType: SuggestedTripType | null
}

export interface OrganizeOptions {
  cluster?: Pick<MomentClusterOptions, 'maxGapMinutes' | 'maxStepKm'>
  /** Journey home zone (IANA); days are cut in this zone. */
  homeTz: string
  /** Generates ids for new rows (client-generated uuids). */
  newId: () => string
  /** Localised title of a suggested segment (titles are required in the DB). */
  segmentTitle: (input: SegmentTitleInput) => string
  stageShiftKm?: number
  /** A rejected stage starting this close blocks a new suggestion. */
  rejectedBoundaryToleranceMs?: number
  trips?: TripSuggestionOptions
}

export interface OrganizeInput {
  media: readonly OrganizeMedia[]
  moments: readonly OrganizeMoment[]
  segments: readonly OrganizeSegment[]
}

export interface PlannedMoment {
  endsAt: string
  id: string
  latitude: number | null
  longitude: number | null
  mediaIds: string[]
  startsAt: string
}

export interface PlannedSegment {
  endsAt: string
  id: string
  kind: 'stage' | 'trip'
  /** Position among suggestions of the same kind. */
  position: number
  startsAt: string
  title: string
  tripType: SuggestedTripType | null
}

export interface MediaReassignment {
  mediaId: string
  momentId: string
}

export interface OrganizationPlan {
  /** Re-assignments of media into the new moments. */
  mediaReassignments: MediaReassignment[]
  /** Auto, unlocked moments that no longer group any media. */
  momentsToDelete: string[]
  momentsToCreate: PlannedMoment[]
  /** Old segments with origin 'suggested' that the fresh set replaces. */
  segmentsToDelete: string[]
  stageSuggestions: PlannedSegment[]
  tripSuggestions: PlannedSegment[]
}

export const DEFAULT_REJECTED_BOUNDARY_TOLERANCE_MS = 24 * 3_600_000
const MIN_SEGMENT_MS = 60_000

export function isPlanEmpty(plan: OrganizationPlan): boolean {
  return (
    plan.momentsToCreate.length === 0 &&
    plan.momentsToDelete.length === 0 &&
    plan.mediaReassignments.length === 0 &&
    plan.segmentsToDelete.length === 0 &&
    plan.stageSuggestions.length === 0 &&
    plan.tripSuggestions.length === 0
  )
}

interface Range {
  end: number
  start: number
}

function rangeOf(item: { endsAt: string; startsAt: string }): Range {
  return { end: Date.parse(item.endsAt), start: Date.parse(item.startsAt) }
}

function overlaps(a: Range, b: Range): boolean {
  return a.start < b.end && b.start < a.end
}

function segmentKey(
  kind: string,
  tripType: string | null,
  range: Range,
): string {
  return `${kind}|${tripType ?? ''}|${String(range.start)}|${String(range.end)}`
}

function toPoint(media: OrganizeMedia): MediaPoint {
  return {
    capturedAt: media.capturedAt,
    id: media.id,
    latitude: media.latitude,
    longitude: media.longitude,
  }
}

function planMoments(
  input: OrganizeInput,
  options: OrganizeOptions,
): Pick<
  OrganizationPlan,
  'mediaReassignments' | 'momentsToCreate' | 'momentsToDelete'
> {
  // Hand-made moments (locked or manual) are never touched or regrouped.
  const protectedIds = new Set(
    input.moments
      .filter((moment) => moment.locked || moment.origin !== 'auto')
      .map((moment) => moment.id),
  )
  const replaceable = input.moments.filter(
    (moment) => !protectedIds.has(moment.id),
  )
  const lockedMediaIds = new Set(
    input.media
      .filter(
        (item) => item.momentId !== null && protectedIds.has(item.momentId),
      )
      .map((item) => item.id),
  )

  const { moments: clusters } = clusterMoments(input.media.map(toPoint), {
    ...options.cluster,
    lockedMediaIds,
  })
  const momentOf = new Map(input.media.map((item) => [item.id, item.momentId]))
  const datedIds = new Set(clusters.flatMap((cluster) => cluster.mediaIds))

  const datedMembers = new Map<string, number>()
  const undatedHolders = new Set<string>()
  for (const item of input.media) {
    if (item.momentId === null || lockedMediaIds.has(item.id)) continue
    if (datedIds.has(item.id)) {
      datedMembers.set(
        item.momentId,
        (datedMembers.get(item.momentId) ?? 0) + 1,
      )
    } else {
      undatedHolders.add(item.momentId)
    }
  }

  const replaceableIds = new Set(replaceable.map((moment) => moment.id))
  const kept = new Set<string>()
  const momentsToCreate: PlannedMoment[] = []
  const mediaReassignments: MediaReassignment[] = []
  const byId = new Map(input.media.map((item) => [item.id, item]))

  for (const cluster of clusters) {
    const firstMoment = momentOf.get(cluster.mediaIds[0] ?? '') ?? null
    // The same group of photos keeps its existing auto moment (idempotence).
    if (
      firstMoment !== null &&
      replaceableIds.has(firstMoment) &&
      datedMembers.get(firstMoment) === cluster.mediaIds.length &&
      cluster.mediaIds.every((id) => momentOf.get(id) === firstMoment)
    ) {
      kept.add(firstMoment)
      continue
    }
    const id = options.newId()
    momentsToCreate.push({
      endsAt: cluster.endsAt,
      id,
      latitude: cluster.centroid?.latitude ?? null,
      longitude: cluster.centroid?.longitude ?? null,
      mediaIds: cluster.mediaIds,
      startsAt: cluster.startsAt,
    })
    for (const mediaId of cluster.mediaIds) {
      if (byId.get(mediaId)?.momentId !== id) {
        mediaReassignments.push({ mediaId, momentId: id })
      }
    }
  }

  const momentsToDelete = replaceable
    .filter((moment) => !kept.has(moment.id) && !undatedHolders.has(moment.id))
    .map((moment) => moment.id)

  return { mediaReassignments, momentsToCreate, momentsToDelete }
}

function dayStartMs(date: string, timeZone: string): number {
  const instant = wallClockToInstant(`${date} 00:00:00`, timeZone)
  return Date.parse(instant ?? `${date}T00:00:00Z`)
}

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

function planSegments(
  input: OrganizeInput,
  options: OrganizeOptions,
): Pick<
  OrganizationPlan,
  'segmentsToDelete' | 'stageSuggestions' | 'tripSuggestions'
> {
  const tolerance =
    options.rejectedBoundaryToleranceMs ??
    DEFAULT_REJECTED_BOUNDARY_TOLERANCE_MS
  const keptSegments = input.segments.filter(
    (segment) => segment.origin === 'manual' || segment.origin === 'accepted',
  )
  const rejected = input.segments.filter(
    (segment) => segment.origin === 'rejected',
  )
  const existingSuggested = input.segments.filter(
    (segment) => segment.origin === 'suggested',
  )

  // All dated media take part (also those in locked moments): segments are
  // about time, not about moment membership.
  const { dated } = sortDated(input.media.map(toPoint))
  const timeOf = new Map(dated.map((item) => [item.id, item.time]))

  interface Candidate {
    kind: 'stage' | 'trip'
    range: Range
    startsOn: string
    tripType: SuggestedTripType | null
  }

  // Stages: the journey is cut where the daily centre of gravity jumps.
  const stages: Candidate[] = []
  const first = dated[0]
  const last = dated[dated.length - 1]
  if (first !== undefined && last !== undefined) {
    const days = summarizeDays(dated, options.homeTz)
    const boundaries = suggestStageBoundaries(days, {
      ...(options.stageShiftKm === undefined
        ? {}
        : { minShiftKm: options.stageShiftKm }),
    })
    if (boundaries.length > 0) {
      const starts = [
        { date: days[0]?.date ?? '', ms: first.time },
        ...boundaries.map((boundary) => ({
          date: boundary.startsOn,
          ms: dayStartMs(boundary.startsOn, options.homeTz),
        })),
      ]
      starts.forEach((entry, index) => {
        const end = starts[index + 1]?.ms ?? last.time
        stages.push({
          kind: 'stage',
          range: {
            end: end > entry.ms ? end : entry.ms + MIN_SEGMENT_MS,
            start: entry.ms,
          },
          startsOn: entry.date,
          tripType: null,
        })
      })
    }
  }
  const keptStageRanges = keptSegments
    .filter((segment) => segment.kind === 'stage')
    .map(rangeOf)
  const rejectedStageStarts = rejected
    .filter((segment) => segment.kind === 'stage')
    .map((segment) => rangeOf(segment).start)
  const freshStages = stages.filter(
    (stage) =>
      !keptStageRanges.some((range) => overlaps(stage.range, range)) &&
      !rejectedStageStarts.some(
        (start) => Math.abs(start - stage.range.start) <= tolerance,
      ),
  )

  // Trips are suggested per stage window (kept stages plus fresh ones).
  const windows: Range[] = [
    ...keptStageRanges,
    ...freshStages.map((stage) => stage.range),
  ].sort((a, b) => a.start - b.start || a.end - b.end)
  const buckets: (typeof dated)[] = windows.map(() => [])
  const loose: typeof dated = []
  for (const item of dated) {
    const index = windows.findIndex(
      (window, i) =>
        item.time >= window.start &&
        (item.time < window.end ||
          (i === windows.length - 1 && item.time === window.end)),
    )
    const bucket = index < 0 ? undefined : buckets[index]
    if (bucket === undefined) loose.push(item)
    else bucket.push(item)
  }
  const keptTrips = keptSegments
    .filter((segment) => segment.kind === 'trip')
    .map(rangeOf)
  const rejectedTrips = rejected
    .filter((segment) => segment.kind === 'trip')
    .map((segment) => ({ range: rangeOf(segment), type: segment.tripType }))
  const trips: Candidate[] = []
  for (const bucket of [...buckets, loose]) {
    if (bucket.length === 0) continue
    const result = suggestTrips(
      summarizeDays(bucket, options.homeTz),
      options.trips,
    )
    for (const trip of result.trips) {
      const times = trip.mediaIds
        .map((id) => timeOf.get(id))
        .filter((time): time is number => time !== undefined)
      if (times.length === 0) continue
      const start = Math.min(...times)
      const end = Math.max(...times)
      const range = {
        end: end > start ? end : start + MIN_SEGMENT_MS,
        start,
      }
      if (
        keptTrips.some((kept) => overlaps(range, kept)) ||
        rejectedTrips.some(
          (r) => r.type === trip.tripType && overlaps(range, r.range),
        )
      ) {
        continue
      }
      trips.push({
        kind: 'trip',
        range,
        startsOn: trip.dates[0] ?? '',
        tripType: trip.tripType,
      })
    }
  }
  trips.sort((a, b) => a.range.start - b.range.start)

  // Replace the old suggestions; identical ones stay (idempotence).
  const fresh = [...freshStages, ...trips]
  const existingKeys = new Map(
    existingSuggested.map((segment) => [
      segmentKey(segment.kind, segment.tripType, rangeOf(segment)),
      segment.id,
    ]),
  )
  const keptKeys = new Set<string>()
  const toCreate: Candidate[] = []
  for (const candidate of fresh) {
    const key = segmentKey(candidate.kind, candidate.tripType, candidate.range)
    if (existingKeys.has(key) && !keptKeys.has(key)) keptKeys.add(key)
    else toCreate.push(candidate)
  }
  const keptIds = new Set(
    [...keptKeys]
      .map((key) => existingKeys.get(key))
      .filter((id) => id !== undefined),
  )
  const segmentsToDelete = existingSuggested
    .filter((segment) => !keptIds.has(segment.id))
    .map((segment) => segment.id)

  const counters = { stage: 0, trip: 0 }
  const planned = toCreate.map((candidate): PlannedSegment => {
    counters[candidate.kind] += 1
    return {
      endsAt: iso(candidate.range.end),
      id: options.newId(),
      kind: candidate.kind,
      position: counters[candidate.kind] - 1,
      startsAt: iso(candidate.range.start),
      title: options.segmentTitle({
        index: counters[candidate.kind],
        kind: candidate.kind,
        startsOn: candidate.startsOn,
        tripType: candidate.tripType,
      }),
      tripType: candidate.tripType,
    }
  })
  return {
    segmentsToDelete,
    stageSuggestions: planned.filter((segment) => segment.kind === 'stage'),
    tripSuggestions: planned.filter((segment) => segment.kind === 'trip'),
  }
}

/**
 * Plans the automatic organisation of one journey (plan 3/4): auto moments
 * are rebuilt from clusters, stage and trip suggestions replace older ones.
 * Pure: it only describes the changes; the app applies them. Hand-made data
 * always wins: locked/manual moments and their media, manual/accepted
 * segments and rejected suggestions are never changed or suggested again.
 */
export function planOrganization(
  input: OrganizeInput,
  options: OrganizeOptions,
): OrganizationPlan {
  return {
    ...planMoments(input, options),
    ...planSegments(input, options),
  }
}
