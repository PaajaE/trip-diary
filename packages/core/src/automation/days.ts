import { centroid, distanceKm, type GeoPoint } from './geo.ts'
import {
  pointOf,
  sortDated,
  type DatedMediaPoint,
  type MediaPoint,
} from './media-point.ts'
import {
  isKnownTimeZone,
  localDay,
  photoDayZones,
  pickLocalDay,
} from './local-day.ts'
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

function zoneOrUtc(zone: string): string {
  return isKnownTimeZone(zone) ? zone : 'UTC'
}

/**
 * Groups media by local calendar day (a day starts at 04:00 local time).
 * `timeZone` is the journey home zone (IANA name); see summarizeZonedDays
 * for per-photo zones.
 */
export function summarizeDays(
  media: readonly MediaPoint[],
  timeZone: string,
): DaySummary[] {
  const { dated } = sortDated(media)
  const days = new Map<string, DatedMediaPoint[]>()
  for (const item of dated) {
    const date = localDay(item.time, zoneOrUtc(timeZone))
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
  /** IANA zone the day was mostly spent in (majority of its photos). */
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
 * Groups media by local calendar day (starting at 04:00 local time) in the
 * zone each day was mostly spent in. A photo's zone is its captured zone when
 * known, else derived from its GPS position (offline lookup); photos with
 * neither inherit the zone of the previous photo, and the journey home zone
 * is used before any zone is known. The zone of a day is the majority zone of
 * its photos (ties: alphabetically first). Each photo is then placed on the
 * earliest photo day whose zone puts it on that day (same rule as SQL
 * pick_local_day), so days without photos use the home zone.
 * Sorted by date, so the result does not depend on input order.
 */
export function summarizeZonedDays(
  media: readonly MediaPoint[],
  homeTimeZone: string,
): ZonedDaySummary[] {
  const home = zoneOrUtc(homeTimeZone)
  const { dated } = sortDated(media)
  let inherited = home
  const photos = dated.map((item) => {
    const point = pointOf(item)
    if (point !== null) {
      inherited = zoneAtPoint(point) ?? inherited
    }
    const own = item.capturedTz
    if (own !== undefined && own !== null && isKnownTimeZone(own)) {
      inherited = own
    }
    return { instant: item.time, zone: inherited }
  })
  const { dates, zones } = photoDayZones(photos)
  const groups = new Map<string, DatedMediaPoint[]>()
  for (const item of dated) {
    const date = pickLocalDay(item.time, home, dates, zones)
    const list = groups.get(date)
    if (list === undefined) {
      groups.set(date, [item])
    } else {
      list.push(item)
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, items]) => ({
      ...summarizeGroup(date, items),
      timeZone: zones[dates.indexOf(date)] ?? home,
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
