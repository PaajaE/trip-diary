import { pickBestOfDay } from '@trip-diary/core/automation'
import type { MediaItem } from '@/entities/media/model/media-library'

/** A day with fewer photos than this has nothing to choose from. */
export const BEST_OF_DAY_MIN_PHOTOS = 8

/**
 * The photos that tell the day (3-6, starred ones always included), from the
 * day's media in display order. Only suggests: nothing is marked or hidden.
 */
export function bestPhotosOfDay(media: readonly MediaItem[]): MediaItem[] {
  if (media.length < BEST_OF_DAY_MIN_PHOTOS) return []
  const byId = new Map(media.map((item) => [item.id, item]))
  const picks = pickBestOfDay(
    media.map((item) => ({
      capturedAt: item.capturedAt,
      id: item.id,
      kind: item.kind === 'video' ? ('video' as const) : ('photo' as const),
      phash: item.phash ?? null,
      quality: item.quality ?? null,
      starred: item.starred,
      stopId: item.momentId,
    })),
  )
  return picks.flatMap((pick) => {
    const item = byId.get(pick.id)
    return item === undefined ? [] : [item]
  })
}
