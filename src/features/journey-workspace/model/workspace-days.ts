import {
  isKnownTimeZone,
  localDay,
  pickDay,
  photoDayZones,
  type PhotoDayZones,
} from '@trip-diary/core/automation'
import { browserZone } from '@/features/journey-workspace/lib/format-range'
import {
  collectMoments,
  type WorkspaceMoment,
  type WorkspaceTree,
} from '@/features/journey-workspace/model/workspace-tree'

/** Scope id of the day groups of moments that belong to no segment. */
export const LOOSE_SCOPE = 'loose'

/** Sentinel day key for moments whose start cannot be placed on a calendar. */
export const UNKNOWN_DAY = 'unknown'

const zoneCache = new Map<string, string>()

export function safeZone(tz: string | null): string {
  if (tz !== null) {
    const cached = zoneCache.get(tz)
    if (cached !== undefined) return cached
    if (isKnownTimeZone(tz)) {
      zoneCache.set(tz, tz)
      return tz
    }
  }
  return browserZone()
}

/**
 * Local calendar day ("2026-05-29") of an instant in an IANA zone; a day
 * starts at 04:00 local time (00:40 is still the previous day). A missing
 * or invalid zone means the device zone; a missing or invalid instant has no day (null).
 */
export function localDayKey(
  iso: string | null,
  tz: string | null,
): string | null {
  if (iso === null) return null
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return null
  return localDay(time, safeZone(tz))
}

/** A media item as far as day zones are concerned. */
export interface DatedMedia {
  capturedAt: string | null
  capturedTz: string | null
  /** Omitted = ready. Only ready media vote (like SQL journey_day_zones). */
  status?: string
}

/**
 * Photo days of a journey and the zone each is mostly spent in (SQL
 * journey_day_zones): ready, dated media vote with their capture zone, else
 * the home zone (UTC when unset). Build once per tree, not per item.
 */
export function buildPhotoDays(
  media: readonly DatedMedia[],
  homeTz: string | null,
): PhotoDayZones {
  const home = homeTz !== null && isKnownTimeZone(homeTz) ? homeTz : 'UTC'
  const photos: { instant: number; zone: string }[] = []
  for (const item of media) {
    if (item.status !== undefined && item.status !== 'ready') continue
    if (item.capturedAt === null) continue
    const instant = Date.parse(item.capturedAt)
    if (Number.isNaN(instant)) continue
    const own = item.capturedTz
    photos.push({
      instant,
      zone: own !== null && isKnownTimeZone(own) ? own : home,
    })
  }
  return photoDayZones(photos)
}

/** `buildPhotoDays` over every media item of a workspace tree (moments and unassigned). */
export function buildTreePhotoDays(
  tree: WorkspaceTree,
  homeTz: string | null,
): PhotoDayZones {
  return buildPhotoDays(
    [
      ...collectMoments(tree).flatMap((entry) => entry.media),
      ...tree.unassigned,
    ],
    homeTz,
  )
}

/** Day a moment belongs to (see groupMomentsByDay), null without a usable start. */
export function dayOf(
  entry: WorkspaceMoment,
  fallbackTz: string | null,
  photoDays: PhotoDayZones | null,
): string | null {
  if (photoDays === null) {
    return localDayKey(entry.moment.startsAt, entry.tz ?? fallbackTz)
  }
  const time = Date.parse(entry.moment.startsAt)
  if (Number.isNaN(time)) return null
  return pickDay(time, fallbackTz, photoDays)
}

export interface MomentDay {
  /** Local day key, or UNKNOWN_DAY. */
  key: string
  moments: WorkspaceMoment[]
  photoCount: number
  /** Most frequent place ids of the day (up to two), most frequent first. */
  placeIds: string[]
}

/**
 * Groups time-ordered moments by local calendar day of their start in their
 * own zone (fallback: `fallbackTz`, then the device zone). With `photoDays`
 * the SQL rule applies instead (pick_local_day: photo day zones, else
 * `fallbackTz` as home zone, UTC when unset). Days keep first-seen order;
 * moments without a usable start go to one trailing UNKNOWN_DAY group.
 */
export function groupMomentsByDay(
  entries: readonly WorkspaceMoment[],
  fallbackTz: string | null = null,
  photoDays: PhotoDayZones | null = null,
): MomentDay[] {
  const days = new Map<string, MomentDay>()
  const counts = new Map<string, Map<string, number>>()
  for (const entry of entries) {
    const key = dayOf(entry, fallbackTz, photoDays) ?? UNKNOWN_DAY
    let day = days.get(key)
    if (day === undefined) {
      day = { key, moments: [], photoCount: 0, placeIds: [] }
      days.set(key, day)
    }
    day.moments.push(entry)
    day.photoCount += entry.photoCount
    const placeId = entry.moment.placeId
    if (placeId !== null) {
      const perDay = counts.get(key) ?? new Map<string, number>()
      perDay.set(placeId, (perDay.get(placeId) ?? 0) + 1)
      counts.set(key, perDay)
    }
  }
  for (const [key, day] of days) {
    day.placeIds = [...(counts.get(key) ?? [])]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 2)
      .map(([id]) => id)
  }
  const ordered = [...days.values()]
  const unknown = ordered.filter((day) => day.key === UNKNOWN_DAY)
  return [...ordered.filter((day) => day.key !== UNKNOWN_DAY), ...unknown]
}

/** DOM id of a day heading inside a segment (or the loose-moments group). */
export const dayElementId = (scopeId: string, dayKey: string) =>
  `ws-day-${scopeId}-${dayKey}`

/**
 * Distinct place names of a day, most frequent first (ties: first seen),
 * deduplicated case-insensitively; names that are empty are skipped.
 */
export function dayPlaceNames(
  day: MomentDay,
  nameOf: (placeId: string) => string | undefined,
  max: number,
): string[] {
  const seen = new Map<string, { count: number; name: string; order: number }>()
  for (const entry of day.moments) {
    const id = entry.moment.placeId
    if (id === null) continue
    const name = nameOf(id)?.trim() ?? ''
    if (name === '') continue
    const key = name.toLocaleLowerCase()
    const found = seen.get(key)
    if (found === undefined) seen.set(key, { count: 1, name, order: seen.size })
    else found.count += 1
  }
  return [...seen.values()]
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .slice(0, max)
    .map((place) => place.name)
}

/** Earliest local day key among moments (the journey's "Den 1"), or null. */
export function firstDayKey(
  entries: readonly WorkspaceMoment[],
  fallbackTz: string | null = null,
  photoDays: PhotoDayZones | null = null,
): string | null {
  let first: string | null = null
  for (const entry of entries) {
    const key = dayOf(entry, fallbackTz, photoDays)
    if (key !== null && (first === null || key < first)) first = key
  }
  return first
}

/** 1-based day number of `dayKey` counted from `firstKey`; null if unknown. */
export function dayNumber(firstKey: string | null, key: string): number | null {
  if (firstKey === null || key === UNKNOWN_DAY) return null
  const diff =
    Date.parse(`${key}T00:00:00Z`) - Date.parse(`${firstKey}T00:00:00Z`)
  if (Number.isNaN(diff)) return null
  return Math.round(diff / 86_400_000) + 1
}
