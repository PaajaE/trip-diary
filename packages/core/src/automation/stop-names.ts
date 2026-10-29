import { compareText } from './compare.ts'
import { isKnownTimeZone, localDay } from './local-day.ts'
import type { PlaceKind } from './journey-plan.ts'
import { zoneOffsetMinutes } from './time-zone.ts'

/**
 * Names of stops without a stored title (plan 4f, point 9). The automation
 * never writes `title`, only `place_id`; the UI derives the name:
 *   1. a manual title (stored `title`) always wins;
 *   2. a specific place (peak, lake, attraction, settlement) by its name;
 *   3. quarter + city when the place knows its quarter;
 *   4. "near <city>" for the geocoder's near fallback;
 *   5. the time of day ("Thursday afternoon") when no place is known (a
 *      region or country fallback counts as none).
 * Equal derived names on one local day are told apart by the time of day
 * ("Banff · morning"), then by a number. While a place is still being looked
 * up the name is `pending` (the UI shows a skeleton "Looking up the place…").
 * Pure: the wording is the app's (i18n); this returns structured parts.
 */

/** Part of the day, by local wall-clock hour of the stop's start. */
export type DayPeriod =
  | 'afternoon'
  | 'evening'
  | 'lateMorning'
  | 'morning'
  | 'night'

export interface StopNamePlace {
  /** Quarter / district inside a city, when the place knows it. */
  district?: string | null | undefined
  /** Stored or derived kind; `near` = "near <name>". */
  kind?: PlaceKind | null | undefined
  name: string
}

export interface StopNameInput {
  /** Local day key (YYYY-MM-DD, 04:00 rule); computed from `startsAt` when absent. */
  dayKey?: string | undefined
  id: string
  /** The stop has (or will get) a place that is not loaded yet. */
  placePending: boolean
  place: StopNamePlace | null
  startsAt: string
  /** IANA zone of the stop (display zone); UTC when unknown. */
  timeZone: string | null
  /** Stored title = manual name. */
  title: string | null
}

export type StopNameBase =
  | { kind: 'title'; text: string }
  | { kind: 'place'; text: string }
  | { city: string; district: string; kind: 'district' }
  | { city: string; kind: 'near' }
  | { kind: 'dayPart'; period: DayPeriod; weekday: number }
  | { kind: 'pending' }

export interface StopName {
  base: StopNameBase
  /** Day of the stop (YYYY-MM-DD), for the weekday and grouping. */
  dayKey: string
  /** Number among equal names of one day (2, 3, ...), null when unique. */
  ordinal: number | null
  /** Time of day added to tell equal names of one day apart. */
  period: DayPeriod | null
}

const NEAR_PREFIX = /^(u|near)\s+/i

/** Period of a local hour: night 22-04, morning 04-10, late morning 10-12, ... */
export function dayPeriodOfHour(hour: number): DayPeriod {
  if (hour >= 4 && hour < 10) return 'morning'
  if (hour >= 10 && hour < 12) return 'lateMorning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'night'
}

function zoneOrUtc(timeZone: string | null): string {
  return timeZone !== null && isKnownTimeZone(timeZone) ? timeZone : 'UTC'
}

function localHour(instant: number, timeZone: string): number {
  const offset = zoneOffsetMinutes(timeZone, instant)
  const minutes = Math.floor((instant + offset * 60_000) / 60_000)
  return ((Math.floor(minutes / 60) % 24) + 24) % 24
}

/** 0 = Sunday ... 6 = Saturday, of a YYYY-MM-DD day key. */
function weekdayOf(dayKey: string): number {
  const time = Date.parse(`${dayKey}T12:00:00Z`)
  return Number.isNaN(time) ? 0 : new Date(time).getUTCDay()
}

function baseOf(
  input: StopNameInput,
  period: DayPeriod,
  dayKey: string,
): StopNameBase {
  const title = input.title?.trim() ?? ''
  if (title !== '') return { kind: 'title', text: title }
  const place = input.place
  const name = place?.name.trim() ?? ''
  // A region or country says too little about a stop: the time of day wins.
  const coarse = place?.kind === 'region' || place?.kind === 'country'
  if (place !== null && name !== '' && !coarse) {
    const near = place.kind === 'near' || NEAR_PREFIX.test(name)
    if (near) {
      const city = name.replace(NEAR_PREFIX, '').trim()
      return { city: city === '' ? name : city, kind: 'near' }
    }
    const district = place.district?.trim() ?? ''
    if (district !== '' && district !== name && place.kind === 'settlement') {
      return { city: name, district, kind: 'district' }
    }
    return { kind: 'place', text: name }
  }
  if (input.placePending) return { kind: 'pending' }
  return { kind: 'dayPart', period, weekday: weekdayOf(dayKey) }
}

function keyOf(base: StopNameBase): string | null {
  switch (base.kind) {
    case 'title':
      return null // manual names are never changed
    case 'pending':
      return null
    case 'place':
      return `p|${base.text}`
    case 'district':
      return `d|${base.district}|${base.city}`
    case 'near':
      return `n|${base.city}`
    case 'dayPart':
      return `t|${String(base.weekday)}|${base.period}`
  }
}

/**
 * Derives the names of a list of stops (any order); the result maps stop id
 * to its name. Deterministic: ties are ordered by start, then id.
 */
export function deriveStopNames(
  stops: readonly StopNameInput[],
): Map<string, StopName> {
  interface Row {
    base: StopNameBase
    dayKey: string
    id: string
    key: string | null
    period: DayPeriod
    time: number
  }
  const rows: Row[] = stops.map((stop) => {
    const zone = zoneOrUtc(stop.timeZone)
    const parsed = Date.parse(stop.startsAt)
    const time = Number.isNaN(parsed) ? 0 : parsed
    const dayKey = stop.dayKey ?? localDay(time, zone)
    const period = dayPeriodOfHour(localHour(time, zone))
    const base = baseOf(stop, period, dayKey)
    return { base, dayKey, id: stop.id, key: keyOf(base), period, time }
  })
  rows.sort((a, b) => a.time - b.time || compareText(a.id, b.id))

  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    if (row.key === null) continue
    const groupKey = `${row.dayKey}|${row.key}`
    const list = groups.get(groupKey)
    if (list === undefined) groups.set(groupKey, [row])
    else list.push(row)
  }

  const out = new Map<string, StopName>()
  for (const row of rows) {
    out.set(row.id, {
      base: row.base,
      dayKey: row.dayKey,
      ordinal: null,
      period: null,
    })
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue
    // A time-of-day name already is the period; only a number tells it apart.
    const byPeriod = list[0]?.base.kind !== 'dayPart'
    const seen = new Map<string, number>()
    for (const row of list) {
      const sub = byPeriod ? row.period : ''
      const count = (seen.get(sub) ?? 0) + 1
      seen.set(sub, count)
      out.set(row.id, {
        base: row.base,
        dayKey: row.dayKey,
        ordinal: count > 1 ? count : null,
        period: byPeriod ? row.period : null,
      })
    }
  }
  return out
}
