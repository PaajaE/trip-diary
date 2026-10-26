/**
 * ZS-4 gap classification. The segment between two stays (not a pair of
 * photos) is classified from distance, time, speed, altitude change, the kind
 * of the place (nature or city) and the neighbouring segments into walk,
 * bike, vehicle or an unknown transit, with a confidence. Deterministic rules
 * with soft memberships; no learned model (the scenarios and Canada do not
 * need one). Long gaps (a car with a photo after 2 h, a traffic jam) must not
 * look like cycling: the trust in a low speed falls with the length of the
 * gap, and a low confidence gives the unknown `transit`.
 */

export type MovementMode = 'bike' | 'transit' | 'vehicle' | 'walk'

/** The mode of a classified segment, `transit` = unknown movement. */
export interface GapClass {
  /** 0..1, how sure the mode is; below `GAP_MIN_CONFIDENCE` it is `transit`. */
  confidence: number
  mode: MovementMode
  /** Short English diagnostic for developers, not UI text. */
  reason: string
  scores: { bike: number; vehicle: number; walk: number }
  speedKmh: number
}

export interface GapFeatures {
  /** Absolute altitude change over the segment (m), null when unknown. */
  altitudeChangeM: number | null
  /** Straight (or summed path) distance in metres. */
  distanceM: number
  durationMs: number
  /** What the places along the segment say; null when nothing is known. */
  environment: 'city' | 'nature' | null
  /** Neighbouring segments (already classified), when they exist. */
  next: GapClass | null
  previous: GapClass | null
}

/** Below this distance the photographer did not move: no transit. */
export const GAP_MIN_DISTANCE_M = 150
/** A mode needs at least this confidence, otherwise `transit` (unknown). */
export const GAP_MIN_CONFIDENCE = 0.45
/** Speed bands (km/h): 0 below a, 1 from b to c, 0 again from d. */
export const WALK_BAND = [0.5, 1.5, 6.5, 9.5] as const
export const BIKE_BAND = [7, 12, 26, 40] as const
/** Vehicle: 0 at the first value, 1 at the second and above. */
export const VEHICLE_RAMP = [18, 55] as const
/** The low speed of a gap is a lower bound; trust falls with its length. */
export const TRUST_FULL_MS = 30 * 60_000
export const TRUST_FLOOR = 0.25
export const TRUST_FLOOR_MS = 120 * 60_000
/** Distance (m) up to which a mode is plausible in one gap, and the end. */
const WALK_DISTANCE_M = [10_000, 30_000] as const
const BIKE_DISTANCE_M = [60_000, 130_000] as const
/** A climb of at least this (m) at walking speed is a hike. */
const CLIMB_M = 200
/** A traffic jam: slow stretch of at least this length between vehicles. */
const JAM_MIN_DISTANCE_M = 1500
const JAM_MIN_SPEED_KMH = 4

function band(
  value: number,
  [a, b, c, d]: readonly [number, number, number, number],
): number {
  if (value <= a || value >= d) return 0
  if (value < b) return (value - a) / (b - a)
  if (value <= c) return 1
  return (d - value) / (d - c)
}

function ramp(value: number, [a, b]: readonly [number, number]): number {
  return Math.min(1, Math.max(0, (value - a) / (b - a)))
}

