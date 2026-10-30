import { DAY_START_HOUR } from './local-day.ts'
import {
  createDayOfInstant,
  summarizeZonedDays,
  type ZonedDaySummary,
} from './days.ts'
import { centroid, distanceKm, type GeoPoint } from './geo.ts'
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
  /** Text written by the user ('' = none). */
  body?: string | undefined
  /** Chosen cover photo (the algorithm never sets one). */
  coverMediaId?: string | null | undefined
  endsAt: string
  id: string
  /** Stored kind; an unlocked auto moment gets the kind of its new stop. */
  kind?: StopKind | undefined
  /** Stored position; used when the moment's media carry no GPS. */
  latitude?: number | null | undefined
  locked: boolean
  longitude?: number | null | undefined
  origin: 'auto' | 'manual'
  /** Kind of the moment's place, when it is known (names the suggestions). */
  placeKind?: PlaceKind | undefined
  /** Country code of the moment's place, when it is known. */
  placeCountry?: string | undefined
  /** Display name of the moment's place, when it is known. */
  placeName?: string | undefined
  /** False = hidden by the user (the default of an auto moment is true). */
  published?: boolean | undefined
  startsAt: string
  /** Name given by the user (the algorithm never stores a title). */
  title?: string | null | undefined
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
  /**
   * Forget the rejected suggestions: they no longer block a new suggestion
   * and are deleted with the old suggested ones (a fresh start).
   */
  forgetRejected?: boolean
  /**
   * Forget the accepted suggestions too: they are deleted and the stages and
   * trips are planned again over them. Manual segments are never touched.
   */
  forgetAccepted?: boolean
  /**
   * How far beyond its stored range a confirmed (protected) stop may grow to
   * take in a new photo, on either edge. Default 2 h. Never across a day.
   */
  intakeWindowMs?: number
  /** How close (m) a new photo must be to a confirmed stop to join it. */
  intakeRadiusM?: number
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
  /**
   * Only on `momentsToUpdate`: the kept moment moved more than
   * `PLACE_STALE_DISTANCE_M`, so its stored place is cleared and resolved
   * again.
   */
  clearPlace?: boolean
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

/**
 * A confirmed (protected) stop that takes in new photos: only its range grows.
 * Text, cover, title, place, kind and the lock are never touched. The media
 * themselves are listed in `mediaReassignments`.
 */
export interface MomentExtension {
  /** New range (the union of the stored range and the new photos). */
  endsAt: string
  id: string
  /** The new photos that join the stop (also in `mediaReassignments`). */
  mediaIds: string[]
  /** Short English diagnostic (not UI text). */
  reason: string
  startsAt: string
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
  /** Confirmed stops that only grow to take in new photos. */
  momentsToExtend: MomentExtension[]
  /**
   * Auto, unlocked moments that keep their id (stable id: the moment holding
   * the stop's oldest already-assigned photo) but get a new range, position,
   * kind or members.
   */
  momentsToUpdate: PlannedMoment[]
  /** Old segments with origin 'suggested' that the fresh set replaces. */
  segmentsToDelete: string[]
  stageSuggestions: PlannedSegment[]
  tripSuggestions: PlannedSegment[]
}

export const DEFAULT_REJECTED_BOUNDARY_TOLERANCE_MS = 24 * 3_600_000
/** Default growth of a confirmed stop at each edge (plan 4f, point 7). */
export const DEFAULT_INTAKE_WINDOW_MS = 2 * 3_600_000
/** Default distance of a new photo from a confirmed stop (stay radius). */
export const DEFAULT_INTAKE_RADIUS_M = 300
const MIN_SEGMENT_MS = 60_000

