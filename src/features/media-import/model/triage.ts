import {
  isOpenTriageStatus,
  triageItemId,
  type TriageItem,
  type TriageStatus,
} from '@/entities/media/model/triage-item'
import { localDay, resolveCaptureZone } from '@trip-diary/core/automation'
import type { ImportCandidate } from '@/features/media-import/model/types'
import type { ImportSourceKind } from '@/entities/media/model/upload-job'

/** Filter chips of the triage grid. */
export type TriageFilter = 'all' | 'dismissed' | 'found' | 'kept' | 'starred'

/** Decisions of the author (Pryč / Ponechat / Nejlepší / Vrátit). */
export type TriageDecision = 'away' | 'best' | 'keep' | 'restore'

const DECISION_STATUS: Record<TriageDecision, TriageStatus> = {
  away: 'dismissed',
  best: 'starred',
  keep: 'kept',
  restore: 'found',
}

/**
 * Items the flow works on: every open item (found, kept, starred) of any
 * earlier read, plus the dismissed ones of the latest read. Open items are
 * never stranded by a newer read; older dismissed ones are only listed under
 * "Dříve vyřazeno" until restored (then they are found, hence open).
 */
export function isInScope(
  item: TriageItem,
  selectionId: string | null,
): boolean {
  if (item.status === 'uploaded') return false
  if (item.status === 'dismissed') return item.selectionId === selectionId
  return true
}

/** Items the flow shows: everything that is not uploaded yet. */
export function visibleItems(items: readonly TriageItem[]): TriageItem[] {
  return items.filter((item) => item.status !== 'uploaded')
}

export interface TriageCounts {
  dismissed: number
  found: number
  kept: number
  /** Ponechaná + Nejlepší: what "Nahrát N vybraných" uploads. */
  selected: number
  starred: number
  total: number
}

export function triageCounts(items: readonly TriageItem[]): TriageCounts {
  const counts: TriageCounts = {
    dismissed: 0,
    found: 0,
    kept: 0,
    selected: 0,
    starred: 0,
    total: 0,
  }
  for (const item of items) {
    if (item.status === 'uploaded') continue
    counts.total += 1
    if (item.status === 'found') counts.found += 1
    else if (item.status === 'kept') counts.kept += 1
    else if (item.status === 'starred') counts.starred += 1
    else counts.dismissed += 1
  }
  counts.selected = counts.kept + counts.starred
  return counts
}

export function filterItems(
  items: readonly TriageItem[],
  filter: TriageFilter,
): TriageItem[] {
  const shown = visibleItems(items)
  if (filter === 'all') return shown
  return shown.filter((item) => item.status === filter)
}

/** What decides the zone and day of an item (a TriageItem or a candidate). */
export interface ZonedMoment {
  capturedAt: string | null
  latitude: number | null
  longitude: number | null
}

const zoneCache = new Map<string, string | null>()

/**
 * IANA zone of the photo's own position (offline lookup, as for journey days);
 * null when the item has no position or the lookup fails. Cached per ~1 km.
 */
function zoneAtPosition(item: ZonedMoment): string | null {
  if (item.latitude === null || item.longitude === null) return null
  const key = `${item.latitude.toFixed(2)},${item.longitude.toFixed(2)}`
  const cached = zoneCache.get(key)
  if (cached !== undefined) return cached
  let zone: string | null
  try {
    zone =
      resolveCaptureZone({
        capturedAt: item.capturedAt ?? '',
        exifOffsetMinutes: null,
        homeTimeZone: null,
        latitude: item.latitude,
        longitude: item.longitude,
      })?.timeZone ?? null
  } catch {
    zone = null
  }
  zoneCache.set(key, zone)
  return zone
}

/**
 * Zone an item is shown in: the photo's own zone (from its position, the same
 * source the map and the journey days use). Only an item with no position
 * falls back to the device zone; `fallback` marks that case for the UI.
 */
export function itemZone(
  item: ZonedMoment,
  deviceZone: string,
): { fallback: boolean; timeZone: string } {
  const own = zoneAtPosition(item)
  return own === null
    ? { fallback: true, timeZone: deviceZone }
    : { fallback: false, timeZone: own }
}

