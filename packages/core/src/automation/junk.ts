import type { MediaQuality } from './quality.ts'

/**
 * "Probably junk" candidates (spec: only reliable signals, a queue to confirm
 * in bulk, never an automatic action). Everything stays visible and nothing is
 * hidden or deleted here; this only names candidates and why.
 */
export type JunkReason =
  | 'blackFrame'
  | 'blownFrame'
  | 'pocketShot'
  | 'screenshot'
  | 'tiny'

export interface JunkInput {
  height: number | null
  id: string
  kind: 'photo' | 'video'
  latitude: number | null
  longitude: number | null
  quality: MediaQuality | null
  /** The author's ★ (or the OS favourite): never a candidate. */
  starred: boolean
  /**
   * OS "screenshot" flag. It exists at import time only (PhotoKit subtype);
   * it is not stored on `media` yet, so callers without it pass nothing.
   */
  screenshot?: boolean
  width: number | null
}

/** Mean luminance at or below 8/255 / at or above 247/255. */
export const JUNK_BLACK_MAX_EXPOSURE = 8 / 255
export const JUNK_BLOWN_MIN_EXPOSURE = 247 / 255
/** A frame is "flat" when its sharpness is below this share of the batch median. */
export const JUNK_FLAT_SHARP_SHARE = 0.05
/** Raw sharpness at or below this is flat whatever the batch (a blank frame). */
export const JUNK_FLAT_SHARP_ABSOLUTE = 1
/**
 * A pocket shot is dark, in the blurriest 5 % of the batch and also far below
 * the median (no entropy signal yet, so a merely soft night photo stays).
 */
export const JUNK_POCKET_MAX_EXPOSURE = 0.15
export const JUNK_POCKET_SHARP_PERCENTILE = 0.05
export const JUNK_POCKET_SHARP_SHARE = 0.15
/** Percentile and median need this many analysed photos to mean anything. */
export const JUNK_MIN_SAMPLE = 20
/** Longest side below this, without a position: a chat thumbnail, not a photo. */
export const JUNK_TINY_MAX_SIDE_PX = 500

function sortedSharp(items: readonly JunkInput[]): number[] {
  return items
    .flatMap((item) =>
      item.kind === 'photo' && item.quality !== null
        ? [item.quality.sharp]
        : [],
    )
    .sort((a, b) => a - b)
}

function quantile(sorted: readonly number[], q: number): number {
  const index = Math.min(sorted.length - 1, Math.floor(q * sorted.length))
  return sorted[index] ?? 0
}

/**
 * Candidates with their reasons, in input order. Videos and starred photos are
 * never candidates. Thresholds are defaults, UNVERIFIED on real photos.
 */
export function findJunkCandidates(
  items: readonly JunkInput[],
): { id: string; reasons: JunkReason[] }[] {
  const sharp = sortedSharp(items)
  const enoughSample = sharp.length >= JUNK_MIN_SAMPLE
  const flatBelow = enoughSample
    ? Math.max(
        JUNK_FLAT_SHARP_ABSOLUTE,
        quantile(sharp, 0.5) * JUNK_FLAT_SHARP_SHARE,
      )
    : JUNK_FLAT_SHARP_ABSOLUTE
  const blurryBelow = enoughSample
    ? Math.min(
        quantile(sharp, JUNK_POCKET_SHARP_PERCENTILE),
        quantile(sharp, 0.5) * JUNK_POCKET_SHARP_SHARE,
      )
    : null

  const result: { id: string; reasons: JunkReason[] }[] = []
  for (const item of items) {
    if (item.kind !== 'photo' || item.starred) continue
    const reasons: JunkReason[] = []
    if (item.screenshot === true) reasons.push('screenshot')
    const q = item.quality
    if (q !== null) {
      const flat = q.sharp <= flatBelow
      if (q.exposure !== undefined) {
        // A dark night sky has a low mean too; only a flat dark frame is black.
        if (q.exposure <= JUNK_BLACK_MAX_EXPOSURE && flat) {
          reasons.push('blackFrame')
        } else if (q.exposure >= JUNK_BLOWN_MIN_EXPOSURE && flat) {
          reasons.push('blownFrame')
        } else if (
          blurryBelow !== null &&
          q.exposure <= JUNK_POCKET_MAX_EXPOSURE &&
          q.sharp <= blurryBelow
        ) {
          reasons.push('pocketShot')
        }
      }
    }
    if (
      item.width !== null &&
      item.height !== null &&
      Math.max(item.width, item.height) < JUNK_TINY_MAX_SIDE_PX &&
      item.latitude === null &&
      item.longitude === null
    ) {
      reasons.push('tiny')
    }
    if (reasons.length > 0) result.push({ id: item.id, reasons })
  }
  return result
}
