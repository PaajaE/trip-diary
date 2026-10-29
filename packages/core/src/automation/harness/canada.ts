import { canadaV1Media } from '../fixtures/canada-v1.ts'
import { scoreGrouping, type GroupingScore } from './metrics.ts'
import type { GroupingAlgorithm } from './properties.ts'
import type { HarnessPoint } from './scenarios.ts'

export interface CanadaReport extends GroupingScore {
  /** Distinct hand groups in the v1 ground truth. */
  expectedGroups: number
  predictedGroups: number
  /** Photos with `v1Entry === null`; ignored in the truth. */
  ungrouped: number
}

export function canadaPoints(): HarnessPoint[] {
  return canadaV1Media.map((item) => ({
    author: 'canada',
    capturedAt: item.capturedAt,
    device: 'unknown',
    id: item.id,
    kind: 'photo',
    latitude: item.latitude,
    longitude: item.longitude,
  }))
}

/** Hand grouping of the v1 entries as expected groups (null is dropped). */
export function canadaTruth(): { groups: string[][]; ungrouped: number } {
  const byEntry = new Map<string, string[]>()
  let ungrouped = 0
  for (const item of canadaV1Media) {
    if (item.v1Entry === null) {
      ungrouped += 1
      continue
    }
    byEntry.set(item.v1Entry, [...(byEntry.get(item.v1Entry) ?? []), item.id])
  }
  return { groups: [...byEntry.values()], ungrouped }
}

/** B-cubed F1 and edits per 100 photos of an algorithm against v1 truth. */
export function evaluateCanada(algorithm: GroupingAlgorithm): CanadaReport {
  const truth = canadaTruth()
  const predicted = algorithm(canadaPoints()).map((group) => group.ids)
  return {
    ...scoreGrouping(predicted, truth.groups),
    expectedGroups: truth.groups.length,
    predictedGroups: predicted.length,
    ungrouped: truth.ungrouped,
  }
}