/**
 * Journey day of an instant in a zone, with the day starting at 04:00 local
 * time (core `localDay`, the one definition shared with the SQL local_day):
 * 'YYYY-MM-DD', or 'unknown' without a capture time.
 */
export function dayKey(capturedAt: string | null, timeZone: string): string {
  if (capturedAt === null) return 'unknown'
  const ms = Date.parse(capturedAt)
  if (Number.isNaN(ms)) return 'unknown'
  return localDay(ms, timeZone)
}

/** Day of an item in its own zone (device zone only without a position). */
export function itemDayKey(item: ZonedMoment, deviceZone: string): string {
  return dayKey(item.capturedAt, itemZone(item, deviceZone).timeZone)
}

export interface TriageDay {
  /** 'YYYY-MM-DD' or 'unknown' (no capture time). */
  key: string
  /** Items without a position: their day follows the device zone. */
  deviceZoneCount: number
  items: TriageItem[]
  /** Undecided items of the day. */
  remaining: number
}

export function byTime(a: TriageItem, b: TriageItem): number {
  const left = a.capturedAt === null ? Infinity : Date.parse(a.capturedAt)
  const right = b.capturedAt === null ? Infinity : Date.parse(b.capturedAt)
  if (left !== right) return left < right ? -1 : 1
  return a.sourceId.localeCompare(b.sourceId)
}

/** Items grouped by device calendar day, oldest day first; unknown last. */
export function groupByDay(
  items: readonly TriageItem[],
  timeZone: string,
): TriageDay[] {
  const days = new Map<string, TriageItem[]>()
  for (const item of [...items].sort(byTime)) {
    const key = itemDayKey(item, timeZone)
    const list = days.get(key)
    if (list === undefined) days.set(key, [item])
    else list.push(item)
  }
  return [...days.entries()]
    .sort(([a], [b]) => {
      if (a === b) return 0
      if (a === 'unknown') return 1
      if (b === 'unknown') return -1
      return a < b ? -1 : 1
    })
    .map(([key, list]) => ({
      deviceZoneCount: list.filter((item) => itemZone(item, timeZone).fallback)
        .length,
      items: list,
      key,
      remaining: list.filter((item) => item.status === 'found').length,
    }))
}

/** Applies one decision to the given ids; returns only the changed items. */
export function decide(
  items: readonly TriageItem[],
  ids: ReadonlySet<string>,
  decision: TriageDecision,
  updatedAt: string,
): TriageItem[] {
  const status = DECISION_STATUS[decision]
  const changed: TriageItem[] = []
  for (const item of items) {
    if (!ids.has(item.id) || item.status === 'uploaded') continue
    if (item.status === status) continue
    changed.push({ ...item, status, updatedAt })
  }
  return changed
}

/** Next undecided item after `afterId` (wraps around), or null. */
export function nextUndecided(
  items: readonly TriageItem[],
  afterId: string | null,
): TriageItem | null {
  const open = items.filter((item) => item.status === 'found')
  if (open.length === 0) return null
  if (afterId === null) return open[0] ?? null
  const position = items.findIndex((item) => item.id === afterId)
  const following = items
    .slice(position + 1)
    .find((item) => item.status === 'found')
  return following ?? open[0] ?? null
}

// --- reading the library ----------------------------------------------------

/** Sortable id of one read (ISO instant + a short random suffix). */
export function newSelectionId(now: number, random: () => number): string {
  return `${new Date(now).toISOString()}-${random().toString(36).slice(2, 8)}`
}

export function latestSelectionId(items: readonly TriageItem[]): string | null {
  let latest: string | null = null
  for (const item of items) {
    if (latest === null || item.selectionId > latest) latest = item.selectionId
  }
  return latest
}

export interface ReadContext {
  journeyId: string
  now: string
  ownerId: string
  selectionId: string
  sourceKind: ImportSourceKind
}

