/**
 * How sure the automation can be about a stop (plan 4f: "Práce se řadí podle
 * jistoty"). Derived from the stored structure only (the planner's reasons
 * are not stored), with plain, documented heuristics. Used to ORDER the work
 * and to pick the stops that "deserve a look"; the UI never shows a score.
 */
import {
  centroid,
  distanceKm,
  type GeoPoint,
} from '@trip-diary/core/automation'

/** A stop of this many photos or fewer is a single point (pass-by or stop?). */
export const SINGLE_POINT_MAX_MEDIA = 1
/** A gap this long between two photos inside one stop. */
export const LONG_GAP_MS = 90 * 60_000
/** Photos this far (m) from the stop's centre: several places close together. */
export const SPREAD_M = 600
/** A ride ("Cestou") this close in time before or after the stop. */
export const NEAR_RIDE_MS = 20 * 60_000
/**
 * With a ride on one side only, a stop this small may be promoted from the
 * drive (a hotel before a day's drive is not questioned).
 */
export const NEAR_RIDE_MAX_MEDIA = 2
/** Another person's stop at the same time, at least this far away (km). */
export const PARALLEL_MIN_KM = 1

export type ConfidenceReason =
  /** One photo: the data cannot tell a stop from a pass-by. */
  | 'singlePoint'
  /** Inside a drive (rides on both sides, or a small stop next to one). */
  | 'nearRide'
  /** Another author was elsewhere at the same time (parallel stops). */
  | 'parallel'
  /** A long silence inside the stop: maybe two stops. */
  | 'longGap'
  /** The photos are spread out: maybe several places. */
  | 'spread'

export type ConfidenceLevel = 'confirmed' | 'high' | 'low' | 'medium'

export interface StopConfidence {
  level: ConfidenceLevel
  reasons: ConfidenceReason[]
}

export interface ConfidenceMedia {
  capturedAt: string | null
  latitude: number | null
  longitude: number | null
  ownerId: string
}

export interface ConfidenceStop {
  endsAt: string
  id: string
  kind: 'en_route' | 'point' | 'stay'
  /** Locked, manual or carrying the user's content. */
  confirmed: boolean
  media: readonly ConfidenceMedia[]
  startsAt: string
}

const STRONG: ReadonlySet<ConfidenceReason> = new Set([
  'longGap',
  'parallel',
  'singlePoint',
])

/** 0 = least sure; sorts the work (confirmed last). */
export function confidenceRank(level: ConfidenceLevel): number {
  switch (level) {
    case 'low':
      return 0
    case 'medium':
      return 1
    case 'high':
      return 2
    case 'confirmed':
      return 3
  }
}

function gpsOf(item: ConfidenceMedia): GeoPoint | null {
  return item.latitude === null || item.longitude === null
    ? null
    : { latitude: item.latitude, longitude: item.longitude }
}

function times(stop: ConfidenceStop): number[] {
  return stop.media
    .map((item) =>
      item.capturedAt === null ? NaN : Date.parse(item.capturedAt),
    )
    .filter((value) => !Number.isNaN(value))
    .sort((a, b) => a - b)
}

function centreOf(stop: ConfidenceStop): GeoPoint | null {
  return centroid(
    stop.media.map(gpsOf).filter((p): p is GeoPoint => p !== null),
  )
}

/**
 * Confidence of every stop of ONE day (stops in time order). Collapsed
 * 'en_route' groups and confirmed stops are not questioned.
 */
export function dayConfidence(
  stops: readonly ConfidenceStop[],
): Map<string, StopConfidence> {
  const out = new Map<string, StopConfidence>()
  const centres = new Map(stops.map((stop) => [stop.id, centreOf(stop)]))
  stops.forEach((stop, index) => {
    if (stop.confirmed) {
      out.set(stop.id, { level: 'confirmed', reasons: [] })
      return
    }
    if (stop.kind === 'en_route') {
      out.set(stop.id, { level: 'high', reasons: [] })
      return
    }
    const reasons: ConfidenceReason[] = []
    if (stop.media.length <= SINGLE_POINT_MAX_MEDIA) reasons.push('singlePoint')

    const start = Date.parse(stop.startsAt)
    const end = Date.parse(stop.endsAt)
    const rides = [stops[index - 1], stops[index + 1]].filter((other) => {
      if (other?.kind !== 'en_route') return false
      const gap =
        Date.parse(other.startsAt) > end
          ? Date.parse(other.startsAt) - end
          : start - Date.parse(other.endsAt)
      return gap <= NEAR_RIDE_MS
    }).length
    if (
      rides === 2 ||
      (rides === 1 && stop.media.length <= NEAR_RIDE_MAX_MEDIA)
    ) {
      reasons.push('nearRide')
    }

    const own = new Set(stop.media.map((item) => item.ownerId))
    const here = centres.get(stop.id) ?? null
    const parallel = stops.some((other) => {
      if (other.id === stop.id || other.kind === 'en_route') return false
      const overlaps =
        Date.parse(other.startsAt) <= end && start <= Date.parse(other.endsAt)
      if (!overlaps) return false
      if (other.media.some((item) => own.has(item.ownerId))) return false
      const there = centres.get(other.id) ?? null
      return (
        here === null ||
        there === null ||
        distanceKm(here, there) >= PARALLEL_MIN_KM
      )
    })
    if (parallel) reasons.push('parallel')

    const sorted = times(stop)
    for (let i = 1; i < sorted.length; i += 1) {
      const gap = (sorted[i] ?? 0) - (sorted[i - 1] ?? 0)
      if (gap > LONG_GAP_MS) {
        reasons.push('longGap')
        break
      }
    }

    if (here !== null) {
      const far = stop.media.some((item) => {
        const point = gpsOf(item)
        return point !== null && distanceKm(here, point) * 1000 > SPREAD_M
      })
      if (far) reasons.push('spread')
    }

    const level: ConfidenceLevel =
      reasons.length === 0
        ? 'high'
        : reasons.some((reason) => STRONG.has(reason))
          ? 'low'
          : 'medium'
    out.set(stop.id, { level, reasons })
  })
  return out
}
