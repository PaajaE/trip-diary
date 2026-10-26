import { DAY_START_HOUR } from './local-day.ts'
import { summarizeZonedDays, type ZonedDaySummary } from './days.ts'
import { sortDated, type MediaPoint } from './media-point.ts'
import { detectStops, type DetectedDayTrip, type StopKind } from './stays.ts'
import {
  findJourneyTrips,
  planJourney,
  type DayPlace,
  type JourneyDay,
  type JourneyStageKind,
  type JourneyTrip,
  type PlaceKind,
} from './journey-plan.ts'
import {
  CS_NAME_LABELS,
  nameStage,
  tripNames,
  stageHomeName,
  type NameLabels,
} from './names.ts'
import type { StagePlanOptions, StageTripKind } from './stages.ts'
import { compareText } from './compare.ts'
import { wallClockToInstant } from './time-zone.ts'
import type { SuggestedTripType } from './trips.ts'

/** A ready media item of the journey. Only ready media are organised. */
export interface OrganizeMedia {
  /** Altitude (m), when known. */
  altitude?: number | null | undefined
  capturedAt: string | null
  /** IANA zone the media was taken in, when known. */
  capturedTz?: string | null | undefined
  /** Normalised capture device (EXIF make + model), when known. */
  device?: string | null | undefined
  /** Video length in ms. */
  durationMs?: number | null | undefined
  id: string
  kind?: 'photo' | 'video' | null | undefined
  /** Id of the still when this video is the clip of a Live Photo. */
  livePhotoOf?: string | null | undefined
  latitude: number | null
  longitude: number | null
  momentId: string | null
  /** Author (stream key for parallel stops). */
  ownerId?: string | null | undefined
  /**
   * Kind of the place the media was geocoded to (within ~150 m). When absent
   * the place of the moment it belongs to is used (not of 'en_route' ones).
   */
  placeKind?: PlaceKind | null | undefined
}

export interface OrganizeMoment {
  endsAt: string
  id: string
  /** Stored kind; an auto moment is recreated when its kind changes. */
  kind?: StopKind | undefined
  locked: boolean
  origin: 'auto' | 'manual'
  /** Kind of the moment's place, when it is known (names the suggestions). */
  placeKind?: PlaceKind | undefined
  /** Country code of the moment's place, when it is known. */
  placeCountry?: string | undefined
  /** Display name of the moment's place, when it is known. */
  placeName?: string | undefined
  startsAt: string
}

export interface OrganizeSegment {
  endsAt: string
  id: string
  kind: 'stage' | 'trip'
  origin: 'manual' | 'suggested' | 'accepted' | 'rejected'
  startsAt: string
  /** Stored title; lets an unchanged suggestion be replaced by a better name. */
  title?: string | undefined
  tripType: string | null
}

export interface SegmentTitleInput {
  /** True for a trip inside one day (a walk or ride), not a multi-day one. */
  inDay?: boolean
  kind: 'stage' | 'trip'
  /**
   * 1-based position among all suggestions of the same kind in the whole
   * journey (also those already stored), so fallback numbering is contiguous.
   */
  index: number
  /** First local date (YYYY-MM-DD) covered by the suggestion. */
  startsOn: string
  tripType: SuggestedTripType | null
  /** What kind of stage this is (null for trips). */
  stageKind: JourneyStageKind | null
}

export interface OrganizeOptions {
  /** Journey home zone (IANA); days are cut in this zone. */
  homeTz: string
  /** Generates ids for new rows (client-generated uuids). */
  newId: () => string
  /** Labels of place-based titles (Czech by default). */
  labels?: NameLabels
  /** Fallback title when no place names the segment (titles are required). */
  segmentTitle: (input: SegmentTitleInput) => string
  stages?: StagePlanOptions
  /** A rejected stage starting this close blocks a new suggestion. */
  rejectedBoundaryToleranceMs?: number
}

export interface OrganizeInput {
  media: readonly OrganizeMedia[]
  moments: readonly OrganizeMoment[]
  segments: readonly OrganizeSegment[]
}

