import {
  dhash,
  laplacianVariance,
  mediaQualitySchema,
  meanLuminance,
  rgbaToGray,
  type MediaQuality,
} from '@trip-diary/core/automation'

/** Longest side of the fixed analysis raster; hash and sharpness share it. */
export const ANALYSIS_LONGEST_EDGE = 256

export interface ImageDataLike {
  data: ArrayLike<number>
  height: number
  width: number
}

export interface ImageAnalysis {
  phash: number
  quality: MediaQuality
}

/** Target size for the analysis raster: longest side 256, aspect preserved, never upscaled. */
export function analysisSize(source: { height: number; width: number }): {
  height: number
  width: number
} {
  const longest = Math.max(source.width, source.height)
  if (longest <= ANALYSIS_LONGEST_EDGE) {
    return { height: source.height, width: source.width }
  }
  const scale = ANALYSIS_LONGEST_EDGE / longest
  return {
    height: Math.max(1, Math.round(source.height * scale)),
    width: Math.max(1, Math.round(source.width * scale)),
  }
}

/**
 * Pure analysis of an already downscaled RGBA raster (see analysisSize).
 * Never throws: any problem (bad input, NaN) yields null.
 */
export function analyzeImageData(image: ImageDataLike): ImageAnalysis | null {
  try {
    const gray = rgbaToGray(image.data, image.width, image.height)
    const phash = dhash(gray, image.width, image.height)
    const sharp =
      Math.round(laplacianVariance(gray, image.width, image.height) * 100) / 100
    const exposure = Math.round(meanLuminance(gray) * 1000) / 1000
    if (!Number.isSafeInteger(phash) || !Number.isFinite(sharp)) return null
    const quality = mediaQualitySchema.safeParse({ exposure, sharp, v: 1 })
    return quality.success ? { phash, quality: quality.data } : null
  } catch {
    return null
  }
}

/**
 * Thin canvas glue: decodes one already produced variant blob at the analysis
 * size and analyses it. Returns null on any failure.
 */
export async function analyzeImageBlob(
  blob: Blob,
): Promise<ImageAnalysis | null> {
  try {
    const bitmap = await createImageBitmap(blob)
    try {
      const size = analysisSize(bitmap)
      const canvas = document.createElement('canvas')
      canvas.width = size.width
      canvas.height = size.height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (context === null) return null
      context.drawImage(bitmap, 0, 0, size.width, size.height)
      return analyzeImageData(
        context.getImageData(0, 0, size.width, size.height),
      )
    } finally {
      bitmap.close()
    }
  } catch {
    return null
  }
}
