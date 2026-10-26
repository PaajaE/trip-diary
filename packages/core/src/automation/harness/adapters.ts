import type { MediaPoint } from '../media-point.ts'
import { clusterMoments } from '../moments.ts'
import type { PredictedGroup } from './properties.ts'

/**
 * Today's algorithm (`clusterMoments`) behind the harness interface. Later
 * algorithms plug in the same way: `(points) => PredictedGroup[]`.
 */
export function currentAlgorithm(
  points: readonly MediaPoint[],
): PredictedGroup[] {
  return clusterMoments(points).moments.map((moment) => ({
    anchorId: moment.anchorMediaId,
    ids: moment.mediaIds,
  }))
}
