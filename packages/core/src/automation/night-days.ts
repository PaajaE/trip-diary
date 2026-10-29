import { pointOf, sortDated, type MediaPoint } from './media-point.ts'
import { timeZoneAt, wallClockToInstant } from './time-zone.ts'

export interface NightDayOptions {
  /** Local hour the night window opens (default 22). */
  nightStartHour?: number
  /** Local hour the night window closes (default 7). */
  nightEndHour?: number
  /** The longest gap inside the window must exceed this to split (default 4 h). */
  minGapHours?: number
  /** Without such a gap the day changes at this local hour (default 4). */
  fallbackHour?: number
}

export interface NightDayAssignment {
  /** Local date of the day the photo belongs to (the day of waking up). */
  date: string
  /** `night-gap`: split in the middle of a real sleep gap. `fallback`: no gap. */
  reason: 'fallback' | 'night-gap'
  /** IANA zone the photo was taken in. */
  timeZone: string
}

const HOUR_MS = 3_600_000
/** Samples this close to a night window count as the author being active. */
const ACTIVITY_MARGIN_MS = 12 * HOUR_MS

const formatters = new Map<string, Intl.DateTimeFormat>()
function localDate(ms: number, zone: string): string {
  let format = formatters.get(zone)
  if (format === undefined) {
    format = new Intl.DateTimeFormat('en-CA', {
      day: '2-digit',
      month: '2-digit',
      timeZone: zone,
      year: 'numeric',
    })
    formatters.set(zone, format)
  }
  return format.format(new Date(ms))
}

function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10)
}

function at(date: string, hour: number, zone: string): number | null {
  const instant = wallClockToInstant(
    `${date}T${String(hour).padStart(2, '0')}:00:00`,
    zone,
  )
  return instant === null ? null : Date.parse(instant)
}

function zoneAtPoint(latitude: number, longitude: number): string | null {
  try {
    return timeZoneAt(latitude, longitude)
  } catch {
    return null
  }
}

export interface NightDaySample {
  /** Instant, epoch milliseconds. */
  time: number
  /** IANA zone the instant was captured in (local time = this zone's clock). */
  zone: string
}

export interface NightDayResolution {
  date: string
  reason: 'fallback' | 'night-gap'
}

/**
 * Day = from waking up to going to sleep, not from midnight to midnight
 * (spec: algorithm, step "days"). For the night before local date L, the
 * longest gap between samples inside the 22:00-07:00 window (clipped to it) is
 * the author's sleep: if it exceeds `minGapHours`, the day changes in the
 * middle of it. Without such a gap the day changes at `fallbackHour`.
 * Instants before the boundary belong to the previous date.
 *
 * Every instant is read on the clock of ITS OWN zone (where the photo was
 * taken), never the viewer's or the home zone. Deterministic and independent
 * of sample order.
 */
export function createNightDayResolver(
  samples: readonly NightDaySample[],
  options: NightDayOptions = {},
): (time: number, zone: string) => NightDayResolution {
  const startHour = options.nightStartHour ?? 22
  const endHour = options.nightEndHour ?? 7
  const minGapMs = (options.minGapHours ?? 4) * HOUR_MS
  const fallbackHour = options.fallbackHour ?? 4
  const times = samples.map((sample) => sample.time).sort((a, b) => a - b)

  const boundaries = new Map<string, NightDayResolution & { at: number }>()
  const boundaryFor = (date: string, zone: string) => {
    const key = `${zone}|${date}`
    const known = boundaries.get(key)
    if (known !== undefined) return known
    const windowStart = at(shiftDate(date, -1), startHour, zone)
    const windowEnd = at(date, endHour, zone)
    const fallback = at(date, fallbackHour, zone)
    let result: NightDayResolution & { at: number } = {
      at: fallback ?? Number.NEGATIVE_INFINITY,
      date,
      reason: 'fallback',
    }
    // A sleep gap needs an author who was active around the night; without
    // any sample nearby there is nothing to read a gap from.
    const active =
      windowStart !== null &&
      windowEnd !== null &&
      times.some(
        (time) =>
          time > windowStart - ACTIVITY_MARGIN_MS &&
          time < windowEnd + ACTIVITY_MARGIN_MS,
      )
    if (windowStart !== null && windowEnd !== null && active) {
      const edges = [windowStart]
      for (const time of times) {
        if (time > windowStart && time < windowEnd) edges.push(time)
      }
      edges.push(windowEnd)
      let bestGap = 0
      let bestMid = 0
      for (let i = 1; i < edges.length; i += 1) {
        const gap = (edges[i] ?? 0) - (edges[i - 1] ?? 0)
        if (gap > bestGap) {
          bestGap = gap
          bestMid = (edges[i - 1] ?? 0) + gap / 2
        }
      }
      if (bestGap > minGapMs) {
        result = { at: bestMid, date, reason: 'night-gap' }
      }
    }
    boundaries.set(key, result)
    return result
  }

  return (time, zone) => {
    const local = localDate(time, zone)
    const boundary = boundaryFor(local, zone)
    return {
      date: time < boundary.at ? shiftDate(local, -1) : local,
      reason: boundary.reason,
    }
  }
}

/**
 * Day of every dated photo (see createNightDayResolver). The zone of a photo
 * is the zone of its GPS position, else of the previous located photo, else
 * `homeTimeZone`. Media without a capture time are not assigned.
 */
export function assignNightDays(
  media: readonly MediaPoint[],
  homeTimeZone: string,
  options: NightDayOptions = {},
): Map<string, NightDayAssignment> {
  const { dated } = sortDated(media)
  let zone = homeTimeZone
  const rows = dated.map((item) => {
    const point = pointOf(item)
    if (point !== null) {
      zone = zoneAtPoint(point.latitude, point.longitude) ?? zone
    }
    return { id: item.id, time: item.time, zone }
  })
  const resolve = createNightDayResolver(rows, options)
  const out = new Map<string, NightDayAssignment>()
  for (const row of rows) {
    const { date, reason } = resolve(row.time, row.zone)
    out.set(row.id, { date, reason, timeZone: row.zone })
  }
  return out
}