export interface PlannedMoment {
  endsAt: string
  id: string
  /** 'stay' and 'point' are stops, 'en_route' collapses photos on the way. */
  kind: StopKind
  latitude: number | null
  longitude: number | null
  mediaIds: string[]
  /** Short English diagnostic of why the moment looks like this (not UI text). */
  reason: string
  startsAt: string
}

export interface PlannedSegment {
  endsAt: string
  id: string
  kind: 'stage' | 'trip'
  /** Position among suggestions of the same kind. */
  position: number
  /** Short English diagnostic of why the stage looks like this (not UI text). */
  reason?: string
  /** Kind of a stage suggestion; stored as a plain stage in the database. */
  stageKind?: JourneyStageKind
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

function toPoint(
  media: OrganizeMedia,
  placeOf?: ReadonlyMap<string, PlaceInfo>,
): MediaPoint {
  const placeKind = media.placeKind ?? placeOf?.get(media.id)?.kind
  return {
    capturedAt: media.capturedAt,
    id: media.id,
    latitude: media.latitude,
    longitude: media.longitude,
    ...(media.altitude === undefined ? {} : { altitude: media.altitude }),
    ...(media.capturedTz === undefined ? {} : { capturedTz: media.capturedTz }),
    ...(media.device === undefined ? {} : { device: media.device }),
    ...(media.durationMs === undefined ? {} : { durationMs: media.durationMs }),
    ...(media.kind === undefined ? {} : { kind: media.kind }),
    ...(media.livePhotoOf === undefined
      ? {}
      : { livePhotoOf: media.livePhotoOf }),
    ...(media.ownerId === undefined ? {} : { ownerId: media.ownerId }),
    ...(placeKind === undefined ? {} : { placeKind }),
  }
}

/** Media of hand-made (locked or manual) moments: never regrouped. */
function protectedMedia(input: OrganizeInput): Set<string> {
  const protectedIds = new Set(
    input.moments
      .filter((moment) => moment.locked || moment.origin !== 'auto')
      .map((moment) => moment.id),
  )
  return new Set(
    input.media
      .filter(
        (item) => item.momentId !== null && protectedIds.has(item.momentId),
      )
      .map((item) => item.id),
  )
}

function planMoments(
  input: OrganizeInput,
  options: OrganizeOptions,
  detection: ReturnType<typeof detectStops>,
  lockedMediaIds: ReadonlySet<string>,
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
  const stops = detection.stops
  const momentOf = new Map(input.media.map((item) => [item.id, item.momentId]))
  const kindOfMoment = new Map(
    input.moments.map((moment) => [moment.id, moment.kind]),
  )
  const datedIds = new Set(stops.flatMap((stop) => stop.mediaIds))

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

  for (const stop of stops) {
    const firstMoment = momentOf.get(stop.mediaIds[0] ?? '') ?? null
    // The same group of photos keeps its existing auto moment (idempotence),
    // unless its kind changed (the stored kind could not be updated).
    const storedKind =
      firstMoment === null ? undefined : kindOfMoment.get(firstMoment)
    if (
      firstMoment !== null &&
      replaceableIds.has(firstMoment) &&
      (storedKind === undefined || storedKind === stop.kind) &&
      datedMembers.get(firstMoment) === stop.mediaIds.length &&
      stop.mediaIds.every((id) => momentOf.get(id) === firstMoment)
    ) {
      kept.add(firstMoment)
      continue
    }
    const id = options.newId()
    momentsToCreate.push({
      endsAt: stop.endsAt,
      id,
      kind: stop.kind,
      latitude: stop.position?.latitude ?? null,
      longitude: stop.position?.longitude ?? null,
      mediaIds: stop.mediaIds,
      reason: stop.reasons.join('; '),
      startsAt: stop.startsAt,
    })
    for (const mediaId of stop.mediaIds) {
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

/** Start of a local day: 04:00 wall-clock time (see local-day.ts). */
function dayStartMs(date: string, timeZone: string): number {
  const hour = String(DAY_START_HOUR).padStart(2, '0')
  const instant = wallClockToInstant(`${date} ${hour}:00:00`, timeZone)
  return Date.parse(instant ?? `${date}T${hour}:00:00Z`)
}

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

interface PlaceInfo {
  country: string | undefined
  kind: PlaceKind | undefined
  name: string
}

/** Place of each media item, taken from the moment it currently belongs to. */
function placesOfMedia(input: OrganizeInput): Map<string, PlaceInfo> {
  const byMoment = new Map<string, PlaceInfo>()
  for (const moment of input.moments) {
    // The place of a collapsed "en route" moment says nothing about where its
    // photos were taken (it was set for the middle of a ride).
    if (moment.kind === 'en_route') continue
    const name = moment.placeName?.trim()
    if (name !== undefined && name !== '') {
      byMoment.set(moment.id, {
        country: moment.placeCountry,
        kind: moment.placeKind,
        name,
      })
    }
  }
  const out = new Map<string, PlaceInfo>()
  for (const item of input.media) {
    const place =
      item.momentId === null ? undefined : byMoment.get(item.momentId)
    if (place !== undefined) out.set(item.id, place)
  }
  return out
}

function placesOfDay(
  day: ZonedDaySummary,
  placeOf: ReadonlyMap<string, PlaceInfo>,
): DayPlace[] {
  const tally = new Map<string, DayPlace>()
  for (const id of day.mediaIds) {
    const place = placeOf.get(id)
    if (place === undefined) continue
    const key = `${place.kind ?? ''}|${place.name}`
    const known = tally.get(key)
    if (known === undefined) {
      tally.set(key, {
        country: place.country,
        kind: place.kind,
        name: place.name,
        photos: 1,
      })
    } else {
      known.photos += 1
    }
  }
  return [...tally.values()]
}

/** Located days for planning; days without GPS do not take part. */
function toJourneyDays(
  days: readonly ZonedDaySummary[],
  placeOf: ReadonlyMap<string, PlaceInfo>,
): JourneyDay[] {
  const out: JourneyDay[] = []
  for (const day of days) {
    if (
      day.centroid !== null &&
      day.firstPoint !== null &&
      day.lastPoint !== null
    ) {
      out.push({
        centre: day.centroid,
        date: day.date,
        first: day.firstPoint,
        last: day.lastPoint,
        mediaIds: day.mediaIds,
        photoCount: day.points.length,
        places: placesOfDay(day, placeOf),
        points: day.points,
        timeZone: day.timeZone,
      })
    }
  }
  return out
}

/** Trip kinds of the stage organiser mapped to the stored trip types. */
export function tripTypeOf(kind: StageTripKind): SuggestedTripType {
  return kind === 'day' ? 'day' : 'trek'
}

/** Names of an in-day trip: the natural place most of its photos are at. */
function inDayNames(
  trip: DetectedDayTrip,
  tripType: SuggestedTripType,
  placeOf: ReadonlyMap<string, PlaceInfo>,
  labels: NameLabels,
): string[] {
  if (tripType !== 'trek') return []
  const tally = new Map<string, number>()
  for (const id of trip.mediaIds) {
    const place = placeOf.get(id)
    if (place?.kind !== 'natural') continue
    tally.set(place.name, (tally.get(place.name) ?? 0) + 1)
  }
  const best = [...tally.entries()].sort(
    (a, b) => b[1] - a[1] || compareText(a[0], b[0]),
  )[0]
  return best === undefined ? [] : [labels.trek(best[0])]
}

function planSegments(
  input: OrganizeInput,
  options: OrganizeOptions,
  dayTrips: readonly DetectedDayTrip[],
): Pick<
  OrganizationPlan,
  'segmentsToDelete' | 'stageSuggestions' | 'tripSuggestions'
> {
  const labels = options.labels ?? CS_NAME_LABELS
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
  const { dated } = sortDated(input.media.map((item) => toPoint(item)))
  const timeOf = new Map(dated.map((item) => [item.id, item.time]))
  const placeOf = placesOfMedia(input)

  interface Candidate {
    kind: 'stage' | 'trip'
    /** Place-based names, best first (empty when the places know none). */
    names: string[]
    range: Range
    inDay?: boolean
    reason?: string
    stageKind?: JourneyStageKind
    startsOn: string
    tripType: SuggestedTripType | null
  }

  interface FreshWindow {
    home: string | null
    range: Range
    trips: JourneyTrip[]
  }

  const latestOf = (stageDays: readonly JourneyDay[]): number =>
    Math.max(
      ...stageDays
        .flatMap((day) => day.mediaIds)
        .map((id) => timeOf.get(id) ?? Number.NEGATIVE_INFINITY),
    )

  // Stages: one pass over the whole journey (zone per day by GPS).
  const stages: Candidate[] = []
  const stageTrips: FreshWindow[] = []
  const first = dated[0]
  const last = dated[dated.length - 1]
  if (first !== undefined && last !== undefined) {
    const planned = planJourney(
      toJourneyDays(summarizeZonedDays(dated, options.homeTz), placeOf),
      options.stages,
    )
    const starts = planned.map((stage, index) => {
      const day = stage.days[0]
      if (day === undefined || index === 0) return first.time
      return Math.min(
        dayStartMs(day.date, day.timeZone),
        ...day.mediaIds.map((id) => timeOf.get(id) ?? Number.POSITIVE_INFINITY),
      )
    })
    planned.forEach((stage, index) => {
      const start = starts[index] ?? first.time
      const isLast = index === planned.length - 1
      // After a long photo gap the stage ends with its own last photo, so
      // the silence is not covered; otherwise it runs up to the next stage.
      const end = isLast
        ? last.time
        : stage.gapAfter
          ? latestOf(stage.days)
          : (starts[index + 1] ?? last.time)
      const range = {
        end: end > start ? end : start + MIN_SEGMENT_MS,
        start,
      }
      stages.push({
        kind: 'stage',
        names: [
          nameStage(stage, labels, {
            next: planned[index + 1],
            previous: planned[index - 1],
          }) ?? [],
        ].flat(),
        range,
        reason: stage.reason,
        stageKind: stage.kind,
        startsOn: stage.days[0]?.date ?? '',
        tripType: null,
      })
      stageTrips.push({
        home: stageHomeName(stage),
        range,
        trips: stage.trips,
      })
    })
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

  // Trips: fresh stages bring their own; hand-made stage windows and media
  // outside any stage are searched for trips around a base.
  const freshWindows = stageTrips.filter((window) =>
    freshStages.some(
      (stage) =>
        stage.range.start === window.range.start &&
        stage.range.end === window.range.end,
    ),
  )
  const windows: Range[] = [
    ...keptStageRanges,
    ...freshWindows.map((window) => window.range),
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
    .map((segment) => ({ range: rangeOf(segment), type: segment.tripType }))
  const rejectedTrips = rejected
    .filter((segment) => segment.kind === 'trip')
    .map((segment) => ({ range: rangeOf(segment), type: segment.tripType }))
  interface Found {
    home: string | null
    trip: JourneyTrip
  }
  const found: Found[] = freshWindows.flatMap((window) =>
    window.trips.map((trip) => ({ home: window.home, trip })),
  )
  const freshRanges = new Set(freshWindows.map((window) => window.range))
  const tripsOfMedia = (items: typeof dated): Found[] =>
    findJourneyTrips(
      toJourneyDays(summarizeZonedDays(items, options.homeTz), placeOf),
    ).map((trip) => ({ home: null, trip }))
  windows.forEach((window, index) => {
    if (freshRanges.has(window)) return
    const bucket = buckets[index] ?? []
    if (bucket.length === 0) return
    found.push(...tripsOfMedia(bucket))
  })
  if (loose.length > 0) found.push(...tripsOfMedia(loose))
  const trips: Candidate[] = []
  for (const { home, trip } of found) {
    const tripType = tripTypeOf(trip.kind)
    const times = trip.days
      .flatMap((day) => day.mediaIds)
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
      keptTrips.some((kept) => overlaps(range, kept.range)) ||
      rejectedTrips.some((r) => r.type === tripType && overlaps(range, r.range))
    ) {
      continue
    }
    trips.push({
      kind: 'trip',
      names: tripNames(
        trip,
        labels,
        home === null ? new Set<string>() : new Set([home]),
      ),
      range,
      startsOn: trip.days[0]?.date ?? '',
      tripType,
    })
  }
  // In-day trips (a walk or ride of >= 90 min and >= 3 km, found from the
  // photos). They sit in time inside a stage and may sit inside a day-level
  // trip of ANOTHER type; a day-level trip of the same type that already
  // covers them (or a hand-made / rejected one) makes them redundant.
  const dayLevel = [...trips]
  for (const trip of dayTrips) {
    const start = Date.parse(trip.startsAt)
    const end = Date.parse(trip.endsAt)
    if (Number.isNaN(start) || Number.isNaN(end)) continue
    const range = { end: end > start ? end : start + MIN_SEGMENT_MS, start }
    const tripType: SuggestedTripType = trip.tripType
    const covered = (other: Range): boolean => {
      const common =
        Math.min(range.end, other.end) - Math.max(range.start, other.start)
      return common >= 0.8 * (range.end - range.start)
    }
    if (
      keptTrips.some(
        (kept) => kept.type === tripType && overlaps(range, kept.range),
      ) ||
      rejectedTrips.some(
        (r) => r.type === tripType && overlaps(range, r.range),
      ) ||
      dayLevel.some(
        (other) => other.tripType === tripType && covered(other.range),
      )
    ) {
      continue
    }
    trips.push({
      inDay: true,
      kind: 'trip',
      names: inDayNames(trip, tripType, placeOf, labels),
      range,
      reason: trip.reason,
      startsOn: trip.startsAt.slice(0, 10),
      tripType,
    })
  }
  trips.sort((a, b) => a.range.start - b.range.start)

  // Titles: place names, else numbered by position in the whole journey. No
  // two titles are equal (also not to hand-made or accepted segments).
  const fresh = [...freshStages, ...trips]
  const taken = new Set(
    keptSegments.flatMap((segment) =>
      segment.title === undefined ? [] : [segment.title],
    ),
  )
  const ordinals = { stage: 0, trip: 0 }
  const titleOf = new Map<Candidate, string>()
  for (const candidate of fresh) {
    ordinals[candidate.kind] += 1
    const free = candidate.names.find((name) => !taken.has(name))
    const base =
      free ??
      candidate.names[0] ??
      options.segmentTitle({
        index: ordinals[candidate.kind],
        ...(candidate.inDay === true ? { inDay: true } : {}),
        kind: candidate.kind,
        stageKind: candidate.stageKind ?? null,
        startsOn: candidate.startsOn,
        tripType: candidate.tripType,
      })
    let title = base
    for (let count = 2; taken.has(title); count += 1) {
      title = labels.repeat(base, count)
    }
    taken.add(title)
    titleOf.set(candidate, title)
  }

  // Replace the old suggestions; identical ones stay (idempotence).
  const existingByKey = new Map<string, OrganizeSegment[]>()
  for (const segment of existingSuggested) {
    const key = segmentKey(segment.kind, segment.tripType, rangeOf(segment))
    existingByKey.set(key, [...(existingByKey.get(key) ?? []), segment])
  }
  const keptIds = new Set<string>()
  const toCreate: Candidate[] = []
  for (const candidate of fresh) {
    const key = segmentKey(candidate.kind, candidate.tripType, candidate.range)
    const title = titleOf.get(candidate)
    const match = existingByKey
      .get(key)
      ?.find(
        (segment) =>
          !keptIds.has(segment.id) &&
          (segment.title === undefined || segment.title === title),
      )
    if (match === undefined) toCreate.push(candidate)
    else keptIds.add(match.id)
  }
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
      ...(candidate.reason === undefined ? {} : { reason: candidate.reason }),
      ...(candidate.stageKind === undefined
        ? {}
        : { stageKind: candidate.stageKind }),
      startsAt: iso(candidate.range.start),
      title: titleOf.get(candidate) ?? '',
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
  const placeOf = placesOfMedia(input)
  const points = input.media.map((item) => toPoint(item, placeOf))
  const lockedMediaIds = protectedMedia(input)
  // Moments are detected without the hand-made media; trips are about time
  // and movement, so they see all media (one more pass only when needed).
  const detection = detectStops(points, { lockedMediaIds })
  const dayTrips =
    lockedMediaIds.size === 0
      ? detection.dayTrips
      : detectStops(points).dayTrips
  return {
    ...planMoments(input, options, detection, lockedMediaIds),
    ...planSegments(input, options, dayTrips),
  }
}
