/**
 * Pure choice of the compare partner. The partner is the photo captured
 * nearest in time to the main one, picked from a pool the caller has already
 * limited to the same series and without trashed photos.
 */
export interface Timed {
  id: string
  capturedAt: string | null
}

function instant(item: Timed): number | null {
  if (item.capturedAt === null) return null
  const ms = Date.parse(item.capturedAt)
  return Number.isNaN(ms) ? null : ms
}

/** The pool without the main photo, in capture order (undated last, stable). */
export function orderedCandidates<T extends Timed>(
  main: Timed,
  pool: readonly T[],
): T[] {
  return pool
    .filter((item) => item.id !== main.id)
    .map((item, index) => ({ index, item, at: instant(item) }))
    .sort((x, y) => {
      if (x.at === null || y.at === null) {
        if (x.at === y.at) return x.index - y.index
        return x.at === null ? 1 : -1
      }
      return x.at - y.at || x.index - y.index
    })
    .map((entry) => entry.item)
}

/** Nearest in time to `main`; ties go to the earlier photo; undated: the first. */
export function nearestInTime<T extends Timed>(
  main: Timed,
  candidates: readonly T[],
): T | undefined {
  const base = instant(main)
  if (base === null) return candidates[0]
  let best: T | undefined
  let bestGap = Infinity
  for (const candidate of candidates) {
    const at = instant(candidate)
    if (at === null) continue
    const gap = Math.abs(at - base)
    if (gap < bestGap) {
      best = candidate
      bestGap = gap
    }
  }
  return best ?? candidates[0]
}

/** The neighbour of `currentId` in `candidates`, wrapping around. */
export function stepPartner<T extends Timed>(
  candidates: readonly T[],
  currentId: string | undefined,
  delta: 1 | -1,
): T | undefined {
  if (candidates.length === 0) return undefined
  const at = candidates.findIndex((item) => item.id === currentId)
  const next =
    at === -1
      ? delta === 1
        ? 0
        : candidates.length - 1
      : (at + delta + candidates.length) % candidates.length
  return candidates[next]
}
