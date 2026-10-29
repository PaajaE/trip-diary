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
 * The ZS-4 algorithm (`detectStops`): streams by author and device, outlier
 * filter, location fill-in, smooth density, stays, points, passing photos
 * collapsed into "en route" and in-day trips. The camera clock shifts are
 * used as a flagged HYPOTHESIS here (scenarios N and O are about exactly
 * that); the product pipeline does not apply them by default.
 */
export function newAlgorithm(
  points: readonly HarnessPoint[],
): PredictedGroup[] {
  return detectStops(
    points.map((point) => ({
      ...point,
      device: point.device,
      ownerId: point.author,
    })),
    { applyProposedClockShifts: true },
  ).stops.map((stop) => ({
    anchorId: stop.anchorMediaId,
    ids: stop.mediaIds,
    kind: stop.kind,
  }))
}