export function isPlanEmpty(plan: OrganizationPlan): boolean {
  return (
    plan.momentsToCreate.length === 0 &&
    plan.momentsToDelete.length === 0 &&
    plan.momentsToExtend.length === 0 &&
    plan.momentsToUpdate.length === 0 &&
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

/**
 * The place kind comes ONLY from the explicit per-photo input. The place of
 * the moment a photo belongs to is not used: such a moment may be recreated
 * by this very run (or still lack a place until it is geocoded), which would
 * flip the result from run to run.
 */
function toPoint(media: OrganizeMedia): MediaPoint {
  const placeKind = media.placeKind
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
    input.moments.filter(isProtected).map((moment) => moment.id),
  )
  return new Set(
    input.media
      .filter(
        (item) => item.momentId !== null && protectedIds.has(item.momentId),
      )
      .map((item) => item.id),
  )
}

/**
 * Hand-made moments are never regrouped or recreated: locked, manual, or
 * carrying content of the user (title, text, cover, hidden) even when an
 * older edit forgot to lock them. The automation itself writes none of that.
 */
export function isProtected(moment: OrganizeMoment): boolean {
  return (
    moment.locked ||
    moment.origin !== 'auto' ||
    (moment.title ?? '').trim() !== '' ||
    (moment.body ?? '').trim() !== '' ||
    (moment.coverMediaId ?? null) !== null ||
    moment.published === false
  )
}

/** Timestamp of an instant string, null when it does not parse. */
function parsedTime(value: string | null): number | null {
  if (value === null) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
}

function gpsOf(item: {
  latitude: number | null
  longitude: number | null
}): GeoPoint | null {
  return item.latitude === null || item.longitude === null
    ? null
    : { latitude: item.latitude, longitude: item.longitude }
}

interface Intake {
  /** Media id -> id of the confirmed stop it joins. */
  assigned: Map<string, string>
  extensions: MomentExtension[]
}

/**
 * Intake into confirmed stops (plan 4f, point 7). A new photo (one without a
 * moment) joins a protected stop when it fits by time AND place: inside the
 * stored range, or at most `intakeWindowMs` beyond an edge on the same local
 * day (04:00 rule, day zone of the photos). Place: within `intakeRadiusM` of
 * the stop's photos; without GPS on either side only a photo inside the
 * stored range joins. A Live Photo clip follows its still. Collapsed
 * 'en_route' stops take nothing in. Ties: smaller time gap, then distance,
 * then id. The window is measured from the STORED range, never chained
 * within a run. A clip never widens the range (only stills count).
 *
 * Repair after a partial apply: the app moves the photos first and writes
 * the range last, so a failure in between leaves members just outside the
 * stored range. Such members (within the window of an edge, same day) only
 * widen the range again; they never move the window for new photos, so a
 * rerun cannot chain. Members further away (older data) are left alone.
 * Separate successful runs do measure from the range the previous run
 * stored: each intake is bounded, the total growth is not (no DB marker of
 * the confirmed range exists).
 */
function intakeIntoConfirmed(
  input: OrganizeInput,
  options: OrganizeOptions,
): Intake {
  const assigned = new Map<string, string>()
  const confirmed = input.moments.filter(
    (moment) => isProtected(moment) && moment.kind !== 'en_route',
  )
  if (confirmed.length === 0) return { assigned, extensions: [] }
  const knownMoments = new Set(input.moments.map((moment) => moment.id))
  const fresh = input.media.filter(
    (item) => item.momentId === null || !knownMoments.has(item.momentId),
  )

  const windowMs = options.intakeWindowMs ?? DEFAULT_INTAKE_WINDOW_MS
  const radiusKm = (options.intakeRadiusM ?? DEFAULT_INTAKE_RADIUS_M) / 1000
  const { dated } = sortDated(input.media.map((item) => toPoint(item)))
  const dayOfInstant = createDayOfInstant(dated, options.homeTz)
  const dayOf = (time: number): string => {
    try {
      return dayOfInstant(time)
    } catch {
      return new Date(time).toISOString().slice(0, 10)
    }
  }

  interface Target {
    end: number
    endDay: string
    id: string
    position: GeoPoint | null
    start: number
    startDay: string
  }
  const gpsOfMoment = new Map<string, GeoPoint[]>()
  for (const item of input.media) {
    const point = gpsOf(item)
    if (item.momentId === null || point === null) continue
    const list = gpsOfMoment.get(item.momentId)
    if (list === undefined) gpsOfMoment.set(item.momentId, [point])
    else list.push(point)
  }
  const targets: Target[] = []
  for (const moment of confirmed) {
    const start = parsedTime(moment.startsAt)
    const end = parsedTime(moment.endsAt)
    if (start === null || end === null || end < start) continue
    const own = gpsOfMoment.get(moment.id) ?? []
    targets.push({
      end,
      endDay: dayOf(end),
      id: moment.id,
      position:
        centroid(own) ??
        gpsOf({
          latitude: moment.latitude ?? null,
          longitude: moment.longitude ?? null,
        }),
      start,
      startDay: dayOf(start),
    })
  }
  targets.sort((a, b) => a.start - b.start || compareText(a.id, b.id))

  /** Inside the range, or within the window of an edge on the edge's day. */
  const gapTo = (time: number, target: Target): number | null => {
    if (time >= target.start && time <= target.end) return 0
    const before = time < target.start
    const gap = before ? target.start - time : time - target.end
    const edgeDay = before ? target.startDay : target.endDay
    return gap > windowMs || dayOf(time) !== edgeDay ? null : gap
  }

  // Times that may widen a range: stills only (a clip follows its still).
  const timeOf = new Map<string, number>()
  // Sort key of the joined media (a clip sorts with its still).
  const sortTime = new Map<string, number>()
  const added = new Map<string, string[]>()
  const primaries = fresh.filter((item) => (item.livePhotoOf ?? null) === null)
  for (const item of primaries) {
    const time = parsedTime(item.capturedAt)
    if (time === null) continue
    const here = gpsOf(item)
    let best: { distance: number; gap: number; id: string } | null = null
    for (const target of targets) {
      const gap = gapTo(time, target)
      if (gap === null) continue
      const inside = gap === 0
      let distance = 0
      if (here === null || target.position === null) {
        if (!inside) continue
      } else {
        distance = distanceKm(here, target.position)
        if (distance > radiusKm) continue
      }
      if (
        best === null ||
        gap < best.gap ||
        (gap === best.gap && distance < best.distance) ||
        (gap === best.gap &&
          distance === best.distance &&
          compareText(target.id, best.id) < 0)
      ) {
        best = { distance, gap, id: target.id }
      }
    }
    if (best === null) continue
    assigned.set(item.id, best.id)
    timeOf.set(item.id, time)
    sortTime.set(item.id, time)
  }
  // A Live Photo clip goes where its still is (joined now or already there).
  const momentOfMedia = new Map(
    input.media.map((item) => [item.id, item.momentId]),
  )
  const protectedIds = new Set(confirmed.map((moment) => moment.id))
  const capturedOf = new Map(
    input.media.map((item) => [item.id, item.capturedAt]),
  )
  for (const item of fresh) {
    const still = item.livePhotoOf ?? null
    if (still === null) continue
    const target =
      assigned.get(still) ??
      (protectedIds.has(momentOfMedia.get(still) ?? '')
        ? (momentOfMedia.get(still) ?? null)
        : null)
    if (target === null) continue
    assigned.set(item.id, target)
    const stillTime =
      sortTime.get(still) ?? parsedTime(capturedOf.get(still) ?? null)
    if (stillTime !== null) sortTime.set(item.id, stillTime)
  }
  for (const [mediaId, momentId] of assigned) {
    const list = added.get(momentId)
    if (list === undefined) added.set(momentId, [mediaId])
    else list.push(mediaId)
  }

  // Members already moved in by an earlier, interrupted apply (stills only).
  const strays = new Map<string, number[]>()
  const targetById = new Map(targets.map((target) => [target.id, target]))
  for (const item of input.media) {
    const target =
      item.momentId === null ? undefined : targetById.get(item.momentId)
    if (target === undefined || (item.livePhotoOf ?? null) !== null) continue
    const time = parsedTime(item.capturedAt)
    if (time === null || (time >= target.start && time <= target.end)) continue
    if (gapTo(time, target) === null) continue
    const list = strays.get(target.id)
    if (list === undefined) strays.set(target.id, [time])
    else list.push(time)
  }

  const extensions: MomentExtension[] = []
  for (const target of targets) {
    const mediaIds = added.get(target.id) ?? []
    const stray = strays.get(target.id) ?? []
    if (mediaIds.length === 0 && stray.length === 0) continue
    mediaIds.sort(
      (a, b) =>
        (sortTime.get(a) ?? Number.POSITIVE_INFINITY) -
          (sortTime.get(b) ?? Number.POSITIVE_INFINITY) || compareText(a, b),
    )
    const times = [
      ...stray,
      ...mediaIds
        .map((id) => timeOf.get(id))
        .filter((time): time is number => time !== undefined),
    ]
    const start = Math.min(target.start, ...times)
    const end = Math.max(target.end, ...times)
    if (start === target.start && end === target.end && mediaIds.length === 0) {
      continue
    }
    extensions.push({
      endsAt: iso(end),
      id: target.id,
      mediaIds,
      reason:
        mediaIds.length === 0
          ? `intake: range repaired to cover ${String(stray.length)} member(s) of an interrupted apply`
          : `intake: ${String(mediaIds.length)} new photo(s) within ${String(Math.round(windowMs / 60_000))} min and ${String(Math.round(radiusKm * 1000))} m`,
      startsAt: iso(start),
    })
  }
  return { assigned, extensions }
}

/** Positions equal up to float noise (a stored double may round-trip). */
function samePosition(
  stored: {
    latitude?: number | null | undefined
    longitude?: number | null | undefined
  },
  planned: GeoPoint | null,
): boolean {
  if (stored.latitude === undefined || stored.longitude === undefined) {
    return true // the caller did not pass the stored position
  }
  if (stored.latitude === null || stored.longitude === null) {
    return planned === null
  }
  return (
    planned !== null &&
    Math.abs(stored.latitude - planned.latitude) < 1e-7 &&
    Math.abs(stored.longitude - planned.longitude) < 1e-7
  )
}

/** A kept moment that moved this far loses its place (it is looked up again). */
export const PLACE_STALE_DISTANCE_M = 150

function movedFar(
  stored: {
    latitude?: number | null | undefined
    longitude?: number | null | undefined
  },
  planned: GeoPoint | null,
): boolean {
  if (
    stored.latitude === undefined ||
    stored.longitude === undefined ||
    stored.latitude === null ||
    stored.longitude === null ||
    planned === null
  ) {
    return false
  }
  return (
    distanceKm(
      { latitude: stored.latitude, longitude: stored.longitude },
      planned,
    ) *
      1000 >
    PLACE_STALE_DISTANCE_M
  )
}

function planMoments(
  input: OrganizeInput,
  options: OrganizeOptions,
  detection: ReturnType<typeof detectStops>,
  lockedMediaIds: ReadonlySet<string>,
  intake: Intake,
): Pick<
  OrganizationPlan,
  | 'mediaReassignments'
  | 'momentsToCreate'
  | 'momentsToDelete'
  | 'momentsToExtend'
  | 'momentsToUpdate'
> {
  // Hand-made moments (locked or manual) are never regrouped; they only grow
  // through the intake above.
  const protectedIds = new Set(
    input.moments.filter(isProtected).map((moment) => moment.id),
  )
  const replaceable = input.moments.filter(
    (moment) => !protectedIds.has(moment.id),
  )
  const stops = detection.stops
  const momentOf = new Map(input.media.map((item) => [item.id, item.momentId]))
  const momentById = new Map(input.moments.map((moment) => [moment.id, moment]))
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
  const momentsToUpdate: PlannedMoment[] = []
  const mediaReassignments: MediaReassignment[] = []

  for (const stop of stops) {
    // Stable id: the stop keeps the replaceable moment that holds its oldest
    // already-assigned member. `stop.mediaIds` is time ordered with probable
    // duplicate copies at the end, the same order stays.ts anchors by, so a
    // clock-shifted copy never decides the id, and a new photo older than
    // the stop's first one does not replace the moment either. Stops come
    // in time order; a moment is reused by at most one stop.
    let reuse: string | null = null
    for (const mediaId of stop.mediaIds) {
      const holder = momentOf.get(mediaId) ?? null
      if (holder !== null && replaceableIds.has(holder) && !kept.has(holder)) {
        reuse = holder
        break
      }
    }
    const planned: PlannedMoment = {
      endsAt: stop.endsAt,
      id: reuse ?? options.newId(),
      kind: stop.kind,
      latitude: stop.position?.latitude ?? null,
      longitude: stop.position?.longitude ?? null,
      mediaIds: stop.mediaIds,
      reason: stop.reasons.join('; '),
      startsAt: stop.startsAt,
    }
    if (reuse !== null) {
      // Updated only when something about it changed.
      kept.add(reuse)
      const stored = momentById.get(reuse)
      if (stored !== undefined && movedFar(stored, stop.position)) {
        planned.clearPlace = true
      }
      const unchanged =
        stored !== undefined &&
        (stored.kind === undefined || stored.kind === stop.kind) &&
        parsedTime(stored.startsAt) === parsedTime(stop.startsAt) &&
        parsedTime(stored.endsAt) === parsedTime(stop.endsAt) &&
        samePosition(stored, stop.position) &&
        datedMembers.get(reuse) === stop.mediaIds.length &&
        stop.mediaIds.every((id) => momentOf.get(id) === reuse)
      if (!unchanged) momentsToUpdate.push(planned)
    } else {
      momentsToCreate.push(planned)
    }
    for (const mediaId of stop.mediaIds) {
      if (momentOf.get(mediaId) !== planned.id) {
        mediaReassignments.push({ mediaId, momentId: planned.id })
      }
    }
  }
  for (const extension of intake.extensions) {
    for (const mediaId of extension.mediaIds) {
      mediaReassignments.push({ mediaId, momentId: extension.id })
    }
  }

  const momentsToDelete = replaceable
    .filter((moment) => !kept.has(moment.id) && !undatedHolders.has(moment.id))
    .map((moment) => moment.id)

  return {
    mediaReassignments,
    momentsToCreate,
    momentsToDelete,
    momentsToExtend: intake.extensions,
    momentsToUpdate,
  }
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
  const forgetAccepted = options.forgetAccepted === true
  const acceptedAll = input.segments.filter(
    (segment) => segment.origin === 'accepted',
  )
  const keptSegments = input.segments.filter(
    (segment) =>
      segment.origin === 'manual' ||
      (segment.origin === 'accepted' && !forgetAccepted),
  )
  const rejectedAll = input.segments.filter(
    (segment) => segment.origin === 'rejected',
  )
  const rejected = options.forgetRejected === true ? [] : rejectedAll
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
  const tripDayInstant = createDayOfInstant(dated, options.homeTz)
  const tripDayOf = (instant: number): string => {
    try {
      return tripDayInstant(instant)
    } catch {
      return new Date(instant).toISOString().slice(0, 10)
    }
  }
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
      startsOn: tripDayOf(start),
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
  const segmentsToDelete = [
    ...existingSuggested.filter((segment) => !keptIds.has(segment.id)),
    ...(options.forgetRejected === true ? rejectedAll : []),
    ...(forgetAccepted ? acceptedAll : []),
  ].map((segment) => segment.id)

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
 * Plans the automatic organisation of one journey (plan 3/4, 4f): new photos
 * join confirmed stops that fit them (only growing them), the rest is
 * clustered into stops; an auto moment keeps its id while it holds the
 * oldest already-assigned photo of a stop. Stage and trip suggestions replace older ones.
 * Pure: it only describes the changes; the app applies them. Hand-made data
 * always wins: locked/manual moments and their media, manual/accepted
 * segments and rejected suggestions are never changed or suggested again.
 */
export function planOrganization(
  input: OrganizeInput,
  options: OrganizeOptions,
): OrganizationPlan {
  const points = input.media.map((item) => toPoint(item))
  // New photos that fit a confirmed stop join it first; the rest is detected.
  const intake = intakeIntoConfirmed(input, options)
  const lockedMediaIds = new Set([
    ...protectedMedia(input),
    ...intake.assigned.keys(),
  ])
  // Moments are detected without the hand-made media; trips are about time
  // and movement, so they see all media (one more pass only when needed).
  const detection = detectStops(points, { lockedMediaIds })
  const dayTrips =
    lockedMediaIds.size === 0
      ? detection.dayTrips
      : detectStops(points).dayTrips
  return {
    ...planMoments(input, options, detection, lockedMediaIds, intake),
    ...planSegments(input, options, dayTrips),
  }
}
