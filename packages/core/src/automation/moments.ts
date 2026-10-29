import { compareText } from './compare.ts'
import { centroid, distanceKm, type GeoPoint } from './geo.ts'
import {
  pointOf,
  sortDated,
  type DatedMediaPoint,
  type MediaPoint,
} from './media-point.ts'

/** A photo joins the moment when it follows within this gap ... */
export const MOMENT_QUICK_GAP_MINUTES = 15
/** ... and lies closer than this to the centre of the moment (or has no GPS). */
export const MOMENT_QUICK_RADIUS_KM = 3
/** A long stay (picnic, restaurant): a longer gap is fine while nobody moves. */
export const MOMENT_DWELL_GAP_MINUTES = 180
export const MOMENT_DWELL_RADIUS_KM = 0.6
/** Photos without GPS (on either side) join by time only up to this gap. */
export const MOMENT_NO_GPS_GAP_MINUTES = 30
/** Moments with fewer photos are merged into a neighbour when possible. */
export const MOMENT_MIN_PHOTOS = 3
export const MOMENT_MERGE_MAX_GAP_HOURS = 6
export const MOMENT_MERGE_MAX_DISTANCE_KM = 5

export interface MomentClusterOptions {
  /** Media that belong to locked (hand-curated) moments; never regrouped. */
  lockedMediaIds?: ReadonlySet<string>
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

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000

function locatedPoints(members: readonly DatedMediaPoint[]): GeoPoint[] {
  return members
    .map(pointOf)
    .filter((point): point is GeoPoint => point !== null)
}

function byTimeThenId(a: DatedMediaPoint, b: DatedMediaPoint): number {
  return a.time - b.time || compareText(a.id, b.id)
}

/** Dwell based: does the next photo still belong to the running moment? */
function joinsMoment(
  members: readonly DatedMediaPoint[],
  next: DatedMediaPoint,
): boolean {
  const lastMember = members[members.length - 1]
  if (lastMember === undefined) return false
  const gapMinutes = (next.time - lastMember.time) / MINUTE_MS
  const nextPoint = pointOf(next)
  const centre = centroid(locatedPoints(members))
  const distance =
    centre !== null && nextPoint !== null ? distanceKm(centre, nextPoint) : null
  return (
    (gapMinutes <= MOMENT_QUICK_GAP_MINUTES &&
      (distance === null || distance < MOMENT_QUICK_RADIUS_KM)) ||
    (gapMinutes <= MOMENT_DWELL_GAP_MINUTES &&
      distance !== null &&
      distance < MOMENT_DWELL_RADIUS_KM) ||
    (gapMinutes <= MOMENT_NO_GPS_GAP_MINUTES && distance === null)
  )
}

/** Index of the neighbour a small moment should merge into, or null. */
function mergeTarget(
  groups: readonly DatedMediaPoint[][],
  index: number,
): number | null {
  const group = groups[index]
  const firstOfGroup = group?.[0]
  const lastOfGroup = group?.[group.length - 1]
  if (
    group === undefined ||
    firstOfGroup === undefined ||
    lastOfGroup === undefined
  ) {
    return null
  }
  let best: { gap: number; index: number } | null = null
  for (const candidate of [index - 1, index + 1]) {
    const other = groups[candidate]
    const firstOther = other?.[0]
    const lastOther = other?.[other.length - 1]
    if (
      other === undefined ||
      firstOther === undefined ||
      lastOther === undefined
    ) {
      continue
    }
    const gapHours =
      Math.abs(
        candidate < index
          ? firstOfGroup.time - lastOther.time
          : firstOther.time - lastOfGroup.time,
      ) / HOUR_MS
    const a = centroid(locatedPoints(group))
    const b = centroid(locatedPoints(other))
    const distance = a !== null && b !== null ? distanceKm(a, b) : 0
    if (
      gapHours <= MOMENT_MERGE_MAX_GAP_HOURS &&
      distance <= MOMENT_MERGE_MAX_DISTANCE_KM &&
      (best === null || gapHours < best.gap)
    ) {
      best = { gap: gapHours, index: candidate }
    }
  }
  return best?.index ?? null
}

/**
 * Groups media into moments by dwelling: a photo joins the running moment
 * while the photographer stays about the same place (quick succession within
 * a few km, or a long stay within hundreds of metres); a drive or a long
 * pause starts a new one. Photos without coordinates join by time only.
 * Moments with fewer than three photos merge into the nearest neighbour.
 */
export function clusterMoments(
  media: readonly MediaPoint[],
  options: MomentClusterOptions = {},
): MomentClusterResult {
  const locked = options.lockedMediaIds ?? new Set<string>()
  const { dated, undated } = sortDated(
    media.filter((item) => !locked.has(item.id)),
  )

  const groups: DatedMediaPoint[][] = []
  for (const item of dated) {
    const current = groups[groups.length - 1]
    if (current !== undefined && joinsMoment(current, item)) {
      current.push(item)
    } else {
      groups.push([item])
    }
  }

  // Merge small moments; after a merge only the neighbourhood can change.
  let index = 0
  while (index < groups.length) {
    const group = groups[index]
    const target =
      group !== undefined && group.length < MOMENT_MIN_PHOTOS
        ? mergeTarget(groups, index)
        : null
    const targetGroup = target === null ? undefined : groups[target]
    if (group === undefined || target === null || targetGroup === undefined) {
      index += 1
      continue
    }
    groups[target] = [...targetGroup, ...group].sort(byTimeThenId)
    groups.splice(index, 1)
    index = Math.max(0, Math.min(index, target) - 3)
  }

  const moments: MomentCluster[] = []
  for (const members of groups) {
    const first = members[0]
    const last = members[members.length - 1]
    if (first === undefined || last === undefined) continue
    moments.push({
      anchorMediaId: first.id,
      centroid: centroid(locatedPoints(members)),
      endsAt: new Date(last.time).toISOString(),
      mediaIds: members.map((item) => item.id),
      startsAt: new Date(first.time).toISOString(),
    })
  }

  return {
    moments,
    undatedMediaIds: undated.map((item) => item.id),
  }
}
