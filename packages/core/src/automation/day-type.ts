import { confidenceFromMargin } from './confidence.ts'
import { distanceKm, type GeoPoint } from './geo.ts'

/** What kind of day it was; picks the short questions asked when writing. */
export type DayType = 'city' | 'stay' | 'transfer' | 'trip'

export interface DayTypeStop {
  /** Position of the stop (centre). */
  point: GeoPoint
  /** Time spent there, minutes. */
  minutes: number
}

export interface DayTypeInput {
  /** Base (where the previous night was) and where this night is. */
  baseStart: GeoPoint | null
  baseEnd: GeoPoint | null
  /** Located stops of the day in time order. */
  stops: readonly DayTypeStop[]
  /** The day was mostly walked (slower than ~8 km/h). */
  onFoot?: boolean
}

export interface DayTypeOptions {
  /** A move between bases above this is a transfer day (default 150 km). */
  transferKm?: number
  /** Farther than this from the base is a trip (default 15 km, 5 km on foot). */
  tripKm?: number
  tripOnFootKm?: number
  /** A day this share of time within `stayRadiusKm` of the base is a stay. */
  stayShare?: number
  stayRadiusKm?: number
  /** Many stops closer together than this make a city day. */
  cityStops?: number
  cityExtentKm?: number
}

export interface DayTypeResult {
  type: DayType
  /** 0-1, from the margin to the deciding threshold. */
  confidence: number
  reason:
    | 'BASE_CHANGED'
    | 'FAR_FROM_BASE_RETURNED'
    | 'MOSTLY_NEAR_BASE'
    | 'MANY_STOPS_CLOSE'
    | 'NO_DATA'
}

const DEFAULTS = {
  cityExtentKm: 6,
  cityStops: 6,
  stayRadiusKm: 5,
  stayShare: 0.7,
  transferKm: 150,
  tripKm: 15,
  tripOnFootKm: 5,
} as const

/**
 * Rules, not AI (spec: algorithm, sec. 14), checked in this order:
 * transfer (the base changed, or the night moved over `transferKm`), trip
 * (reached `tripKm` from the base, 5 km on foot, and came back), stay (at
 * least 70 % of the time within 5 km of the base), city (many stops in a short
 * distance). With no data: stay with confidence 0.5 so nothing is asked wrongly.
 */
export function classifyDayType(
  input: DayTypeInput,
  options: DayTypeOptions = {},
): DayTypeResult {
  const cfg = { ...DEFAULTS, ...options }
  const { baseStart, baseEnd, stops } = input
  if (baseStart !== null && baseEnd !== null) {
    const moved = distanceKm(baseStart, baseEnd)
    if (moved > cfg.transferKm) {
      return {
        confidence: confidenceFromMargin(moved, cfg.transferKm, cfg.transferKm),
        reason: 'BASE_CHANGED',
        type: 'transfer',
      }
    }
  }
  const base = baseStart ?? baseEnd
  if (base === null || stops.length === 0) {
    return { confidence: 0.5, reason: 'NO_DATA', type: 'stay' }
  }
  const tripKm = input.onFoot === true ? cfg.tripOnFootKm : cfg.tripKm
  const farthest = Math.max(...stops.map((s) => distanceKm(base, s.point)))
  const returned =
    baseEnd === null || distanceKm(baseEnd, base) <= cfg.stayRadiusKm
  if (farthest > tripKm && returned) {
    return {
      confidence: confidenceFromMargin(farthest, tripKm, tripKm),
      reason: 'FAR_FROM_BASE_RETURNED',
      type: 'trip',
    }
  }
  const total = stops.reduce((sum, s) => sum + Math.max(0, s.minutes), 0)
  const near = stops
    .filter((s) => distanceKm(base, s.point) <= cfg.stayRadiusKm)
    .reduce((sum, s) => sum + Math.max(0, s.minutes), 0)
  const share = total > 0 ? near / total : 0
  const extent = Math.max(
    0,
    ...stops.flatMap((a) => stops.map((b) => distanceKm(a.point, b.point))),
  )
  if (stops.length >= cfg.cityStops && extent <= cfg.cityExtentKm) {
    return {
      confidence: confidenceFromMargin(
        stops.length,
        cfg.cityStops - 1,
        cfg.cityStops,
      ),
      reason: 'MANY_STOPS_CLOSE',
      type: 'city',
    }
  }
  if (share >= cfg.stayShare) {
    return {
      confidence: confidenceFromMargin(share, cfg.stayShare, 0.3),
      reason: 'MOSTLY_NEAR_BASE',
      type: 'stay',
    }
  }
  if (farthest > tripKm) {
    // Went far and did not come back: the base is moving, a short transfer.
    return {
      confidence: confidenceFromMargin(farthest, tripKm, tripKm) * 0.8,
      reason: 'BASE_CHANGED',
      type: 'transfer',
    }
  }
  return {
    confidence: confidenceFromMargin(share, cfg.stayShare, 0.3),
    reason: 'MOSTLY_NEAR_BASE',
    type: 'stay',
  }
}
