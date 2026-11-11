/**
 * Sharpness of a picture as the variance of its Laplacian over a greyscale
 * copy (higher = sharper). Pure: takes RGBA pixels, so it is unit-testable.
 * Only meaningful for comparing pictures of the same series at the same size.
 */
export function laplacianVariance(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  if (width < 3 || height < 3) return 0
  const grey = new Float32Array(width * height)
  for (let i = 0; i < grey.length; i += 1) {
    const o = i * 4
    grey[i] =
      0.299 * (rgba[o] ?? 0) +
      0.587 * (rgba[o + 1] ?? 0) +
      0.114 * (rgba[o + 2] ?? 0)
  }
  let sum = 0
  let sumSquares = 0
  let count = 0
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x
      const value =
        4 * (grey[i] ?? 0) -
        (grey[i - 1] ?? 0) -
        (grey[i + 1] ?? 0) -
        (grey[i - width] ?? 0) -
        (grey[i + width] ?? 0)
      sum += value
      sumSquares += value * value
      count += 1
    }
  }
  const mean = sum / count
  return sumSquares / count - mean * mean
}

const SAMPLE_EDGE = 96

/** Loads a preview into a small canvas and scores it; null if unreadable. */
export async function measureSharpness(src: string): Promise<number | null> {
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = src
    await image.decode()
    const scale = Math.min(
      1,
      SAMPLE_EDGE / Math.max(image.naturalWidth, image.naturalHeight, 1),
    )
    const width = Math.max(3, Math.round(image.naturalWidth * scale))
    const height = Math.max(3, Math.round(image.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (context === null) return null
    context.drawImage(image, 0, 0, width, height)
    return laplacianVariance(
      context.getImageData(0, 0, width, height).data,
      width,
      height,
    )
  } catch {
    return null
  }
}
