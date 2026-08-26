import {
  resolveNormalizedDimensions,
  resolveVariantDimensions,
} from '@trip-diary/utils'

export interface Dimensions {
  height: number
  width: number
}

/**
 * Scale by longest edge. Preserves aspect ratio; never upscales.
 * Prefer this over width-only resize for portrait and landscape alike.
 */
export function calculateDimensions(
  source: Dimensions,
  maxLongestEdge: number,
): Dimensions {
  return resolveVariantDimensions(source, maxLongestEdge)
}

/** Master/full variant dimensions (longest-edge + panorama pixel caps). */
export function calculateNormalizedFullDimensions(
  source: Dimensions,
): Dimensions {
  const plan = resolveNormalizedDimensions(source)
  return { height: plan.height, width: plan.width }
}
