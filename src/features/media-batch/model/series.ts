/**
 * Pure helpers of the series view: the recommended photo and the sharpness of
 * each photo RELATIVE to the series. Absolute sharp/blurry is never claimed
 * (the thresholds are unverified).
 */
import { recommendBest, type BestReason } from '@trip-diary/core/automation'
import type { MediaItem } from '@/entities/media/model/media-library'

export interface SeriesRecommendation {
  id: string
  reasons: BestReason[]
}

export function recommendForSeries(
  items: readonly MediaItem[],
): SeriesRecommendation | null {
  return recommendBest(
    items.map((item) => ({
      capturedAt: item.capturedAt,
      id: item.id,
      quality: item.quality ?? null,
      starred: item.starred,
    })),
  )
}

/**
 * quality.sharp / the largest sharp in the series, in [0, 1]. Null for photos
 * without quality, and for all of them when no photo has a positive value.
 */
export function relativeSharpness(
  items: readonly MediaItem[],
): Map<string, number | null> {
  let max = 0
  for (const item of items) {
    const sharp = item.quality?.sharp
    if (sharp !== undefined && sharp > max) max = sharp
  }
  return new Map(
    items.map((item) => {
      const sharp = item.quality?.sharp
      return [item.id, sharp === undefined || max <= 0 ? null : sharp / max]
    }),
  )
}