export interface ReadResult {
  /** Candidates dropped because they are dismissed (remembered, not offered). */
  dismissedBefore: number
  /** Items to persist (new, or existing ones moved into this read). */
  items: TriageItem[]
  /** Candidates that can never be imported (listed as skipped). */
  skipped: number
}

/**
 * Merges a freshly read library range with what is already remembered:
 * known undecided/kept items keep their decision and move into this read,
 * dismissed ones are not re-offered, uploaded ones are ignored.
 */
export function reconcileRead(
  existing: readonly TriageItem[],
  candidates: readonly ImportCandidate[],
  context: ReadContext,
): ReadResult {
  const known = new Map(existing.map((item) => [item.id, item]))
  const result: ReadResult = { dismissedBefore: 0, items: [], skipped: 0 }
  for (const candidate of candidates) {
    if (candidate.skipReason !== undefined) {
      result.skipped += 1
      continue
    }
    const id = triageItemId(
      context.journeyId,
      context.sourceKind,
      candidate.sourceId,
    )
    const prior = known.get(id)
    if (prior?.status === 'uploaded') continue
    if (prior?.status === 'dismissed') {
      result.dismissedBefore += 1
      continue
    }
    if (prior !== undefined) {
      result.items.push({ ...prior, selectionId: context.selectionId })
      continue
    }
    result.items.push({
      bestPending: false,
      burstId: candidate.burstId ?? null,
      byteSize: candidate.byteSize ?? null,
      capturedAt: candidate.capturedAt,
      durationMs: candidate.durationMs,
      icloudOnly: false,
      id,
      journeyId: context.journeyId,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      mediaType: candidate.mediaType,
      ownerId: context.ownerId,
      place: candidate.place ?? null,
      selectionId: context.selectionId,
      sourceId: candidate.sourceId,
      sourceKind: context.sourceKind,
      status: 'found',
      updatedAt: context.now,
    })
  }
  return result
}

/** Back from a stored item to what the upload queue takes. */
export function toCandidate(item: TriageItem): ImportCandidate {
  return {
    byteSize: item.byteSize,
    capturedAt: item.capturedAt,
    durationMs: item.durationMs,
    latitude: item.latitude,
    longitude: item.longitude,
    mediaType: item.mediaType,
    sourceId: item.sourceId,
  }
}

// --- overview (B) -----------------------------------------------------------

export interface TriageOverview {
  /** Items per day, oldest first (unknown day excluded). */
  dayCounts: { count: number; key: string }[]
  firstDay: string | null
  icloudOnly: number
  lastDay: string | null
  /** Distinct calendar days with a known capture time. */
  days: number
  noLocation: number
  photos: number
  /** First and last place name in capture order, when sources know them. */
  places: { first: string | null; last: string | null }
  /** Positions in capture order for the route sketch. */
  route: { latitude: number; longitude: number }[]
  total: number
  videos: number
}

export function summarizeOverview(
  items: readonly TriageItem[],
  timeZone: string,
): TriageOverview {
  const perDay = new Map<string, number>()
  const firstByDay = new Map<string, { latitude: number; longitude: number }>()
  let photos = 0
  let videos = 0
  let icloudOnly = 0
  let noLocation = 0
  let firstPlace: string | null = null
  let lastPlace: string | null = null
  for (const item of [...items].sort(byTime)) {
    if (item.place !== null) {
      firstPlace ??= item.place
      lastPlace = item.place
    }
    if (item.mediaType === 'video') videos += 1
    else photos += 1
    if (item.icloudOnly) icloudOnly += 1
    const located = item.latitude !== null && item.longitude !== null
    if (!located) noLocation += 1
    const key = itemDayKey(item, timeZone)
    if (key === 'unknown') continue
    perDay.set(key, (perDay.get(key) ?? 0) + 1)
    if (
      located &&
      !firstByDay.has(key) &&
      item.latitude !== null &&
      item.longitude !== null
    ) {
      firstByDay.set(key, {
        latitude: item.latitude,
        longitude: item.longitude,
      })
    }
  }
  const keys = [...perDay.keys()].sort()
  return {
    dayCounts: keys.map((key) => ({ count: perDay.get(key) ?? 0, key })),
    days: keys.length,
    firstDay: keys[0] ?? null,
    icloudOnly,
    lastDay: keys.at(-1) ?? null,
    noLocation,
    photos,
    places: { first: firstPlace, last: lastPlace },
    route: keys.flatMap((key) => {
      const point = firstByDay.get(key)
      return point === undefined ? [] : [point]
    }),
    total: items.length,
    videos,
  }
}

