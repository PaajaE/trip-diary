export interface Ratio {
  correct: number
  total: number
  /** correct / total; 1 for an empty set (nothing to get wrong). */
  rate: number
}

export interface F1Score {
  f1: number
  precision: number
  recall: number
}

function ratio(correct: number, total: number): Ratio {
  return { correct, rate: total === 0 ? 1 : correct / total, total }
}

/**
 * Share of media whose predicted local day equals the hand-labelled one.
 * Media the prediction did not place count as wrong.
 */
export function dayAssignmentAccuracy(
  predicted: Readonly<Record<string, string>>,
  truth: Readonly<Record<string, string>>,
): Ratio {
  const ids = Object.keys(truth)
  const correct = ids.filter((id) => predicted[id] === truth[id]).length
  return ratio(correct, ids.length)
}

function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000)
}

/**
 * Precision, recall and F1 of predicted stage start dates against the true
 * ones. A prediction matches a truth boundary within `toleranceDays`; every
 * truth boundary is matched at most once (closest first, greedy).
 */
export function boundaryF1(
  predicted: readonly string[],
  truth: readonly string[],
  toleranceDays: number,
): F1Score {
  const unmatched = new Set(truth.map(dayNumber))
  let hits = 0
  for (const start of predicted.map(dayNumber).sort((a, b) => a - b)) {
    let best: number | null = null
    for (const candidate of unmatched) {
      const distance = Math.abs(candidate - start)
      if (
        distance <= toleranceDays &&
        (best === null || distance < Math.abs(best - start))
      ) {
        best = candidate
      }
    }
    if (best !== null) {
      unmatched.delete(best)
      hits += 1
    }
  }
  const precision = predicted.length === 0 ? 1 : hits / predicted.length
  const recall = truth.length === 0 ? 1 : hits / truth.length
  const f1 =
    precision + recall === 0
      ? 0
      : (2 * precision * recall) / (precision + recall)
  return { f1, precision, recall }
}

function pairKeys(groups: readonly (readonly string[])[]): Set<string> {
  const keys = new Set<string>()
  for (const group of groups) {
    const sorted = [...group].sort()
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        keys.add(`${String(sorted[i])}|${String(sorted[j])}`)
      }
    }
  }
  return keys
}

/**
 * Pair-wise precision and recall of duplicate groups. Precision is the
 * number to watch: a wrong merge hides a photo, a miss only costs a click.
 */
export function duplicatePairScore(
  predicted: readonly (readonly string[])[],
  truth: readonly (readonly string[])[],
): { precision: Ratio; recall: Ratio } {
  const predictedPairs = pairKeys(predicted)
  const truthPairs = pairKeys(truth)
  let hits = 0
  for (const key of predictedPairs) {
    if (truthPairs.has(key)) hits += 1
  }
  return {
    precision: ratio(hits, predictedPairs.size),
    recall: ratio(hits, truthPairs.size),
  }
}

/**
 * Junk queue quality. `falsePositiveRate` is flagged-but-wanted photos over
 * all photos: a hidden good photo is the expensive mistake (target < 0.5 %).
 * `recall` is only informational; the queue is deliberately cautious.
 */
export function junkScore(
  flagged: readonly string[],
  truthJunk: readonly string[],
  totalPhotos: number,
): { falsePositiveRate: Ratio; recall: Ratio } {
  const junk = new Set(truthJunk)
  const falsePositives = flagged.filter((id) => !junk.has(id)).length
  const hits = flagged.filter((id) => junk.has(id)).length
  return {
    falsePositiveRate: {
      correct: falsePositives,
      rate: totalPhotos === 0 ? 0 : falsePositives / totalPhotos,
      total: totalPhotos,
    },
    recall: ratio(hits, junk.size),
  }
}
