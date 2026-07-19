import type {
  MomentPhotoMeta,
  MomentPhotoThumb,
} from '@/entities/photo/api/moment-photo-detail.repository'
import { MOMENT_PHOTO_PREVIEW_LIMIT } from '@/entities/photo/api/moment-photo-detail.repository'

export type MomentPhotoMosaicCount = 1 | 2 | 3 | 4 | 5

/**
 * Cover lives in the hero. Hidden count is only non-cover photos that are
 * not represented by a visible preview tile.
 */
export function countHiddenMomentPreviewPhotos(
  photos: readonly MomentPhotoMeta[],
  preview: readonly MomentPhotoThumb[],
): number {
  const visibleIds = new Set(
    preview.slice(0, MOMENT_PHOTO_PREVIEW_LIMIT).map((photo) => photo.id),
  )
  return photos.filter((photo) => !photo.isCover && !visibleIds.has(photo.id))
    .length
}

export function resolveMomentPhotoMosaicCount(
  previewCount: number,
): MomentPhotoMosaicCount {
  const clamped = Math.min(
    Math.max(previewCount, 1),
    MOMENT_PHOTO_PREVIEW_LIMIT,
  )
  return clamped as MomentPhotoMosaicCount
}

export function momentPhotoMosaicClassName(
  count: MomentPhotoMosaicCount,
): string {
  return `moment-photo-mosaic moment-photo-mosaic--${String(count)}`
}