// --- size and time estimate -------------------------------------------------

/** Average sizes used when the library does not tell (UNVERIFIED estimate). */
export const ESTIMATE_PHOTO_BYTES = 4_200_000
export const ESTIMATE_VIDEO_BYTES = 22_000_000
/** Assumed sustained upload speed on Wi-Fi, bytes per second. */
export const ESTIMATE_BYTES_PER_SECOND = 430_000

export function estimateBytes(items: readonly TriageItem[]): number {
  let bytes = 0
  for (const item of items) {
    bytes +=
      item.byteSize ??
      (item.mediaType === 'video' ? ESTIMATE_VIDEO_BYTES : ESTIMATE_PHOTO_BYTES)
  }
  return bytes
}

export function estimateMinutes(bytes: number): number {
  return Math.max(1, Math.round(bytes / ESTIMATE_BYTES_PER_SECOND / 60))
}

/** "1,4 GB" / "410 MB" in the given locale. */
export function formatBytes(bytes: number, locale: string): string {
  const gb = bytes / 1_000_000_000
  if (gb >= 1) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(gb)} GB`
  }
  const mb = Math.max(1, Math.round(bytes / 1_000_000))
  return `${new Intl.NumberFormat(locale).format(mb)} MB`
}

/** "55 min" / "2 h 10 min". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${String(minutes)} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0
    ? `${String(hours)} h`
    : `${String(hours)} h ${String(rest)} min`
}

// --- series (C3) ------------------------------------------------------------

/** Photos closer than this in time and in the same day group as a series. */
export const SERIES_GAP_MS = 20_000

/**
 * Photos around `id` that form a series: the same burst id, or neighbours in
 * capture order that are at most SERIES_GAP_MS apart. Fewer than 2 = no series.
 */
export function seriesAround(
  items: readonly TriageItem[],
  id: string,
): TriageItem[] {
  const sorted = [...items]
    .filter((item) => item.mediaType === 'photo' && item.status !== 'uploaded')
    .sort(byTime)
  const index = sorted.findIndex((item) => item.id === id)
  const anchor = sorted[index]
  if (anchor === undefined) return []
  if (anchor.burstId !== null) {
    const burst = sorted.filter((item) => item.burstId === anchor.burstId)
    return burst.length >= 2 ? burst : []
  }
  const near = (a: TriageItem, b: TriageItem): boolean =>
    a.capturedAt !== null &&
    b.capturedAt !== null &&
    a.burstId === null &&
    b.burstId === null &&
    Math.abs(Date.parse(a.capturedAt) - Date.parse(b.capturedAt)) <=
      SERIES_GAP_MS
  let start = index
  while (start > 0) {
    const previous = sorted[start - 1]
    const here = sorted[start]
    if (previous === undefined || here === undefined || !near(previous, here))
      break
    start -= 1
  }
  let end = index
  while (end < sorted.length - 1) {
    const next = sorted[end + 1]
    const here = sorted[end]
    if (next === undefined || here === undefined || !near(here, next)) break
    end += 1
  }
  const series = sorted.slice(start, end + 1)
  return series.length >= 2 ? series : []
}

/** Sharpness scores relative to the sharpest of the series: 0..100. */
export function relativeSharpness(
  scores: ReadonlyMap<string, number>,
): Map<string, number> {
  let max = 0
  for (const score of scores.values()) max = Math.max(max, score)
  const out = new Map<string, number>()
  for (const [id, score] of scores) {
    out.set(id, max <= 0 ? 0 : Math.round((score / max) * 100))
  }
  return out
}

export function openItems(items: readonly TriageItem[]): TriageItem[] {
  return items.filter((item) => isOpenTriageStatus(item.status))
}
