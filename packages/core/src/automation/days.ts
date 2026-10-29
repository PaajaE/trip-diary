import { centroid, distanceKm, type GeoPoint } from './geo.ts'
import {
  pointOf,
  sortDated,
  type DatedMediaPoint,
  type MediaPoint,
} from './media-point.ts'
import { assignNightDays } from './night-days.ts'
import { timeZoneAt } from './time-zone.ts'

export interface DaySummary {
  centroid: GeoPoint | null
  /** Local calendar date (YYYY-MM-DD) in the journey time zone. */
  date: string
  firstPoint: GeoPoint | null
  lastPoint: GeoPoint | null
  mediaCount: number
  mediaIds: string[]
  /** Located photos of the day in capture order. */
  points: GeoPoint[]
  /** Sum of straight-line steps between consecutive located photos. */
  travelledKm: number
}

export interface StageBoundarySuggestion {
  /** First local date of the suggested new stage. */
  startsOn: string
  /** How far the day's centre of gravity moved from the previous located day. */
  shiftKm: number
}

export const DEFAULT_STAGE_SHIFT_KM = 80

function localDateFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  })
}

function summarizeGroup(
  date: string,
  items: readonly DatedMediaPoint[],
): DaySummary {
  const points = items
    .map(pointOf)
    .filter((point): point is GeoPoint => point !== null)
  let travelledKm = 0
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    if (previous !== undefined && current !== undefined) {
      travelledKm += distanceKm(previous, current)
    }
  }
  return {
    centroid: centroid(points),
    date,
    firstPoint: points[0] ?? null,
    lastPoint: points[points.length - 1] ?? null,
    mediaCount: items.length,
    mediaIds: items.map((item) => item.id),
    points,
    travelledKm,
  }
}

/**
 * Groups media by local calendar day. `timeZone` is the journey home zone
 * (IANA name); per-media zones can refine this later.
 */
export function summarizeDays(
  media: readonly MediaPoint[],
  timeZone: string,
): DaySummary[] {
  const format = localDateFormatter(timeZone)
  const { dated } = sortDated(media)
  const days = new Map<string, DatedMediaPoint[]>()
  for (const item of dated) {
    const date = format.format(new Date(item.time))
    const list = days.get(date)
    if (list === undefined) {
      days.set(date, [item])
    } else {
      list.push(item)
    }
  }
  return [...days.entries()].map(([date, items]) => summarizeGroup(date, items))
}

export interface ZonedDaySummary extends DaySummary {
  /** IANA zone the day was (mostly) spent in: that of its first photo. */
  timeZone: string
}

function zoneAtPoint(point: GeoPoint): string | null {
  try {
    return timeZoneAt(point.latitude, point.longitude)
  } catch {
    return null
  }
}

/**
 * Groups media by the local calendar day of the place where each photo was
 * taken. The zone comes from the GPS position (offline lookup); photos
 * without a position inherit the zone of the previous located photo, and
 * the journey home zone is used before the first position is known.
 * Sorted by date, so the result does not depend on input order.
 */
export function summarizeZonedDays(
  media: readonly MediaPoint[],
  homeTimeZone: string,
  options: {
    /**
     * `midnight` (default, what the app uses today): the local calendar date.
     * `night`: the day changes in the middle of the night's longest gap (see
     * assignNightDays). The app is switched over separately.
     */
    dayBoundary?: 'midnight' | 'night'
  } = {},
): ZonedDaySummary[] {
  const nightDays =
    options.dayBoundary === 'night'
      ? assignNightDays(media, homeTimeZone)
      : null
  const formatters = new Map<string, Intl.DateTimeFormat>()
  const formatterFor = (zone: string): Intl.DateTimeFormat => {
    let formatter = formatters.get(zone)
    if (formatter === undefined) {
      formatter = localDateFormatter(zone)
      formatters.set(zone, formatter)
    }
    return formatter
  }
  const { dated } = sortDated(media)
  const groups = new Map<
    string,
    { items: DatedMediaPoint[]; timeZone: string }
  >()
  let zone = homeTimeZone
  for (const item of dated) {
    const point = pointOf(item)
    if (point !== null) {
      zone = zoneAtPoint(point) ?? zone
    }
    const assigned = nightDays?.get(item.id)
    const date =
      assigned?.date ?? formatterFor(zone).format(new Date(item.time))
    const group = groups.get(date)
    if (group === undefined) {
      groups.set(date, { items: [item], timeZone: zone })
    } else {
      group.items.push(item)
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, group]) => ({
      ...summarizeGroup(date, group.items),
      timeZone: group.timeZone,
    }))
}

/**
 * Suggests where a new stage could start: days whose centre of gravity moved
 * far from the previous located day (a flight, a long drive, a new base).
 * Suggestions only; the user decides where stages begin.
 */
export function suggestStageBoundaries(
  days: readonly DaySummary[],
  options: { minShiftKm?: number } = {},
): StageBoundarySuggestion[] {
  const minShiftKm = options.minShiftKm ?? DEFAULT_STAGE_SHIFT_KM
  const suggestions: StageBoundarySuggestion[] = []
  let previous: GeoPoint | null = null
  for (const day of days) {
    if (day.centroid === null) {
      continue
    }
    if (previous !== null) {
      const shiftKm = distanceKm(previous, day.centroid)
      if (shiftKm >= minShiftKm) {
        suggestions.push({ shiftKm, startsOn: day.date })
      }
    }
    previous = day.centroid
  }
  return suggestions
}
