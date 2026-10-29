/**
 * Filters of the batch grid. Pure: they decide which unsorted media are shown;
 * the "left to sort" counter keeps counting everything.
 */
import { clusterSeries, findJunkCandidates } from '@trip-diary/core/automation'
import type { MediaItem } from '@/entities/media/model/media-library'
import type { BatchDay } from '@/features/media-batch/model/batch-days'
import {
  isForeignUploader,
  type UploaderModel,
} from '@/features/media-batch/model/uploaders'

export type BaseBatchFilter =
  | 'all'
  | 'junk'
  | 'noLocation'
  | 'series'
  | 'starred'
  | 'video'

/** "Uploaded by <member>" filter of a shared journey: `uploader:<user id>`. */
export type UploaderFilter = `uploader:${string}`

export type BatchFilter = BaseBatchFilter | UploaderFilter

export function uploaderFilter(userId: string): UploaderFilter {
  return `uploader:${userId}`
}

export function uploaderOfFilter(filter: BatchFilter): string | null {
  return filter.startsWith('uploader:')
    ? filter.slice('uploader:'.length)
    : null
}

/** Chip order. */
export const BATCH_FILTERS: readonly BaseBatchFilter[] = [
  'all',
  'noLocation',
  'series',
  'junk',
  'starred',
  'video',
]

export interface UploaderChip {
  count: number
  /** Display name, null when unknown (the chip then reads generically). */
  name: string | null
  userId: string
}

export interface BatchFilterModel {
  counts: Record<BaseBatchFilter, number>
  /** Ids of probable throw-aways (a queue to confirm, never automatic). */
  junkIds: ReadonlySet<string>
  /** Ids of photos that belong to a series of similar shots. */
  seriesIds: ReadonlySet<string>
  /** One chip per other uploader, only in shared journeys. */
  uploaders: readonly UploaderChip[]
}

/** Number of items a filter matches. */
export function filterCount(
  model: BatchFilterModel,
  filter: BatchFilter,
): number {
  const userId = uploaderOfFilter(filter)
  if (userId === null) return model.counts[filter as BaseBatchFilter]
  return model.uploaders.find((chip) => chip.userId === userId)?.count ?? 0
}

export function buildFilterModel(
  items: readonly MediaItem[],
  uploaders?: UploaderModel,
): BatchFilterModel {
  const seriesIds = new Set(
    clusterSeries(
      items.map((item) => ({
        capturedAt: item.capturedAt,
        id: item.id,
        phash: item.phash ?? null,
      })),
    ).flat(),
  )
  const junkIds = new Set(
    findJunkCandidates(
      items.map((item) => ({
        height: item.height,
        id: item.id,
        kind: item.kind,
        latitude: item.latitude,
        longitude: item.longitude,
        quality: item.quality ?? null,
        starred: item.starred,
        width: item.width,
      })),
    ).map((candidate) => candidate.id),
  )
  let noLocation = 0
  let starred = 0
  let video = 0
  const byUploader = new Map<string, number>()
  for (const item of items) {
    if (uploaders !== undefined && isForeignUploader(uploaders, item.ownerId))
      byUploader.set(item.ownerId, (byUploader.get(item.ownerId) ?? 0) + 1)
    if (item.latitude === null || item.longitude === null) noLocation += 1
    if (item.starred) starred += 1
    if (item.kind === 'video') video += 1
  }
  return {
    counts: {
      all: items.length,
      junk: junkIds.size,
      noLocation,
      series: seriesIds.size,
      starred,
      video,
    },
    junkIds,
    seriesIds,
    uploaders: [...byUploader].map(([userId, count]) => ({
      count,
      name: uploaders?.names.get(userId) ?? null,
      userId,
    })),
  }
}

/** Chips to show: "all" always, the others only when something matches. */
export function visibleFilters(model: BatchFilterModel): BatchFilter[] {
  return [
    ...BATCH_FILTERS.filter(
      (filter) => filter === 'all' || model.counts[filter] > 0,
    ),
    ...model.uploaders.map((chip) => uploaderFilter(chip.userId)),
  ]
}

export function matchesFilter(
  item: MediaItem,
  filter: BatchFilter,
  model: BatchFilterModel,
): boolean {
  const uploader = uploaderOfFilter(filter)
  if (uploader !== null) return item.ownerId === uploader
  switch (filter as BaseBatchFilter) {
    case 'all':
      return true
    case 'junk':
      return model.junkIds.has(item.id)
    case 'noLocation':
      return item.latitude === null || item.longitude === null
    case 'series':
      return model.seriesIds.has(item.id)
    case 'starred':
      return item.starred
    case 'video':
      return item.kind === 'video'
  }
}

/** Keeps matching media in every day and drops days that end up empty. */
export function filterDays(
  days: readonly BatchDay[],
  filter: BatchFilter,
  model: BatchFilterModel,
): BatchDay[] {
  if (filter === 'all') return [...days]
  return days.flatMap((day) => {
    const kept = day.items.filter((item) => matchesFilter(item, filter, model))
    return kept.length === 0 ? [] : [{ ...day, items: kept }]
  })
}
