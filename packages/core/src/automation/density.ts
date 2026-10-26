/**
 * ZS-3 smooth density. The time threshold of "the same visit" is not a fixed
 * number and there is no "sparse day" switch: it follows the median gap of
 * the nearby photos of one person (k x median, with a floor and a ceiling),
 * and the spatial radius slides with the same median gap.
 */

/** Photos on each side of a photo that make up its local window. */
export const DENSITY_WINDOW = 5
/** Time threshold = k x local median gap ... */
export const TIME_THRESHOLD_K = 4
/** ... but never below 10 min (burst, slow shooter) ... */
export const TIME_THRESHOLD_FLOOR_MS = 10 * 60_000
/** ... and never above 45 min (a longer silence needs a spatial reason). */
export const TIME_THRESHOLD_CEILING_MS = 45 * 60_000
/** Median gap up to this is fully dense (sparsity 0). */
export const SPARSE_FROM_MS = 6 * 60_000
/** Median gap from this on is fully sparse (sparsity 1). */
export const SPARSE_FULL_MS = 15 * 60_000

/** Median of the values (mean of the middle pair), null for no values. */
export function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const upper = sorted[middle]
  const lower = sorted[middle - 1]
  if (upper === undefined) return null
  return sorted.length % 2 === 1 || lower === undefined
    ? upper
    : (lower + upper) / 2
}

/**
 * Median gap between consecutive photos around `index` of an ascending list
 * of capture times (of one person, Live Photo clips excluded). Null when the
 * window holds no pair of photos.
 */
export function localMedianGapMs(
  times: readonly number[],
  index: number,
  halfWindow: number = DENSITY_WINDOW,
): number | null {
  const gaps: number[] = []
  const from = Math.max(0, index - halfWindow)
  const to = Math.min(times.length - 1, index + halfWindow)
  for (let at = from; at < to; at += 1) {
    const a = times[at]
    const b = times[at + 1]
    if (a !== undefined && b !== undefined) gaps.push(Math.max(0, b - a))
  }
  return medianOf(gaps)
}

/** k x median gap clamped to [floor, ceiling]; floor when unknown. */
export function timeThresholdMs(medianGapMs: number | null): number {
  if (medianGapMs === null) return TIME_THRESHOLD_FLOOR_MS
  return Math.min(
    TIME_THRESHOLD_CEILING_MS,
    Math.max(TIME_THRESHOLD_FLOOR_MS, TIME_THRESHOLD_K * medianGapMs),
  )
}

/**
 * 0 = dense (a photo every few minutes), 1 = sparse (every photo is a
 * deliberate evidence of presence). Linear in between, so the behaviour
 * changes gradually, not at one threshold. Unknown gap counts as sparse.
 */
export function sparsity(medianGapMs: number | null): number {
  if (medianGapMs === null) return 1
  const share =
    (medianGapMs - SPARSE_FROM_MS) / (SPARSE_FULL_MS - SPARSE_FROM_MS)
  return Math.min(1, Math.max(0, share))
}
