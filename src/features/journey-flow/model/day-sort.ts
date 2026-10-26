/**
 * Třídění po dnech, one loop (plan 4f, UX flow points 3-4; mockups
 * M-Trideni, W-Trideni, M-Konec, W-Konec): day -> strip of its stops ->
 * photos of the current stop. A photo is sorted only once it has been gone
 * through (`reviewed_at`, set by the existing review path); confirming the
 * structure never marks photos. Finishing a stop confirms (locks) it.
 * Suggested-trash photos are flagged with a reason and shown faded; nothing
 * is ever deleted here. Series, the recommended shot and relative sharpness
 * come from the existing batch models (no second implementation).
 */
import { clusterSeries, recommendBest } from '@trip-diary/core/automation'
import type { MediaItem } from '@/entities/media/model/media-library'
import type { FlowDay, FlowStop } from '@/features/journey-flow/model/flow-days'
import {
  recommendForSeries,
  relativeSharpness,
} from '@/features/media-batch/model/series'
import { isUnreviewed } from '@/features/journey-workspace/model/day-status'
import { UNKNOWN_DAY } from '@/features/journey-workspace/model/workspace-days'

/** In a series, a photo this much less sharp than the sharpest is "rozmazaná". */
export const BLURRY_RELATIVE_MAX = 0.35
/** Mean luminance below this: almost black ("balast"). Unverified default. */
export const DARK_EXPOSURE_MAX = 0.06

export type TrashHintReason = 'blurry' | 'dark' | 'duplicate' | 'eyesClosed'

export interface SortPhoto {
  item: MediaItem
  /** Best shot of its series (recommendBest). */
  recommended: boolean
  reviewed: boolean
  /** Ids of its series in the day ("Podobné: 7"), empty when none. */
  seriesIds: readonly string[]
  /** Suggested for the trash, with the reason; shown faded, never deleted. */
  trashHint: TrashHintReason | null
}

export interface SortStop {
  done: boolean
  photos: SortPhoto[]
  reviewed: number
  stop: FlowStop
  total: number
}

export interface DaySortModel {
  /** First stop that still has unsorted photos, null when the day is done. */
  currentStopId: string | null
  dayKey: string
  /** "Den sedí" is offered: every stop looks sure and nothing is unplaced. */
  daySits: boolean
  /** Unlocked stops "Den sedí" would confirm. */
  daySitsIds: string[]
  /** Stops with all photos sorted ("3 z 12 hotovo"). */
  doneStops: number
  stops: SortStop[]
  totalStops: number
  /** Photos of the day without a stop (the "Nevím kam" card). */
  unassignedCount: number
}

function hintOf(
  item: MediaItem,
  series: readonly string[],
  recommended: string | null,
  sharpness: ReadonlyMap<string, number | null>,
  copies: ReadonlySet<string>,
): TrashHintReason | null {
  if (copies.has(item.id)) return 'duplicate'
  const quality = item.quality ?? null
  if (item.starred || item.kind !== 'photo') return null
  if (series.length >= 2 && recommended !== null && recommended !== item.id) {
    if (quality?.eyesClosed === true) return 'eyesClosed'
    const relative = sharpness.get(item.id) ?? null
    if (relative !== null && relative < BLURRY_RELATIVE_MAX) return 'blurry'
  }
  if (quality?.exposure !== undefined && quality.exposure < DARK_EXPOSURE_MAX) {
    return 'dark'
  }
  return null
}

