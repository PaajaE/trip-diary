import { z } from 'zod'

/**
 * Per-photo quality signals computed on the client (UX-30/UX-31).
 * `sharp` is the raw Laplacian variance (see laplacianVariance), `exposure`
 * the mean luminance in [0, 1].
 */
export const mediaQualitySchema = z.object({
  v: z.literal(1),
  sharp: z.number().min(0),
  exposure: z.number().min(0).max(1).optional(),
  eyesClosed: z.boolean().optional(),
})

export type MediaQuality = z.infer<typeof mediaQualitySchema>

const HASH_COLS = 8
const HASH_ROWS = 7

function checkImage(
  length: number,
  width: number,
  height: number,
  what: string,
): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    length === 0
  ) {
    throw new RangeError(`${what}: empty image or invalid dimensions`)
  }
  if (length !== width * height) {
    throw new RangeError(
      `${what}: length ${String(length)} does not match ${String(width)}x${String(height)}`,
    )
  }
}

/**
 * 49-bit difference hash of a grayscale image.
 *
 * The image is box-averaged to 8 columns x 7 rows; for every row each pixel is
 * compared with its right neighbour (7 x 7 = 49 bits, bit set when left > right).
 *
 * IMPORTANT: the result is < 2^49, so it is a JS safe integer (< 2^53). It is
 * stored in a Postgres bigint and read back as a JS number without precision
 * loss. Do not widen it beyond 53 bits.
 *
 * Inputs smaller than 8x7 are handled by clamping the source ranges (cells
 * then repeat pixels). Throws RangeError on empty input or length mismatch.
 */
export function dhash(
  gray: ArrayLike<number>,
  width: number,
  height: number,
): number {
  checkImage(gray.length, width, height, 'dhash')
  const cells: number[] = []
  for (let cy = 0; cy < HASH_ROWS; cy += 1) {
    const y0 = Math.min(height - 1, Math.floor((cy * height) / HASH_ROWS))
    const y1 = Math.min(
      height,
      Math.max(y0 + 1, Math.floor(((cy + 1) * height) / HASH_ROWS)),
    )
    for (let cx = 0; cx < HASH_COLS; cx += 1) {
      const x0 = Math.min(width - 1, Math.floor((cx * width) / HASH_COLS))
      const x1 = Math.min(
        width,
        Math.max(x0 + 1, Math.floor(((cx + 1) * width) / HASH_COLS)),
      )
      let sum = 0
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          sum += gray[y * width + x] ?? 0
        }
      }
      cells.push(sum / ((y1 - y0) * (x1 - x0)))
    }
  }
  let hash = 0
  for (let row = 0; row < HASH_ROWS; row += 1) {
    for (let col = 0; col < HASH_COLS - 1; col += 1) {
      const left = cells[row * HASH_COLS + col] ?? 0
      const right = cells[row * HASH_COLS + col + 1] ?? 0
      // arithmetic instead of shifts: stays exact up to 2^53
      hash = hash * 2 + (left > right ? 1 : 0)
    }
  }
  return hash
}

function popcount32(value: number): number {
  let v = value >>> 0
  v -= (v >>> 1) & 0x55555555
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333)
  v = (v + (v >>> 4)) & 0x0f0f0f0f
  return Math.imul(v, 0x01010101) >>> 24
}

const TWO_32 = 2 ** 32

/**
 * Hamming distance of two non-negative integers below 2^53 (in practice the
 * 49-bit dhash). Split into 32-bit halves; no bitwise ops on the whole number.
 */
export function hammingDistance(a: number, b: number): number {
  const aHi = Math.floor(a / TWO_32)
  const bHi = Math.floor(b / TWO_32)
  const aLo = a - aHi * TWO_32
  const bLo = b - bHi * TWO_32
  return popcount32((aHi ^ bHi) >>> 0) + popcount32((aLo ^ bLo) >>> 0)
}

/**
 * Variance of the 4-neighbour Laplacian over interior pixels: the sharpness
 * measure (higher = sharper). Raw value; calibration against real photos
 * (resolution dependence, thresholds) is a later step and UNVERIFIED. Compare
 * only between photos downscaled to the same size. Returns 0 below 3x3.
 */
export function laplacianVariance(
  gray: ArrayLike<number>,
  width: number,
  height: number,
): number {
  checkImage(gray.length, width, height, 'laplacianVariance')
  if (width < 3 || height < 3) {
    return 0
  }
  let sum = 0
  let sumSq = 0
  let n = 0
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x
      const lap =
        (gray[i - width] ?? 0) +
        (gray[i + width] ?? 0) +
        (gray[i - 1] ?? 0) +
        (gray[i + 1] ?? 0) -
        4 * (gray[i] ?? 0)
      sum += lap
      sumSq += lap * lap
      n += 1
    }
  }
  const mean = sum / n
  return Math.max(0, sumSq / n - mean * mean)
}

/** Mean luminance in [0, 1] from 0..255 grayscale input (0 for empty input). */
export function meanLuminance(gray: ArrayLike<number>): number {
  if (gray.length === 0) {
    return 0
  }
  let sum = 0
  for (const value of Array.from(gray)) {
    sum += value
  }
  return Math.min(1, Math.max(0, sum / gray.length / 255))
}

/** RGBA (e.g. canvas ImageData.data) to grayscale, Rec. 601 luma. */
export function rgbaToGray(
  data: ArrayLike<number>,
  width: number,
  height: number,
): Uint8Array {
  if (data.length !== width * height * 4) {
    throw new RangeError(
      `rgbaToGray: length ${String(data.length)} does not match ${String(width)}x${String(height)}x4`,
    )
  }
  const out = new Uint8Array(width * height)
  for (let i = 0; i < out.length; i += 1) {
    const r = data[i * 4] ?? 0
    const g = data[i * 4 + 1] ?? 0
    const b = data[i * 4 + 2] ?? 0
    out[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
  }
  return out
}
