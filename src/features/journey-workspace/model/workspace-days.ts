import type { WorkspaceMoment } from '@/features/journey-workspace/model/workspace-tree'

/** Scope id of the day groups of moments that belong to no segment. */
export const LOOSE_SCOPE = 'loose'

/** Sentinel day key for moments whose start cannot be placed on a calendar. */
export const UNKNOWN_DAY = 'unknown'

function safeZone(tz: string | null): string {
  if (tz === null) return 'UTC'
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return tz
  } catch {
    return 'UTC'
  }
}

/**
 * Local calendar day ("2026-05-29") of an instant in an IANA zone. A missing
 * or invalid zone means UTC; a missing or invalid instant has no day (null).
 */
export function localDayKey(
  iso: string | null,
  tz: string | null,
): string | null {
  if (iso === null) return null
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: safeZone(tz),
    year: 'numeric',
  }).formatToParts(new Date(time))
  const pick = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${pick('year')}-${pick('month')}-${pick('day')}`
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
 * own zone (fallback: `fallbackTz`, then UTC). Days keep first-seen order;
 * moments without a usable start go to one trailing UNKNOWN_DAY group.
 */
export function groupMomentsByDay(
  entries: readonly WorkspaceMoment[],
  fallbackTz: string | null = null,
): MomentDay[] {
  const days = new Map<string, MomentDay>()
  const counts = new Map<string, Map<string, number>>()
  for (const entry of entries) {
    const key =
      localDayKey(entry.moment.startsAt, entry.tz ?? fallbackTz) ?? UNKNOWN_DAY
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

/** Outline label of a moment: title, else "time place", else "time". */
export function momentOutlineLabel(
  title: string | null,
  place: string | null,
  time: string,
): string {
  if (title !== null) return title
  return place === null ? time : `${time} ${place}`
}

/** DOM id of a day heading inside a segment (or the loose-moments group). */
export const dayElementId = (scopeId: string, dayKey: string) =>
  `ws-day-${scopeId}-${dayKey}`
