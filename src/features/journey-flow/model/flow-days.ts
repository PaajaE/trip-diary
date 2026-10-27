/**
 * The common ground of the sorting flow screens (Příjem, Kontrola zastávek,
 * Nezařazené, Třídění, Konec dne): every local day of the journey (04:00
 * rule, zone of the photos) with its stops in time order, the trips inside
 * the day, the photos without a stop and the probable copies. Each stop
 * carries its derived name (never "Zastávka 15:07"), kind, lock, "nová" and
 * confidence. Pure: built from the workspace tree, place names and the
 * client-side markers.
 */
import {
  centroid,
  deriveStopNames,
  pickLocalDay,
  prepareMedia,
  type GeoPoint,
  type ProbableDuplicate,
  type StopName,
} from '@trip-diary/core/automation'
import type { MediaItem } from '@/entities/media/model/media-library'
import type { MomentKind } from '@/entities/moment/model/moment'
import type { TripType } from '@/entities/segment/model/segment'
import {
  isNewStop,
  newStopIds,
  type FlowMarkers,
} from '@/features/journey-flow/model/flow-markers'
import {
  dayConfidence,
  type StopConfidence,
} from '@/features/journey-flow/model/stop-confidence'
import { isUserStop } from '@/features/journey-organize/model/organize-snapshot'
import {
  buildTreePhotoDays,
  groupMomentsByDay,
  UNKNOWN_DAY,
} from '@/features/journey-workspace/model/workspace-days'
import {
  collectMoments,
  type WorkspaceMoment,
  type WorkspaceSegment,
  type WorkspaceTree,
} from '@/features/journey-workspace/model/workspace-tree'

export interface FlowStop {
  /** Centre of the photos (stored position as fallback); null when unknown. */
  centre: GeoPoint | null
  confidence: StopConfidence
  /** First starred photo, else the chosen cover, else the first photo. */
  coverMediaId: string | null
  /** Last capture time of the photos the stop holds (stored end as fallback). */
  endsAt: string
  entry: WorkspaceMoment
  id: string
  /** "nová": created by an automatic run the user has not seen yet. */
  isNew: boolean
  /** Internal kind: the UI shows only an icon (pin, shoe, car). */
  kind: MomentKind
  /** Confirmed by the user (locked, manual or carrying their content). */
  locked: boolean
  /** Photos and videos in time order. */
  media: MediaItem[]
  /** Derived name (title, place, "near city", time of day, or pending). */
  name: StopName
  /** Low confidence, or new without a known place: worth a look. */
  needsLook: boolean
  /** The stop has a manual title or a resolved place name. */
  placeKnown: boolean
  photoCount: number
  startsAt: string
  /** Display zone of the stop. */
  tz: string | null
  videoCount: number
}

/** A trip inside one day (segment of kind trip: walk, trek or day). */
export interface FlowTrip {
  endsAt: string
  id: string
  origin: WorkspaceSegment['segment']['origin']
  startsAt: string
  /** Stops of the day whose start lies inside the trip, in time order. */
  stopIds: string[]
  title: string
  tripType: TripType | null
}

export interface FlowDay {
  /** Probable copies whose copy belongs to this day (not kept by the user). */
  duplicates: ProbableDuplicate[]
  /** Local day key (YYYY-MM-DD) or UNKNOWN_DAY. */
  key: string
  /** Every photo and video of the day (stops and unassigned), time order. */
  media: MediaItem[]
  stops: FlowStop[]
  trips: FlowTrip[]
  /** Photos and videos of the day that belong to no stop, time order. */
  unassigned: MediaItem[]
}

export interface FlowBaseInput {
  homeTz: string | null
  /** Place id -> display name (unknown = still being looked up). */
  placeNames: ReadonlyMap<string, string>
  tree: WorkspaceTree
}

export interface FlowInput {
  homeTz: string | null
  markers: FlowMarkers
  /** Place id -> display name (unknown = still being looked up). */
  placeNames: ReadonlyMap<string, string>
  tree: WorkspaceTree
}

export interface FlowJourney {
  days: FlowDay[]
  /** Day key of every stop and media item. */
  dayOf: ReadonlyMap<string, string>
}

/**
 * The heavy, marker-independent part (days, names, confidence, all probable
 * copies): memoise it on the tree; markers are applied cheaply on top.
 */
export interface FlowBase extends FlowJourney {
  /** Kept separately: `days[].duplicates` are filtered by the markers. */
  allDuplicates: ReadonlyMap<string, ProbableDuplicate[]>
}

