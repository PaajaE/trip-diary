/**
 * ZS-0 metrics. A grouping is a list of groups, a group is a list of media
 * ids. Everything is pure and deterministic.
 */

export type Grouping = readonly (readonly string[])[]

export interface BCubed {
  f1: number
  precision: number
  recall: number
}

export interface GroupingScore {
  bcubed: BCubed
  /** splits + merges, see `scoreGrouping`. */
  edits: number
  editsPer100: number
  merges: number
  /** Number of expected photos that were scored. */
  photos: number
  splits: number
}

function indexGroups(groups: Grouping): Map<string, number> {
  const index = new Map<string, number>()
  groups.forEach((group, position) => {
    for (const id of group) index.set(id, position)
  })
  return index
}

function distinct(values: Iterable<number>): number {
  return new Set(values).size
}

/**
 * Scores `predicted` against `expected` over the photos of `expected` only
 * (photos in no expected group, e.g. transit or ungrouped, are ignored; a
 * predicted group is shrunk to the scored photos and dropped when empty).
 * An expected photo missing from the prediction counts as its own group.
 *
 * B-cubed, per photo i with P(i) the predicted and E(i) the expected group:
 * precision(i) = |P(i) n E(i)| / |P(i)|, recall(i) = |P(i) n E(i)| / |E(i)|;
 * both averaged over photos, F1 = harmonic mean of the two averages.
 *
 * Edits to truth (user work to fix the grouping by hand):
 *   splits = sum over expected groups of (distinct predicted groups it spans - 1)
 *   merges = sum over predicted groups of (distinct expected groups it covers - 1)
 *   edits  = splits + merges
 * It is an upper bound of the minimal split/merge count (exact when the
 * overlap graph is a forest, which holds for contiguous time groupings) and
 * it is 0 exactly when the groupings are equal. Reported per 100 photos.
 */
export function scoreGrouping(
  predicted: Grouping,
  expected: Grouping,
): GroupingScore {
  const expectedOf = indexGroups(expected)
  const scored = new Set(expectedOf.keys())
  const shrunk: string[][] = []
  const seen = new Set<string>()
  for (const group of predicted) {
    const kept = group.filter((id) => scored.has(id) && !seen.has(id))
    for (const id of kept) seen.add(id)
    if (kept.length > 0) shrunk.push(kept)
  }
  for (const id of scored) {
    if (!seen.has(id)) shrunk.push([id])
  }
  const predictedOf = indexGroups(shrunk)

  const photos = scored.size
  if (photos === 0) {
    return {
      bcubed: { f1: 1, precision: 1, recall: 1 },
      edits: 0,
      editsPer100: 0,
      merges: 0,
      photos,
      splits: 0,
    }
  }

  let precisionSum = 0
  let recallSum = 0
  for (const id of scored) {
    const predictedGroup = shrunk[predictedOf.get(id) ?? -1] ?? []
    const expectedGroup = expected[expectedOf.get(id) ?? -1] ?? []
    const expectedMembers = new Set(expectedGroup)
    const overlap = predictedGroup.filter((other) =>
      expectedMembers.has(other),
    ).length
    precisionSum += overlap / Math.max(1, predictedGroup.length)
    recallSum += overlap / Math.max(1, expectedGroup.length)
  }
  const precision = precisionSum / photos
  const recall = recallSum / photos
  const f1 =
    precision + recall === 0
      ? 0
      : (2 * precision * recall) / (precision + recall)

  let splits = 0
  for (const group of expected) {
    const spans = distinct(
      group.map((id) => predictedOf.get(id)).filter((v) => v !== undefined),
    )
    splits += Math.max(0, spans - 1)
  }
  let merges = 0
  for (const group of shrunk) {
    const covers = distinct(
      group.map((id) => expectedOf.get(id)).filter((v) => v !== undefined),
    )
    merges += Math.max(0, covers - 1)
  }
  const edits = splits + merges
  return {
    bcubed: { f1, precision, recall },
    edits,
    editsPer100: (edits / photos) * 100,
    merges,
    photos,
    splits,
  }
}

export interface TransitStats {
  /** Transit photos in a group collapsed as "en route" (not a stop). */
  collapsed: number
  /** Transit photos found in some predicted group that holds a stop photo. */
  absorbed: number
  /** Transit photos alone in their predicted group (a fake stop). */
  single: number
  /** single / transit, 0 when there is no transit photo. */
  singleShare: number
  /** Transit photos present in the prediction. */
  transit: number
}

/**
 * How the photos taken while moving were treated (single-photo stops).
 * `enRoute` lists the predicted groups that are collapsed "en route" stops
 * (kind en_route): such a group is by design not a stop, so a transit photo
 * alone in it is not a fake stop (it is counted in `collapsed`).
 */
export function transitStats(
  predicted: Grouping,
  transitIds: readonly string[],
  expected: Grouping,
  enRoute: Grouping = [],
): TransitStats {
  const transitSet = new Set(transitIds)
  const stopIds = new Set(expected.flat())
  const collapsedGroups = new Set(enRoute.map((group) => group.join('\u0000')))
  let transit = 0
  let single = 0
  let absorbed = 0
  let collapsed = 0
  for (const group of predicted) {
    const inGroup = group.filter((id) => transitSet.has(id)).length
    if (inGroup === 0) continue
    transit += inGroup
    if (collapsedGroups.has(group.join('\u0000'))) collapsed += inGroup
    else if (group.length === 1) single += 1
    else if (group.some((id) => stopIds.has(id))) absorbed += inGroup
  }
  return {
    absorbed,
    collapsed,
    single,
    singleShare: transit === 0 ? 0 : single / transit,
    transit,
  }
}

/** Live Photo pairs that ended up in different groups (or are missing). */
export function splitLivePairs(
  predicted: Grouping,
  pairs: readonly (readonly [string, string])[],
): number {
  const groupOf = indexGroups(predicted)
  return pairs.filter(([a, b]) => {
    const groupA = groupOf.get(a)
    return groupA === undefined || groupA !== groupOf.get(b)
  }).length
}

/**
 * Scenario pass: edits to truth within the tolerance (0 for all scenarios
 * except L, which accepts a few groups) and no single-photo stop made of
 * a transit photo. `absorbed` is reported but does not fail a scenario.
 */
export function scenarioPasses(
  score: GroupingScore,
  transit: TransitStats,
  toleranceEdits: number,
): boolean {
  return score.edits <= toleranceEdits && transit.single === 0
}
