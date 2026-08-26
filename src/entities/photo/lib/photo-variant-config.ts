import {
  FULL_JPEG_QUALITY,
  PHOTO_VARIANT_POLICY,
  UPLOAD_PHOTO_VARIANTS,
  type CanonicalPhotoVariant,
} from '@trip-diary/utils'
import type { PhotoVariantKind } from '@/entities/photo/model/photo'

export interface PhotoVariantSizeConfig {
  kind: CanonicalPhotoVariant
  /** Longest-edge cap; `full` additionally applies normalized pixel limits. */
  maxLongestEdge: number
  quality: number
  useNormalizedFull: boolean
}

/** Canonical variants produced by local web processing for new uploads. */
export const LOCAL_PHOTO_VARIANT_SIZES: PhotoVariantSizeConfig[] = [
  {
    kind: 'thumb',
    maxLongestEdge: PHOTO_VARIANT_POLICY.thumb.maxLongestEdge,
    quality: PHOTO_VARIANT_POLICY.thumb.jpegQuality,
    useNormalizedFull: false,
  },
  {
    kind: 'small',
    maxLongestEdge: PHOTO_VARIANT_POLICY.small.maxLongestEdge,
    quality: PHOTO_VARIANT_POLICY.small.jpegQuality,
    useNormalizedFull: false,
  },
  {
    kind: 'medium',
    maxLongestEdge: PHOTO_VARIANT_POLICY.medium.maxLongestEdge,
    quality: PHOTO_VARIANT_POLICY.medium.jpegQuality,
    useNormalizedFull: false,
  },
  {
    kind: 'full',
    maxLongestEdge: PHOTO_VARIANT_POLICY.full.maxLongestEdge,
    quality: FULL_JPEG_QUALITY,
    useNormalizedFull: true,
  },
]

export const SYNC_PHOTO_VARIANT_KINDS = new Set<PhotoVariantKind>([
  ...UPLOAD_PHOTO_VARIANTS,
])
