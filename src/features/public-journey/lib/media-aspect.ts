import type { PublicMedia } from '@trip-diary/core/public-journey'

/**
 * Width / height a photo is shown with, 4:3 when unknown, clamped to
 * `min..max` so a panorama is cropped (never a low strip); the lightbox shows
 * it whole. Hero 4:3 to 16:9, tiles 3:4 to 16:9 (the plan's aspect rule).
 */
export function aspectOfMedia(
  media: Pick<PublicMedia, 'height' | 'width'>,
  min: number,
  max: number,
): number {
  if (media.width === null || media.height === null) return 4 / 3
  return Math.min(max, Math.max(min, media.width / media.height))
}

export const HERO_ASPECT = { max: 16 / 9, min: 4 / 3 } as const
export const TILE_ASPECT = { max: 16 / 9, min: 3 / 4 } as const
