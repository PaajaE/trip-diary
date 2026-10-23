import type { PublicMedia } from '@trip-diary/core/public-journey'
import { hasImage } from '@/entities/public-journey/lib/media-url'

/**
 * Photos for a card mosaic: the cover first, then starred ones, then the
 * rest in capture order. Only media that has an image to show (a video needs
 * its poster); no duplicates.
 */
export function pickMosaicMedia(
  media: readonly PublicMedia[],
  coverId: string | null,
  count = 3,
): PublicMedia[] {
  const shown = media.filter(hasImage)
  const time = (item: PublicMedia) =>
    Date.parse(item.capturedAt ?? '') || Number.MAX_SAFE_INTEGER
  const rank = (item: PublicMedia) =>
    item.id === coverId ? 0 : item.starred ? 1 : 2
  return [...shown]
    .sort((a, b) => rank(a) - rank(b) || time(a) - time(b))
    .slice(0, count)
}
