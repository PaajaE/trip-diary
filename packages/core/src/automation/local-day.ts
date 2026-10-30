import {
  createNightDayResolver,
  type NightDayResolution,
} from './night-days.ts'

/**
 * The one definition of "which day does an instant belong to" (mirrors the SQL
 * functions local_day, journey_day_zones and pick_local_day in
 * supabase/migrations/20261027120300_v2_local_day.sql):
 *  - a day starts at 04:00 local time (00:40 belongs to the previous day);
 *  - the zone of a day is that of the majority of its photos, ties go to the
 *    alphabetically first zone name;
 *  - an instant resolves to the earliest photo day whose zone puts it on that
 *    day, otherwise its day in the home zone (UTC when unset).
 * Intl only, so the module stays platform neutral.
 */

/** Local hour at which a new day starts. */
export const DAY_START_HOUR = 4

const formatters = new Map<string, Intl.DateTimeFormat | null>()

function formatterFor(timeZone: string): Intl.DateTimeFormat | null {
  const cached = formatters.get(timeZone)
  if (cached !== undefined) {
    return cached
  }
  let formatter: Intl.DateTimeFormat | null
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      hour: 'numeric',
      hourCycle: 'h23',
      month: 'numeric',
      timeZone,
      year: 'numeric',
    })
  } catch {
    formatter = null
  }
  formatters.set(timeZone, formatter)
  return formatter
}

