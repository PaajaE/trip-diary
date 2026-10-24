/**
 * Filters of the batch grid. Pure: they decide which unsorted media are shown;
 * the "left to sort" counter keeps counting everything.
 */
import { clusterSeries } from '@trip-diary/core/automation'
import type { MediaItem } from '@/entities/media/model/media-library'
import type { BatchDay } from '@/features/media-batch/model/batch-days'

export type BatchFilter = 'all' | 'noLocation' | 'series' | 'video'

/** Chip order. */
export const BATCH_FILTERS: readonly BatchFilter[] = [
  'all',
  'noLocation',
  'series',
  'video',
]

export interface BatchFilterModel {
  counts: Record<BatchFilter, number>
  /** Ids of photos that belong to a series of similar shots. */
  seriesIds: ReadonlySet<string>
}

export function buildFilterModel(
  items: readonly MediaItem[],
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
  let noLocation = 0
  let video = 0
  for (const item of items) {
    if (item.latitude === null || item.longitude === null) noLocation += 1
    if (item.kind === 'video') video += 1
  }
  return {
    counts: {
      all: items.length,
      noLocation,
      series: seriesIds.size,
      video,
    },
    seriesIds,
  }
}

/** Chips to show: "all" always, the others only when something matches. */
export function visibleFilters(model: BatchFilterModel): BatchFilter[] {
  return BATCH_FILTERS.filter(
    (filter) => filter === 'all' || model.counts[filter] > 0,
  )
}

export function matchesFilter(
  item: MediaItem,
  filter: BatchFilter,
  model: BatchFilterModel,
): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'noLocation':
      return item.latitude === null || item.longitude === null
    case 'series':
      return model.seriesIds.has(item.id)
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
