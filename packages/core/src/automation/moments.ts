import { centroid, distanceKm, type GeoPoint } from './geo.ts'
import { pointOf, sortDated, type MediaPoint } from './media-point.ts'

export interface MomentClusterOptions {
  /** Media that belong to locked (hand-curated) moments; never regrouped. */
  lockedMediaIds?: ReadonlySet<string>
  /** Start a new moment when consecutive photos are further apart in time. */
  maxGapMinutes?: number
  /** Start a new moment when consecutive located photos jump further. */
  maxStepKm?: number
}

export interface MomentCluster {
  /**
   * Earliest media of the cluster (ties broken by id). Deterministic, so a
   * re-run keeps attaching the same persisted moment to the same group.
   */
  anchorMediaId: string
  centroid: GeoPoint | null
  endsAt: string
  mediaIds: string[]
  startsAt: string
}

export interface MomentClusterResult {
  moments: MomentCluster[]
  /** Media without a usable capture time; the UI asks the user to place them. */
  undatedMediaIds: string[]
}

export const DEFAULT_MOMENT_GAP_MINUTES = 90
export const DEFAULT_MOMENT_STEP_KM = 1.5

/**
 * Groups media into moments: a sequence of photos close in time and space.
 * A new moment starts after a long pause or a big jump in position (e.g. a
 * drive). Photos without coordinates join by time only.
 */
export function clusterMoments(
  media: readonly MediaPoint[],
  options: MomentClusterOptions = {},
): MomentClusterResult {
  const maxGapMs =
    (options.maxGapMinutes ?? DEFAULT_MOMENT_GAP_MINUTES) * 60_000
  const maxStepKm = options.maxStepKm ?? DEFAULT_MOMENT_STEP_KM
  const locked = options.lockedMediaIds ?? new Set<string>()

  const { dated, undated } = sortDated(
    media.filter((item) => !locked.has(item.id)),
  )

  const moments: MomentCluster[] = []
  let current: typeof dated = []
  let lastTime = Number.NEGATIVE_INFINITY
  let lastPoint: GeoPoint | null = null

  const flush = () => {
    const first = current[0]
    const last = current[current.length - 1]
    if (first === undefined || last === undefined) {
      return
    }
    const points = current
      .map(pointOf)
      .filter((point): point is GeoPoint => point !== null)
    moments.push({
      anchorMediaId: first.id,
      centroid: centroid(points),
      endsAt: new Date(last.time).toISOString(),
      mediaIds: current.map((item) => item.id),
      startsAt: new Date(first.time).toISOString(),
    })
    current = []
    lastPoint = null
  }

  for (const item of dated) {
    const point = pointOf(item)
    const pause = item.time - lastTime > maxGapMs
    const jump =
      point !== null &&
      lastPoint !== null &&
      distanceKm(lastPoint, point) > maxStepKm
    if (current.length > 0 && (pause || jump)) {
      flush()
    }
    current.push(item)
    lastTime = item.time
    if (point !== null) {
      lastPoint = point
    }
  }
  flush()

  return {
    moments,
    undatedMediaIds: undated.map((item) => item.id),
  }
}