/** True when `timeZone` is an IANA zone name the runtime understands. */
export function isKnownTimeZone(timeZone: string): boolean {
  return timeZone !== '' && formatterFor(timeZone) !== null
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

/**
 * Local calendar day (YYYY-MM-DD) of an instant in `timeZone`, with the day
 * starting at 04:00 local wall-clock time. Like SQL, the 4 h are subtracted
 * from the local wall clock, not from the instant (matters only around DST
 * changes). Throws RangeError for an unknown zone.
 */
export function localDay(instant: number | Date, timeZone: string): string {
  const formatter = formatterFor(timeZone)
  if (formatter === null) {
    throw new RangeError(`Unknown time zone: ${timeZone}`)
  }
  const time = typeof instant === 'number' ? instant : instant.getTime()
  let year = 0
  let month = 0
  let day = 0
  let hour = 0
  for (const part of formatter.formatToParts(new Date(time))) {
    const value = Number(part.value)
    if (part.type === 'year') year = value
    else if (part.type === 'month') month = value
    else if (part.type === 'day') day = value
    else if (part.type === 'hour') hour = value % 24
  }
  if (hour >= DAY_START_HOUR) {
    return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`
  }
  const previous = new Date(Date.UTC(2000, month - 1, day - 1))
  previous.setUTCFullYear(year, month - 1, day - 1)
  return `${pad(previous.getUTCFullYear(), 4)}-${pad(previous.getUTCMonth() + 1, 2)}-${pad(previous.getUTCDate(), 2)}`
}

const DAY_MS = 86_400_000
/**
 * A zone is at most 14 h from UTC and the day starts at 04:00 local, so the
 * local day of an instant is within a day or two of its UTC date.
 */
const DAY_MATCH_WINDOW_MS = 2 * DAY_MS
const dateStarts = new WeakMap<readonly string[], number[]>()

/** UTC midnight (ms) of each date; cached per array (hot loop of the pass). */
function startsOf(dates: readonly string[]): number[] {
  let starts = dateStarts.get(dates)
  if (starts?.length !== dates.length) {
    starts = dates.map((date) => Date.parse(`${date}T00:00:00Z`))
    dateStarts.set(dates, starts)
  }
  return starts
}

/**
 * Day of an instant: the earliest photo day (`dates[i]` spent in `zones[i]`)
 * whose zone puts the instant on that day, otherwise its day in `homeZone`.
 */
export function pickLocalDay(
  instant: number | Date,
  homeZone: string | null | undefined,
  dates: readonly string[],
  zones: readonly string[],
): string {
  let best: string | null = null
  const time = typeof instant === 'number' ? instant : instant.getTime()
  const starts = startsOf(dates)
  for (let index = 0; index < dates.length; index += 1) {
    const date = dates[index]
    const zone = zones[index]
    if (date === undefined || zone === undefined) {
      continue
    }
    // A date far from the instant cannot be its local day in any zone.
    const start = starts[index]
    if (
      start !== undefined &&
      !Number.isNaN(start) &&
      Math.abs(time - start) > DAY_MATCH_WINDOW_MS
    ) {
      continue
    }
    if (
      (best === null || date < best) &&
      isKnownTimeZone(zone) &&
      localDay(instant, zone) === date
    ) {
      best = date
    }
  }
  if (best !== null) {
    return best
  }
  const home =
    homeZone !== undefined && homeZone !== null && isKnownTimeZone(homeZone)
      ? homeZone
      : 'UTC'
  return localDay(instant, home)
}

/**
 * Zone most of the given zones agree on; ties go to the alphabetically first
 * name. Null for an empty list.
 */
export function majorityZone(zones: readonly string[]): string | null {
  const counts = new Map<string, number>()
  for (const zone of zones) {
    counts.set(zone, (counts.get(zone) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [zone, count] of counts) {
    if (
      count > bestCount ||
      (count === bestCount && best !== null && zone < best)
    ) {
      best = zone
      bestCount = count
    }
  }
  return best
}

/** An instant this close to a photo is read on that photo's clock (12 h). */
export const OWN_ZONE_WINDOW_MS = 12 * 3_600_000

export interface PhotoDayZones {
  /** Photo days (YYYY-MM-DD), ascending. */
  dates: string[]
  /**
   * The author's night over all photos (see createNightDayResolver). `pickDay`
   * uses it to place an instant: the day changes in the middle of the longest
   * sleep gap, else at 04:00.
   */
  night: (time: number, zone: string) => NightDayResolution
  /**
   * Zone of the photo closest in time to an instant (ties: the earlier one),
   * null when no photo is within OWN_ZONE_WINDOW_MS. A stop starts and ends at
   * its own photos, so this is the zone the stop was shot in, however the
   * rest of its day went. Far from every photo it says nothing.
   */
  zoneAt: (time: number) => string | null
  /** Majority zone of each day in `dates`. */
  zones: string[]
}

/**
 * Photo days and the zone each is mostly spent in. A photo's own day is
 * computed in its own zone.
 */
export function photoDayZones(
  photos: readonly { instant: number; zone: string }[],
): PhotoDayZones {
  const byDay = new Map<string, string[]>()
  for (const photo of photos) {
    const date = localDay(photo.instant, photo.zone)
    const list = byDay.get(date)
    if (list === undefined) {
      byDay.set(date, [photo.zone])
    } else {
      list.push(photo.zone)
    }
  }
  const dates = [...byDay.keys()].sort()
  const zones = dates.map(
    (date) => majorityZone(byDay.get(date) ?? []) ?? 'UTC',
  )
  const known = photos
    .flatMap((photo) =>
      isKnownTimeZone(photo.zone)
        ? [{ time: photo.instant, zone: photo.zone }]
        : [],
    )
    .sort((a, b) => a.time - b.time)
  const night = createNightDayResolver(known)
  const zoneAt = (time: number): string | null => {
    // First photo not before the instant; the answer is it or its predecessor.
    let low = 0
    let high = known.length
    while (low < high) {
      const mid = (low + high) >> 1
      if ((known[mid]?.time ?? Infinity) < time) low = mid + 1
      else high = mid
    }
    const before = known[low - 1]
    const after = known[low]
    const gapBefore = before === undefined ? Infinity : time - before.time
    const gapAfter = after === undefined ? Infinity : after.time - time
    const best = gapBefore <= gapAfter ? before : after
    return best !== undefined &&
      Math.min(gapBefore, gapAfter) <= OWN_ZONE_WINDOW_MS
      ? best.zone
      : null
  }
  return { dates, night, zoneAt, zones }
}

/**
 * Day of an instant by the author's night: the zone is that of the photo
 * closest in time (so a stop is read on the clock of the place it was shot,
 * also on a travel day that is mostly spent in another zone); without any
 * photo the one pickLocalDay finds (zone of the photo day, else home). The
 * boundary is the middle of the longest sleep gap of that night, else 04:00.
 * The one function every screen and the stored `moments.local_day` use.
 */
export function pickDay(
  instant: number | Date,
  homeZone: string | null | undefined,
  photoDays: PhotoDayZones,
): string {
  const time = typeof instant === 'number' ? instant : instant.getTime()
  const own = photoDays.zoneAt(time)
  if (own !== null) {
    return photoDays.night(time, own).date
  }
  const base = pickLocalDay(instant, homeZone, photoDays.dates, photoDays.zones)
  const known = photoDays.zones[photoDays.dates.indexOf(base)]
  const home =
    homeZone !== undefined && homeZone !== null && isKnownTimeZone(homeZone)
      ? homeZone
      : 'UTC'
  const zone = known !== undefined && isKnownTimeZone(known) ? known : home
  return photoDays.night(time, zone).date
}
