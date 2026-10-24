import { hammingDistance, type MediaQuality } from './quality.ts'

export interface SeriesItem {
  id: string
  capturedAt: string | null
  phash: number | null
}

export interface SeriesOptions {
  /** Max time between consecutive shots of one series. Default 90 s. */
  maxGapMs?: number
  /** Max Hamming distance of consecutive dhashes (of 49 bits). Default 10. */
  maxHamming?: number
}

export const SERIES_MAX_GAP_MS = 90_000
export const SERIES_MAX_HAMMING = 10

/**
 * Groups of >= 2 similar photos taken in quick succession. Chain rule:
 * consecutive items (sorted by time, then id) join when the time gap and the
 * hash distance are both within limits. Items without time or hash are never
 * grouped. Deterministic and independent of input order.
 */
export function clusterSeries(
  items: readonly SeriesItem[],
  options: SeriesOptions = {},
): string[][] {
  const maxGapMs = options.maxGapMs ?? SERIES_MAX_GAP_MS
  const maxHamming = options.maxHamming ?? SERIES_MAX_HAMMING
  const usable: { id: string; at: number; phash: number }[] = []
  for (const item of items) {
    if (item.capturedAt === null || item.phash === null) {
      continue
    }
    const at = Date.parse(item.capturedAt)
    if (Number.isNaN(at)) {
      continue
    }
    usable.push({ at, id: item.id, phash: item.phash })
  }
  usable.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const groups: string[][] = []
  let current: typeof usable = []
  const flush = () => {
    if (current.length >= 2) {
      groups.push(current.map((c) => c.id))
    }
    current = []
  }
  for (const item of usable) {
    const prev = current[current.length - 1]
    if (
      prev !== undefined &&
      item.at - prev.at <= maxGapMs &&
      hammingDistance(prev.phash, item.phash) <= maxHamming
    ) {
      current.push(item)
    } else {
      flush()
      current = [item]
    }
  }
  flush()
  return groups
}

export type BestReason = 'sharpest' | 'eyesOpen' | 'goodExposure' | 'starred'

export interface BestCandidate {
  id: string
  capturedAt: string | null
  starred: boolean
  quality: MediaQuality | null
}

/** A starred photo wins over an unstarred one unless its relative sharpness is worse by more than this. */
export const STAR_BONUS = 0.15
/** Eyes-closed penalty; larger than the whole relative-sharpness range [0,1]. */
export const EYES_CLOSED_PENALTY = 1.5
/** Max exposure penalty (mild), reached at luminance 0 or 1. */
export const EXPOSURE_MAX_PENALTY = 0.3
/** Luminance within 0.5 +- this is not penalised. */
export const EXPOSURE_DEAD_ZONE = 0.2

/**
 * Exposure penalty: 0 inside [0.3, 0.7]; grows linearly to
 * EXPOSURE_MAX_PENALTY at luminance 0 or 1.
 */
function exposurePenalty(exposure: number | undefined): number {
  if (exposure === undefined) {
    return 0
  }
  const off = Math.max(0, Math.abs(exposure - 0.5) - EXPOSURE_DEAD_ZONE)
  return (off / (0.5 - EXPOSURE_DEAD_ZONE)) * EXPOSURE_MAX_PENALTY
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Best photo of a series. score = sharp / max(sharp in series)  (main signal)
 *   + STAR_BONUS if starred - EYES_CLOSED_PENALTY if eyesClosed
 *   - exposurePenalty. Candidates without quality rank after all with quality
 *   (stars still order them). Ties: earliest capturedAt (null last), then id.
 * `reasons` lists the signals that actually favoured the winner over others.
 */
export function recommendBest(
  candidates: readonly BestCandidate[],
): { id: string; reasons: BestReason[] } | null {
  if (candidates.length === 0) {
    return null
  }
  let maxSharp = 0
  for (const c of candidates) {
    if (c.quality !== null && c.quality.sharp > maxSharp) {
      maxSharp = c.quality.sharp
    }
  }
  const scored = candidates.map((c) => {
    const q = c.quality
    const rel = q === null ? 0 : maxSharp > 0 ? q.sharp / maxSharp : 1
    const score =
      rel +
      (c.starred ? STAR_BONUS : 0) -
      (q?.eyesClosed === true ? EYES_CLOSED_PENALTY : 0) -
      exposurePenalty(q?.exposure)
    const at = c.capturedAt === null ? NaN : Date.parse(c.capturedAt)
    return {
      c,
      rel,
      at: Number.isNaN(at) ? Number.POSITIVE_INFINITY : at,
      // quality-less candidates always rank last
      tier: q === null ? 0 : 1,
      score,
    }
  })
  scored.sort(
    (a, b) =>
      b.tier - a.tier ||
      b.score - a.score ||
      (a.at === b.at ? 0 : a.at < b.at ? -1 : 1) ||
      compareStrings(a.c.id, b.c.id),
  )
  const win = scored[0]
  if (win === undefined) {
    return null
  }
  const others = scored.slice(1)
  const reasons: BestReason[] = []
  const q = win.c.quality
  if (q !== null && others.some((o) => o.c.quality !== null) && win.rel === 1) {
    reasons.push('sharpest')
  }
  if (
    q?.eyesClosed === false &&
    others.some((o) => o.c.quality?.eyesClosed === true)
  ) {
    reasons.push('eyesOpen')
  }
  if (
    q?.exposure !== undefined &&
    exposurePenalty(q.exposure) === 0 &&
    others.some((o) => exposurePenalty(o.c.quality?.exposure) > 0)
  ) {
    reasons.push('goodExposure')
  }
  if (win.c.starred && others.some((o) => !o.c.starred)) {
    reasons.push('starred')
  }
  return { id: win.c.id, reasons }
}