/** Live range of a stop: the capture times of the photos it still holds. */
function liveRange(entry: WorkspaceMoment): {
  endsAt: string
  startsAt: string
} {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  let first: string | null = null
  let last: string | null = null
  for (const item of entry.media) {
    if (item.capturedAt === null) continue
    const time = Date.parse(item.capturedAt)
    if (Number.isNaN(time)) continue
    if (time < min) {
      min = time
      first = item.capturedAt
    }
    if (time > max) {
      max = time
      last = item.capturedAt
    }
  }
  return first === null || last === null
    ? { endsAt: entry.moment.endsAt, startsAt: entry.moment.startsAt }
    : { endsAt: last, startsAt: first }
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function timeOf(item: MediaItem): number {
  if (item.capturedAt === null) return Number.POSITIVE_INFINITY
  const value = Date.parse(item.capturedAt)
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value
}

export function byCapture(a: MediaItem, b: MediaItem): number {
  return timeOf(a) - timeOf(b) || cmp(a.id, b.id)
}

function coverOf(entry: WorkspaceMoment): string | null {
  const starred = entry.media.find(
    (item) => item.starred && item.kind === 'photo',
  )
  return starred?.id ?? entry.cover?.id ?? entry.media[0]?.id ?? null
}

function centreOf(entry: WorkspaceMoment): GeoPoint | null {
  const own = centroid(
    entry.media.flatMap((item) =>
      item.latitude === null || item.longitude === null
        ? []
        : [{ latitude: item.latitude, longitude: item.longitude }],
    ),
  )
  if (own !== null) return own
  const { latitude, longitude } = entry.moment
  return latitude === null || longitude === null
    ? null
    : { latitude, longitude }
}

function allTrips(tree: WorkspaceTree): WorkspaceSegment[] {
  const out: WorkspaceSegment[] = []
  const walk = (node: WorkspaceSegment) => {
    if (node.segment.kind === 'trip') out.push(node)
    node.children.forEach(walk)
  }
  tree.roots.forEach(walk)
  return out
}

/** Builds the days of the flow. Deterministic (code-unit tie breaks). */
export function buildFlowDays(input: FlowInput): FlowJourney {
  return applyFlowMarkers(buildFlowBase(input), input.markers)
}

/**
 * Applies the client markers to a base: "nová", "needs a look" and the
 * copies the user kept. Cheap (no clustering, no copy detection).
 */
export function applyFlowMarkers(
  base: FlowBase,
  markers: FlowMarkers,
): FlowJourney {
  const fresh = newStopIds(markers)
  const kept = new Set(markers.keptCopyIds)
  const days = base.days.map((day) => ({
    ...day,
    duplicates: (base.allDuplicates.get(day.key) ?? []).filter(
      (pair) => !kept.has(pair.id),
    ),
    stops: day.stops.map((stop) => {
      const isNew = isNewStop(stop.entry.moment, markers, fresh)
      return {
        ...stop,
        isNew,
        // "Needs a look" = low confidence, or new with an unknown place.
        // Medium confidence only orders the work.
        needsLook:
          !stop.locked &&
          stop.kind !== 'en_route' &&
          (stop.confidence.level === 'low' || (isNew && !stop.placeKnown)),
      }
    }),
  }))
  return { dayOf: base.dayOf, days }
}

/** The marker-independent part of the flow days (see FlowBase). */
export function buildFlowBase(input: FlowBaseInput): FlowBase {
  const { homeTz, placeNames, tree } = input
  const photoDays = buildTreePhotoDays(tree, homeTz)
  const dayOfInstant = (iso: string | null): string => {
    if (iso === null) return UNKNOWN_DAY
    const time = Date.parse(iso)
    if (Number.isNaN(time)) return UNKNOWN_DAY
    return pickLocalDay(time, homeTz, photoDays.dates, photoDays.zones)
  }
  const entries = collectMoments(tree)
  const grouped = groupMomentsByDay(entries, homeTz, photoDays)
  const dayOf = new Map<string, string>()
  for (const day of grouped)
    for (const entry of day.moments) dayOf.set(entry.moment.id, day.key)

  const names = deriveStopNames(
    entries.map((entry) => {
      const { latitude, longitude, placeId } = entry.moment
      const placeName =
        placeId === null ? '' : (placeNames.get(placeId)?.trim() ?? '')
      const dayKey = dayOf.get(entry.moment.id)
      return {
        ...(dayKey === undefined || dayKey === UNKNOWN_DAY ? {} : { dayKey }),
        id: entry.moment.id,
        place: placeName === '' ? null : { name: placeName },
        placePending:
          placeName === '' &&
          (placeId !== null || (latitude !== null && longitude !== null)),
        startsAt: entry.moment.startsAt,
        timeZone: entry.tz ?? homeTz,
        title: entry.moment.title,
      }
    }),
  )

  // Probable copies over the whole journey (a clock shift may cross a day).
  const everything = [
    ...entries.flatMap((entry) => entry.media),
    ...tree.unassigned,
  ]
  const duplicates = prepareMedia(
    everything
      .filter((item) => item.status === 'ready')
      .map((item) => ({
        capturedAt: item.capturedAt,
        capturedTz: item.capturedTz,
        device: item.device,
        durationMs: item.durationMs,
        id: item.id,
        kind: item.kind,
        latitude: item.latitude,
        longitude: item.longitude,
        ownerId: item.ownerId,
      })),
  ).duplicates

  const days = new Map<string, FlowDay>()
  const dayEntry = (key: string): FlowDay => {
    let day = days.get(key)
    if (day === undefined) {
      day = {
        duplicates: [],
        key,
        media: [],
        stops: [],
        trips: [],
        unassigned: [],
      }
      days.set(key, day)
    }
    return day
  }

  for (const group of grouped) {
    const day = dayEntry(group.key)
    // Times come from the photos the stop still holds (a trashed photo no
    // longer stretches it); the stored range is the fallback.
    const live = new Map(group.moments.map((e) => [e.moment.id, liveRange(e)]))
    const rangeOf = (entry: WorkspaceMoment) =>
      live.get(entry.moment.id) ?? {
        endsAt: entry.moment.endsAt,
        startsAt: entry.moment.startsAt,
      }
    const ordered = [...group.moments].sort(
      (a, b) =>
        Date.parse(rangeOf(a).startsAt) - Date.parse(rangeOf(b).startsAt) ||
        cmp(a.moment.id, b.moment.id),
    )
    const confidence = dayConfidence(
      ordered.map((entry) => ({
        confirmed: isUserStop(entry.moment),
        endsAt: rangeOf(entry).endsAt,
        id: entry.moment.id,
        kind: entry.moment.kind,
        media: entry.media,
        startsAt: rangeOf(entry).startsAt,
      })),
    )
    for (const entry of ordered) {
      const { moment } = entry
      const name = names.get(moment.id) ?? {
        base: { kind: 'pending' as const },
        dayKey: group.key,
        ordinal: null,
        period: null,
      }
      const locked = isUserStop(moment)
      const placeKnown =
        (moment.title ?? '').trim() !== '' ||
        (moment.placeId !== null &&
          (placeNames.get(moment.placeId) ?? '').trim() !== '')
      const stopConfidence = confidence.get(moment.id) ?? {
        level: 'high',
        reasons: [],
      }
      day.stops.push({
        centre: centreOf(entry),
        confidence: stopConfidence,
        coverMediaId: coverOf(entry),
        endsAt: rangeOf(entry).endsAt,
        entry,
        id: moment.id,
        isNew: false, // set by applyFlowMarkers
        kind: moment.kind,
        locked,
        media: [...entry.media].sort(byCapture),
        name,
        needsLook: false, // set by applyFlowMarkers
        photoCount: entry.photoCount,
        placeKnown,
        startsAt: rangeOf(entry).startsAt,
        tz: entry.tz,
        videoCount: entry.videoCount,
      })
      day.media.push(...entry.media)
    }
  }

  for (const item of tree.unassigned) {
    const key = dayOfInstant(item.capturedAt)
    const day = dayEntry(key)
    day.unassigned.push(item)
    day.media.push(item)
  }
  const mediaDay = new Map<string, string>()
  for (const day of days.values()) {
    day.unassigned.sort(byCapture)
    day.media.sort(byCapture)
    for (const item of day.media) mediaDay.set(item.id, day.key)
  }
  const allDuplicates = new Map<string, ProbableDuplicate[]>()
  for (const pair of duplicates) {
    const key = mediaDay.get(pair.id)
    if (key === undefined) continue
    const list = allDuplicates.get(key)
    if (list === undefined) allDuplicates.set(key, [pair])
    else list.push(pair)
  }

  for (const node of allTrips(tree)) {
    const { segment } = node
    const startDay = dayOfInstant(segment.startsAt)
    const endDay = dayOfInstant(segment.endsAt)
    // Only a trip inside one day is a card of the day; longer ones are a level.
    if (startDay === UNKNOWN_DAY || startDay !== endDay) continue
    const day = days.get(startDay)
    if (day === undefined) continue
    const start = Date.parse(segment.startsAt)
    const end = Date.parse(segment.endsAt)
    day.trips.push({
      endsAt: segment.endsAt,
      id: segment.id,
      origin: segment.origin,
      startsAt: segment.startsAt,
      stopIds: day.stops
        .filter((stop) => {
          const at = Date.parse(stop.startsAt)
          return at >= start && at <= end
        })
        .map((stop) => stop.id),
      title: segment.title,
      tripType: segment.tripType,
    })
  }
  for (const day of days.values()) {
    day.trips.sort(
      (a, b) =>
        Date.parse(a.startsAt) - Date.parse(b.startsAt) || cmp(a.id, b.id),
    )
  }

  for (const [id, key] of mediaDay) dayOf.set(id, key)
  const ordered = [...days.values()].sort((a, b) =>
    a.key === b.key
      ? 0
      : a.key === UNKNOWN_DAY
        ? 1
        : b.key === UNKNOWN_DAY
          ? -1
          : cmp(a.key, b.key),
  )
  return { allDuplicates, dayOf, days: ordered }
}