/** 1 up to `from`, falling linearly to 0 at `to`. */
function allowance(value: number, [from, to]: readonly [number, number]) {
  return 1 - ramp(value, [from, to])
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function trust(durationMs: number): number {
  if (durationMs <= TRUST_FULL_MS) return 1
  const share = Math.min(
    1,
    (durationMs - TRUST_FULL_MS) / (TRUST_FLOOR_MS - TRUST_FULL_MS),
  )
  return 1 - share * (1 - TRUST_FLOOR)
}

function describe(mode: MovementMode, features: GapFeatures, speed: number) {
  const km = features.distanceM / 1000
  const minutes = Math.round(features.durationMs / 60_000)
  return `${mode}: ${speed.toFixed(1)} km/h over ${km.toFixed(1)} km in ${String(minutes)} min`
}

const NONE: GapClass['scores'] = { bike: 0, vehicle: 0, walk: 0 }

/**
 * First pass: the segment on its own (speed, distance, trust in the speed,
 * altitude, environment). Neighbours are used by `refineWithNeighbours`.
 */
export function classifyGap(features: GapFeatures): GapClass {
  const speed =
    features.distanceM / 1000 / (Math.max(features.durationMs, 60_000) / 3.6e6)
  if (features.distanceM < GAP_MIN_DISTANCE_M) {
    return {
      confidence: 0,
      mode: 'transit',
      reason: `transit: ${String(Math.round(features.distanceM))} m, hardly any movement`,
      scores: NONE,
      speedKmh: round(speed),
    }
  }
  const reliable = trust(features.durationMs)
  let walk =
    band(speed, WALK_BAND) *
    allowance(features.distanceM, WALK_DISTANCE_M) *
    reliable
  const bike =
    band(speed, BIKE_BAND) *
    allowance(features.distanceM, BIKE_DISTANCE_M) *
    reliable
  let vehicle = ramp(speed, VEHICLE_RAMP)
  const climb = features.altitudeChangeM ?? 0
  if (speed <= WALK_BAND[3]) {
    if (features.environment === 'nature') walk = Math.min(1, walk * 1.15)
    if (climb >= CLIMB_M) {
      walk = Math.min(1, walk + 0.2)
      vehicle *= 0.5
    }
  }
  if (
    features.environment === 'city' &&
    speed >= 15 &&
    speed < VEHICLE_RAMP[1]
  ) {
    vehicle = Math.min(1, vehicle + 0.1)
  }
  const ranked = (
    [
      ['walk', walk],
      ['bike', bike],
      ['vehicle', vehicle],
    ] as const
  )
    .slice()
    .sort((a, b) => b[1] - a[1])
  const best = ranked[0]
  const second = ranked[1]
  const top = best?.[1] ?? 0
  const confidence = Math.max(0, top - 0.5 * (second?.[1] ?? 0))
  const scores = {
    bike: round(bike),
    vehicle: round(vehicle),
    walk: round(walk),
  }
  const mode: MovementMode =
    best !== undefined && confidence >= GAP_MIN_CONFIDENCE ? best[0] : 'transit'
  return {
    confidence: round(confidence),
    mode,
    reason:
      mode === 'transit'
        ? `transit: unclear at ${speed.toFixed(1)} km/h over ${(features.distanceM / 1000).toFixed(1)} km in ${String(Math.round(features.durationMs / 60_000))} min`
        : describe(mode, features, speed),
    scores,
    speedKmh: round(speed),
  }
}

/**
 * Second pass, using the neighbouring segments (first-pass results, so the
 * outcome does not cascade):
 *  - a slow stretch between vehicle segments is traffic, not cycling;
 *  - an unclear segment between two segments of one mode continues them.
 */
export function refineWithNeighbours(
  features: GapFeatures,
  own: GapClass,
): GapClass {
  const { next, previous } = features
  const neighbours = [previous, next].filter(
    (item): item is GapClass => item !== null,
  )
  if (neighbours.length === 0) return own
  if (
    own.mode !== 'vehicle' &&
    own.mode !== 'walk' &&
    features.distanceM >= JAM_MIN_DISTANCE_M &&
    own.speedKmh >= JAM_MIN_SPEED_KMH &&
    neighbours.every(
      (item) => item.mode === 'vehicle' && item.confidence >= 0.7,
    )
  ) {
    return {
      ...own,
      confidence: Math.min(0.6, ...neighbours.map((item) => item.confidence)),
      mode: 'vehicle',
      reason: `vehicle: slow ${own.speedKmh.toFixed(1)} km/h stretch between vehicle segments (traffic?)`,
    }
  }
  if (
    own.mode === 'transit' &&
    features.distanceM >= GAP_MIN_DISTANCE_M &&
    previous !== null &&
    next !== null &&
    previous.mode === next.mode &&
    previous.mode !== 'transit' &&
    previous.confidence >= 0.6 &&
    next.confidence >= 0.6
  ) {
    return {
      ...own,
      confidence: 0.55,
      mode: previous.mode,
      reason: `${previous.mode}: unclear ${own.speedKmh.toFixed(1)} km/h segment between two ${previous.mode} segments`,
    }
  }
  return own
}
