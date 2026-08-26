export interface PhotoDimensions {
  height: number
  width: number
}

export interface NormalizedDimensionPlan extends PhotoDimensions {
  isPanorama: boolean
  maxLongestEdge: number
  maxPixels: number
}

/** Normal phone photos: longest edge cap. */
export const NORMAL_MAX_LONGEST_EDGE = 2560

/** Ultra-wide / panorama longest-edge allowance. */
export const PANORAMA_MAX_LONGEST_EDGE = 4096

/** Aspect ratio (long/short) at or above this is treated as panorama. */
export const PANORAMA_ASPECT_RATIO_THRESHOLD = 1.8

/** Soft pixel budget for normal photos (~8 MP). */
export const NORMAL_MAX_PIXELS = 8_000_000

/** Soft pixel budget for panoramas (~12 MP). */
export const PANORAMA_MAX_PIXELS = 12_000_000

export const MASTER_JPEG_QUALITY = 0.82

export const THUMB_MAX_LONGEST_EDGE = 800

export const THUMB_JPEG_QUALITY = 0.75

export function isPanoramaDimensions(width: number, height: number): boolean {
  const w = Math.max(1, Math.trunc(width))
  const h = Math.max(1, Math.trunc(height))
  const longEdge = Math.max(w, h)
  const shortEdge = Math.min(w, h)
  return longEdge / shortEdge >= PANORAMA_ASPECT_RATIO_THRESHOLD
}

/**
 * Scale so longest edge and total pixels stay within policy.
 * Never upscales. Preserves aspect ratio.
 */
export function resolveNormalizedDimensions(
  source: PhotoDimensions,
): NormalizedDimensionPlan {
  const width = Math.max(1, Math.trunc(source.width))
  const height = Math.max(1, Math.trunc(source.height))
  const panorama = isPanoramaDimensions(width, height)
  const maxLongestEdge = panorama
    ? PANORAMA_MAX_LONGEST_EDGE
    : NORMAL_MAX_LONGEST_EDGE
  const maxPixels = panorama ? PANORAMA_MAX_PIXELS : NORMAL_MAX_PIXELS

  let nextWidth = width
  let nextHeight = height
  const longest = Math.max(nextWidth, nextHeight)

  if (longest > maxLongestEdge) {
    const scale = maxLongestEdge / longest
    nextWidth = Math.max(1, Math.round(nextWidth * scale))
    nextHeight = Math.max(1, Math.round(nextHeight * scale))
  }

  const pixels = nextWidth * nextHeight
  if (pixels > maxPixels) {
    const scale = Math.sqrt(maxPixels / pixels)
    nextWidth = Math.max(1, Math.round(nextWidth * scale))
    nextHeight = Math.max(1, Math.round(nextHeight * scale))
  }

  return {
    height: nextHeight,
    isPanorama: panorama,
    maxLongestEdge,
    maxPixels,
    width: nextWidth,
  }
}

export function resolveThumbDimensions(source: PhotoDimensions): PhotoDimensions {
  const width = Math.max(1, Math.trunc(source.width))
  const height = Math.max(1, Math.trunc(source.height))
  const longest = Math.max(width, height)

  if (longest <= THUMB_MAX_LONGEST_EDGE) {
    return { height, width }
  }

  const scale = THUMB_MAX_LONGEST_EDGE / longest
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  }
}
