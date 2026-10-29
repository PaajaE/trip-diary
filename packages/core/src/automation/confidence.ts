/**
 * Confidence (0-1) and a reason code for every automatic decision (spec:
 * algorithm, sec. 12). The confidence comes from the margin to the decision
 * threshold: right at the threshold it is a coin flip (0.5), `scale` away from
 * it the decision is as sure as it gets (1). Pure and deterministic.
 */

/** At or above: applied automatically, visibly, with Undo. */
export const CONFIDENCE_AUTO_MIN = 0.85
/** Below: unplaced. From here up to the auto band: the review queue. */
export const CONFIDENCE_REVIEW_MIN = 0.5

export type ConfidenceBand = 'auto' | 'review' | 'unplaced'

export type ReasonCode =
  | 'BASE_HYSTERESIS'
  | 'DAY_BY_FALLBACK_4AM'
  | 'DAY_BY_NIGHT_GAP'
  | 'JUNK_BLACK_FRAME'
  | 'JUNK_BLOWN_FRAME'
  | 'JUNK_POCKET_SHOT'
  | 'JUNK_SCREENSHOT'
  | 'JUNK_TINY'
  | 'SERIES_BEST_SHARPEST'
  | 'SERIES_BEST_STARRED'
  | 'STAGE_BY_DISTANCE'
  | 'TIME_SKEW_CORRECTED'
  | 'TZ_FROM_GPS'
  | 'TZ_FROM_PREVIOUS'

/** The small shared shape every automatic decision carries. */
export interface Decision {
  /** 0-1, see `confidenceFromMargin`. */
  confidence: number
  code: ReasonCode
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * 0.5 at the threshold, rising linearly to 1 at `scale` away from it (either
 * side). A non-positive `scale` or a non-finite input gives 0.5 (no evidence).
 */
export function confidenceFromMargin(
  value: number,
  threshold: number,
  scale: number,
): number {
  if (!Number.isFinite(value) || !Number.isFinite(threshold) || !(scale > 0)) {
    return 0.5
  }
  return clamp01(0.5 + 0.5 * Math.min(1, Math.abs(value - threshold) / scale))
}

/** Several independent signals: the decision is only as sure as the weakest. */
export function combineConfidence(...values: readonly number[]): number {
  return values.length === 0 ? 0.5 : clamp01(Math.min(...values))
}

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= CONFIDENCE_AUTO_MIN) return 'auto'
  return confidence >= CONFIDENCE_REVIEW_MIN ? 'review' : 'unplaced'
}

/** Review queue order: least certain first, ties by id so the order is stable. */
export function reviewQueue<T extends { confidence: number; id: string }>(
  items: readonly T[],
): T[] {
  return items
    .filter((item) => confidenceBand(item.confidence) === 'review')
    .sort(
      (a, b) =>
        a.confidence - b.confidence || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
}