export function buildDaySort(day: FlowDay): DaySortModel {
  const series = clusterSeries(
    day.media.map((item) => ({
      capturedAt: item.capturedAt,
      id: item.id,
      phash: item.phash ?? null,
    })),
  )
  const byId = new Map(day.media.map((item) => [item.id, item]))
  const seriesOf = new Map<string, readonly string[]>()
  const bestOf = new Map<string, string | null>()
  const sharpness = new Map<string, number | null>()
  for (const group of series) {
    const items = group.flatMap((id) => {
      const item = byId.get(id)
      return item === undefined ? [] : [item]
    })
    const best = recommendForSeries(items)?.id ?? null
    for (const [id, value] of relativeSharpness(items)) sharpness.set(id, value)
    for (const id of group) {
      seriesOf.set(id, group)
      bestOf.set(id, best)
    }
  }
  const copies = new Set(day.duplicates.map((pair) => pair.id))

  const stops: SortStop[] = day.stops
    .filter((stop) => stop.media.length > 0)
    .map((stop) => {
      const photos = stop.media.map((item) => {
        const group = seriesOf.get(item.id) ?? []
        const best = bestOf.get(item.id) ?? null
        return {
          item,
          recommended: best === item.id,
          reviewed: !isUnreviewed(item),
          seriesIds: group,
          trashHint: hintOf(item, group, best, sharpness, copies),
        }
      })
      const reviewed = photos.filter((photo) => photo.reviewed).length
      return {
        done: reviewed === photos.length,
        photos,
        reviewed,
        stop,
        total: photos.length,
      }
    })
  const sure = day.stops.every(
    (stop) =>
      stop.confidence.level === 'high' || stop.confidence.level === 'confirmed',
  )
  return {
    currentStopId: stops.find((stop) => !stop.done)?.stop.id ?? null,
    dayKey: day.key,
    daySits: day.stops.length > 0 && sure && day.unassigned.length === 0,
    daySitsIds: day.stops.filter((stop) => !stop.locked).map((stop) => stop.id),
    doneStops: stops.filter((stop) => stop.done).length,
    stops,
    totalStops: stops.length,
    unassignedCount: day.unassigned.length,
  }
}

/** Next photo of the stop still to sort after `fromId` (wrapping), null when none. */
export function nextOpenPhoto(
  stop: SortStop,
  fromId: string | null = null,
  handled: ReadonlySet<string> = new Set(),
): string | null {
  const open = (photo: SortPhoto) =>
    !photo.reviewed && !handled.has(photo.item.id)
  const start =
    fromId === null
      ? -1
      : stop.photos.findIndex((photo) => photo.item.id === fromId)
  for (let i = start + 1; i < stop.photos.length; i += 1) {
    const photo = stop.photos[i]
    if (photo !== undefined && open(photo)) return photo.item.id
  }
  for (let i = 0; i <= start && i < stop.photos.length; i += 1) {
    const photo = stop.photos[i]
    if (photo !== undefined && open(photo) && photo.item.id !== fromId) {
      return photo.item.id
    }
  }
  return null
}

/**
 * The stop to confirm once `sortedNow` are sorted too: every photo of the
 * stop is then sorted (kept or trashed) and the stop is not locked yet.
 */
export function stopToConfirm(
  stop: SortStop,
  sortedNow: ReadonlySet<string>,
): string | null {
  if (stop.stop.locked) return null
  const done = stop.photos.every(
    (photo) => photo.reviewed || sortedNow.has(photo.item.id),
  )
  return done ? stop.stop.id : null
}

export interface DayEndSummary {
  /** Stops of the day still with unsorted photos ("zpět na třídění"). */
  backToStopId: string | null
  /** Day cover proposal: the best of the day's ★ photos, null without ★. */
  coverMediaId: string | null
  dayKey: string
  doneStops: number
  keep: number
  /** Next day ("Další den Sobota 6. 6. · 114 fotek"), null on the last day. */
  nextDay: { key: string; photoCount: number } | null
  star: number
  /** Photos of the day incl. the trashed ones ("71 fotek"). */
  total: number
  totalStops: number
  trash: number
}

/**
 * Konec dne (M-Konec, W-Konec). Trashed photos are no longer in the tree,
 * so the caller passes how many of the day it trashed (the sorting session
 * knows, see quick-sort `summarize`).
 */
export function buildDayEnd(
  day: FlowDay,
  days: readonly FlowDay[],
  trashed: number,
): DayEndSummary {
  const sort = buildDaySort(day)
  const photos = day.media.filter((item) => item.kind === 'photo')
  const starred = photos.filter((item) => item.starred)
  const cover = recommendBest(
    starred.map((item) => ({
      capturedAt: item.capturedAt,
      id: item.id,
      quality: item.quality ?? null,
      starred: true,
    })),
  )
  const index = days.findIndex((entry) => entry.key === day.key)
  const next = days
    .slice(index + 1)
    .find((entry) => entry.key !== UNKNOWN_DAY && entry.media.length > 0)
  return {
    backToStopId: sort.currentStopId,
    coverMediaId: cover?.id ?? null,
    dayKey: day.key,
    doneStops: sort.doneStops,
    keep: photos.length,
    nextDay:
      next === undefined
        ? null
        : {
            key: next.key,
            photoCount: next.media.filter((item) => item.kind === 'photo')
              .length,
          },
    star: starred.length,
    total: photos.length + trashed,
    totalStops: sort.totalStops,
    trash: trashed,
  }
}
