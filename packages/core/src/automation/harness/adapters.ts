import type { MediaPoint } from '../media-point.ts'
import { clusterMoments } from '../moments.ts'
import { detectStops } from '../stays.ts'
import type { PredictedGroup } from './properties.ts'
import type { HarnessPoint } from './scenarios.ts'

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

/**
 * The ZS-3 algorithm (`detectStops`): streams by author and device, outlier
 * filter, location fill-in, smooth density, stays and points. Not yet wired
 * into the pipeline (ZS-4).
 */
export function newAlgorithm(
  points: readonly HarnessPoint[],
): PredictedGroup[] {
  return detectStops(
    points.map((point) => ({ ...point, ownerId: point.author })),
  ).stops.map((stop) => ({
    anchorId: stop.anchorMediaId,
    ids: stop.mediaIds,
  }))
}
