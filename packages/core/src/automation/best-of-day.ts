import { hammingDistance, type MediaQuality } from './quality.ts'
import { EYES_CLOSED_PENALTY, exposurePenalty } from './series.ts'

export type BestOfDayReason =
  | 'coversTime'
  | 'starred'
  | 'video'
  | 'sharp'
  | 'variety'

export interface DayCandidate {
  capturedAt: string | null
  id: string
  kind: 'photo' | 'video'
  phash: number | null
  quality: MediaQuality | null
  starred: boolean
  /** Stop (moment) the media belongs to; at most `maxPerStop` per stop. */
  stopId: string | null
}

export interface BestOfDayOptions {
  /** How many to pick (default 4, spec: 3-6). Starred photos are always kept. */
  count?: number
  maxPerStop?: number
  /** Hamming distance (of 49 bits) below which two photos look alike. */
  similarBits?: number
}

export interface BestOfDayPick {
  id: string
  reasons: BestOfDayReason[]
}

export const BEST_OF_DAY_DEFAULT_COUNT = 4
export const BEST_OF_DAY_MAX_PER_STOP = 2
export const BEST_OF_DAY_SIMILAR_BITS = 10
/** Bonus for a pick from a third of the day not covered yet. */
export const BEST_OF_DAY_COVERAGE_BONUS = 0.4
export const BEST_OF_DAY_VIDEO_BONUS = 0.2
/** A look-alike of a pick keeps this share of its relevance (maximal marginal relevance). */
export const BEST_OF_DAY_SIMILAR_FACTOR = 0.2

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * 3-6 photos that tell the day (spec: best photos of the day). Greedy:
 * starred photos first (always kept, even beyond `count`), then repeatedly the
 * candidate with the best relevance, discounted when it looks like something
 * already picked, with a bonus when it covers a third of the day (by capture
 * time) nobody picked from yet, at most `maxPerStop` per stop. Deterministic;
 * ties by capture time, then id. Never hides anything: it only orders.
 */
export function pickBestOfDay(
  candidates: readonly DayCandidate[],
  options: BestOfDayOptions = {},
): BestOfDayPick[] {
  const count = options.count ?? BEST_OF_DAY_DEFAULT_COUNT
  const maxPerStop = options.maxPerStop ?? BEST_OF_DAY_MAX_PER_STOP
  const similarBits = options.similarBits ?? BEST_OF_DAY_SIMILAR_BITS

  const times = candidates.flatMap((c) =>
    c.capturedAt === null ? [] : [Date.parse(c.capturedAt)],
  )
  const first = times.length === 0 ? 0 : Math.min(...times)
  const span = times.length === 0 ? 0 : Math.max(...times) - first
  const third = (c: DayCandidate): number | null => {
    if (c.capturedAt === null || span === 0) return null
    return Math.min(
      2,
      Math.floor(((Date.parse(c.capturedAt) - first) / span) * 3),
    )
  }

  let maxSharp = 0
  for (const c of candidates) {
    if (c.quality !== null && c.quality.sharp > maxSharp)
      maxSharp = c.quality.sharp
  }
  const relevance = (c: DayCandidate): number => {
    const q = c.quality
    const sharp = q === null ? 0.5 : maxSharp > 0 ? q.sharp / maxSharp : 1
    return (
      sharp -
      (q?.eyesClosed === true ? EYES_CLOSED_PENALTY : 0) -
      exposurePenalty(q?.exposure) +
      (c.kind === 'video' ? BEST_OF_DAY_VIDEO_BONUS : 0)
    )
  }
  const at = (c: DayCandidate): number =>
    c.capturedAt === null ? Number.POSITIVE_INFINITY : Date.parse(c.capturedAt)

  const picks: { candidate: DayCandidate; reasons: BestOfDayReason[] }[] = []
  const perStop = new Map<string, number>()
  const coveredThirds = new Set<number>()
  const take = (c: DayCandidate, reasons: BestOfDayReason[]): void => {
    picks.push({ candidate: c, reasons })
    if (c.stopId !== null)
      perStop.set(c.stopId, (perStop.get(c.stopId) ?? 0) + 1)
    const t = third(c)
    if (t !== null) coveredThirds.add(t)
  }

  const taken = new Set<string>()
  const ordered = [...candidates].sort(
    (a, b) => at(a) - at(b) || compareIds(a.id, b.id),
  )
  for (const c of ordered) {
    if (c.starred && c.kind === 'photo') {
      take(c, ['starred'])
      taken.add(c.id)
    }
  }

  while (picks.length < count) {
    let best: {
      candidate: DayCandidate
      reasons: BestOfDayReason[]
      score: number
    } | null = null
    for (const c of ordered) {
      if (taken.has(c.id)) continue
      if (c.stopId !== null && (perStop.get(c.stopId) ?? 0) >= maxPerStop)
        continue
      let score = relevance(c)
      const reasons: BestOfDayReason[] = ['sharp']
      if (c.kind === 'video') reasons.push('video')
      const t = third(c)
      if (t !== null && !coveredThirds.has(t)) {
        score += BEST_OF_DAY_COVERAGE_BONUS
        reasons.push('coversTime')
      }
      const alike =
        c.phash !== null &&
        picks.some(
          (p) =>
            p.candidate.phash !== null &&
            hammingDistance(c.phash ?? 0, p.candidate.phash) <= similarBits,
        )
      if (alike) {
        score *= BEST_OF_DAY_SIMILAR_FACTOR
      } else if (picks.length > 0) {
        reasons.push('variety')
      }
      if (best === null || score > best.score)
        best = { candidate: c, reasons, score }
    }
    if (best === null) break
    take(best.candidate, best.reasons)
    taken.add(best.candidate.id)
  }
  return picks.map((p) => ({ id: p.candidate.id, reasons: p.reasons }))
}
