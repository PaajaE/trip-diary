/**
 * Data of the "Move to" sheet: the stops of the journey with what the sheet
 * shows about each, the stop nearest in time to the selection (for the
 * previous / next buttons), the suggested stop and where a new stop would be.
 */
import { distanceKm, suggestStop } from '@trip-diary/core/automation'
import type { TFunction } from 'i18next'
import type { MediaItem } from '@/entities/media/model/media-library'
import {
  formatDayHeading,
  formatLocalTime,
} from '@/features/journey-workspace/lib/format-range'
import { stopLabel } from '@/features/journey-workspace/lib/moment-labels'
import {
  buildTreePhotoDays,
  groupMomentsByDay,
} from '@/features/journey-workspace/model/workspace-days'
import {
  collectMoments,
  type WorkspaceTree,
} from '@/features/journey-workspace/model/workspace-tree'

/** A new stop takes the place name of a stop at most this far away. */
const NEW_STOP_PLACE_METERS = 500

export interface MoveSheetStop {
  cover: MediaItem | null
  /** Local day key of the stop (04:00 day rule); equal keys share a header. */
  dayKey: string
  /** "Středa 3. června" in the stop's zone. */
  dayLabel: string
  endsAt: string
  id: string
  latitude: number | null
  longitude: number | null
  photoCount: number
  /** The title is a placeholder: the place is still being looked up. */
  pending: boolean
  /** Name of the stop's place when it has a known one (not a manual title). */
  placeName: string | null
  startsAt: string
  /** Title, else place name, else "Looking up the place…" / "Stop N". */
  title: string
  /** Clock time in the stop's zone: one time for a single shot, else a range. */
  when: string
  videoCount: number
}

/** "15:07" for a single shot or an instant, "15:07 – 15:40" for a longer stop. */
export function stopTimeText(
  startsAt: string,
  endsAt: string,
  tz: string | null,
  locale: string,
  mediaCount: number,
): string {
  const start = formatLocalTime(startsAt, tz, locale)
  if (mediaCount <= 1) return start
  const end = formatLocalTime(endsAt, tz, locale)
  return end === start ? start : `${start} – ${end}`
}

/**
 * Every stop in document order. `homeTz` places days without photos, like the
 * overview does; `placeNames` resolves place ids (unknown = still looking up).
 */
export function buildMoveStops(
  tree: WorkspaceTree,
  t: TFunction,
  locale: string,
  placeNames: ReadonlyMap<string, string> = new Map(),
  homeTz: string | null = null,
): MoveSheetStop[] {
  const entries = collectMoments(tree)
  const dayOf = new Map<string, string>()
  for (const day of groupMomentsByDay(
    entries,
    homeTz,
    buildTreePhotoDays(tree, homeTz),
  ))
    for (const entry of day.moments) dayOf.set(entry.moment.id, day.key)

  return entries.map((entry, index) => {
    const { moment } = entry
    const label = stopLabel(entry, placeNames, t, index + 1)
    const place =
      moment.placeId === null ? '' : (placeNames.get(moment.placeId) ?? '')
    return {
      cover: entry.cover,
      dayKey: dayOf.get(moment.id) ?? 'unknown',
      dayLabel: formatDayHeading(moment.startsAt, entry.tz, locale),
      endsAt: moment.endsAt,
      id: moment.id,
      latitude: moment.latitude,
      longitude: moment.longitude,
      pending: label.pending,
      photoCount: entry.photoCount,
      placeName: place.trim() === '' ? null : place.trim(),
      startsAt: moment.startsAt,
      title: label.text,
      videoCount: entry.videoCount,
      when: stopTimeText(
        moment.startsAt,
        moment.endsAt,
        entry.tz,
        locale,
        entry.photoCount + entry.videoCount,
      ),
    }
  })
}

/** Index of the stop nearest in time to the instant (0 gap when inside). */
export function nearestStopIndex(
  stops: readonly Pick<MoveSheetStop, 'endsAt' | 'startsAt'>[],
  capturedAt: string | null,
): number | null {
  if (capturedAt === null) return null
  const at = Date.parse(capturedAt)
  if (Number.isNaN(at)) return null
  let best: number | null = null
  let bestGap = Infinity
  stops.forEach((stop, index) => {
    const start = Date.parse(stop.startsAt)
    const end = Date.parse(stop.endsAt)
    if (Number.isNaN(start) || Number.isNaN(end)) return
    const gap = at < start ? start - at : at > end ? at - end : 0
    if (gap < bestGap) {
      best = index
      bestGap = gap
    }
  })
  return best
}

export interface MoveSheetModel {
  /** Stop the first photo is already in, if any. */
  currentId: string | null
  /** Place name for a new stop made from the photo (nearest named stop), if known. */
  newStopPlace: string | null
  nextId: string | null
  prevId: string | null
  /** Why prev / next are unavailable altogether; null when they can work. */
  unavailable: 'noStops' | 'noTime' | null
  suggestedId: string | null
}

/** Place name of the closest named stop within a short walk of the photo. */
function newStopPlace(
  stops: readonly MoveSheetStop[],
  first: MediaItem | undefined,
): string | null {
  if (first === undefined) return null
  const { latitude, longitude } = first
  if (latitude === null || longitude === null) return null
  const here = { latitude, longitude }
  let best: string | null = null
  let bestMeters = NEW_STOP_PLACE_METERS
  for (const stop of stops) {
    if (stop.placeName === null) continue
    if (stop.latitude === null || stop.longitude === null) continue
    const meters =
      distanceKm(here, {
        latitude: stop.latitude,
        longitude: stop.longitude,
      }) * 1000
    if (meters <= bestMeters) {
      best = stop.placeName
      bestMeters = meters
    }
  }
  return best
}

/** Neighbours and suggestion relative to the first selected media. */
export function moveSheetModel(
  stops: readonly MoveSheetStop[],
  first: MediaItem | undefined,
): MoveSheetModel {
  if (stops.length === 0) {
    return {
      currentId: first?.momentId ?? null,
      newStopPlace: null,
      nextId: null,
      prevId: null,
      suggestedId: null,
      unavailable: 'noStops',
    }
  }
  const nearest = nearestStopIndex(stops, first?.capturedAt ?? null)
  const suggestion =
    first === undefined
      ? null
      : suggestStop(
          {
            capturedAt: first.capturedAt,
            latitude: first.latitude,
            longitude: first.longitude,
            momentId: first.momentId,
          },
          stops,
        )
  return {
    currentId: first?.momentId ?? null,
    newStopPlace: newStopPlace(stops, first),
    nextId: nearest === null ? null : (stops[nearest + 1]?.id ?? null),
    prevId: nearest === null ? null : (stops[nearest - 1]?.id ?? null),
    suggestedId: suggestion?.stopId ?? null,
    unavailable: nearest === null ? 'noTime' : null,
  }
}
