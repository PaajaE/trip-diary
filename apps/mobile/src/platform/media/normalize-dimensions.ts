/**
 * Mobile-facing re-exports of the shared photo variant dimension policy.
 * Prefer importing from `@trip-diary/utils` for new code.
 */
export {
  FULL_JPEG_QUALITY as MASTER_JPEG_QUALITY,
  FULL_MAX_LONGEST_EDGE as NORMAL_MAX_LONGEST_EDGE,
  FULL_MAX_PIXELS as NORMAL_MAX_PIXELS,
  FULL_PANORAMA_MAX_LONGEST_EDGE as PANORAMA_MAX_LONGEST_EDGE,
  FULL_PANORAMA_MAX_PIXELS as PANORAMA_MAX_PIXELS,
  isPanoramaDimensions,
  PANORAMA_ASPECT_RATIO_THRESHOLD,
  PHOTO_VARIANT_POLICY,
  resolveMediumDimensions,
  resolveNormalizedDimensions,
  resolveSmallDimensions,
  resolveThumbDimensions,
  resolveVariantDimensions,
  type NormalizedDimensionPlan,
  type PhotoDimensions,
} from '@trip-diary/utils'

/** @deprecated Use PHOTO_VARIANT_POLICY.thumb.maxLongestEdge */
export const THUMB_MAX_LONGEST_EDGE = 220

/** @deprecated Use PHOTO_VARIANT_POLICY.thumb.jpegQuality */
export const THUMB_JPEG_QUALITY = 0.72

/** @deprecated Use PHOTO_VARIANT_POLICY.small.maxLongestEdge */
export const SMALL_MAX_LONGEST_EDGE = 800

/** @deprecated Use PHOTO_VARIANT_POLICY.small.jpegQuality */
export const SMALL_JPEG_QUALITY = 0.75
