import type { DaySummary } from './days.ts'
import { centroid, distanceKm, type GeoPoint } from './geo.ts'

export type SuggestedTripType = 'day' | 'trek' | 'transfer'

export interface TripSuggestion {
  /** Local dates covered by the trip, in order. */
  dates: string[]
  mediaIds: string[]
  reason: {
    /** Average straight-line shift between consecutive evenings. */
    avgDailyShiftKm: number
    daysAway: number
    maxDistanceFromBaseKm: number
  }
  tripType: SuggestedTripType
}

export interface TripSuggestionOptions {
  /** Evenings within this radius count as "at base". */
  baseRadiusKm?: number
  /** A day counts as a day trip when it gets this far from base. */
  dayTripKm?: number
  /** Multi-day runs moving less than this per day are treks, otherwise transfers. */
  trekMaxDailyShiftKm?: number
}

export interface TripSuggestionResult {
  /** Where the stay seems to be based, or null for a moving journey. */
  base: GeoPoint | null
  trips: TripSuggestion[]
}

const DEFAULTS = {
  baseRadiusKm: 8,
  dayTripKm: 12,
  trekMaxDailyShiftKm: 25,
} as const

/**
 * Finds the base of a stay: the place where most days end. Requires at least
 * two evenings there, otherwise the journey keeps moving and has no base.
 */
export function findBase(
  days: readonly DaySummary[],
  radiusKm: number = DEFAULTS.baseRadiusKm,
): GeoPoint | null {
  const evenings = days
    .map((day) => day.lastPoint)
    .filter((point): point is GeoPoint => point !== null)

  let best: GeoPoint[] = []
  for (const candidate of evenings) {
    const near = evenings.filter(
      (other) => distanceKm(candidate, other) <= radiusKm,
    )
    if (near.length > best.length) {
      best = near
    }
  }
  return best.length >= 2 ? centroid(best) : null
}

function classify(
  daysAway: number,
  avgDailyShiftKm: number,
  trekMaxDailyShiftKm: number,
): SuggestedTripType {
  if (daysAway === 1) {
    return 'day'
  }
  return avgDailyShiftKm <= trekMaxDailyShiftKm ? 'trek' : 'transfer'
}

function maxDistanceFrom(base: GeoPoint, day: DaySummary): number {
  return Math.max(0, ...day.points.map((point) => distanceKm(base, point)))
}

/**
 * Suggests trips inside one stage (pass that stage's days). Day trips leave the
 * base and return the same evening; multi-day runs end their days away from
 * base and are classified by how far they move per day.
 */
export function suggestTrips(
  days: readonly DaySummary[],
  options: TripSuggestionOptions = {},
): TripSuggestionResult {
  const baseRadiusKm = options.baseRadiusKm ?? DEFAULTS.baseRadiusKm
  const dayTripKm = options.dayTripKm ?? DEFAULTS.dayTripKm
  const trekMaxDailyShiftKm =
    options.trekMaxDailyShiftKm ?? DEFAULTS.trekMaxDailyShiftKm

  const base = findBase(days, baseRadiusKm)
  if (base === null) {
    return { base: null, trips: [] }
  }

  const located = days.filter((day) => day.lastPoint !== null)
  const trips: TripSuggestion[] = []
  let run: DaySummary[] = []

  const closeRun = () => {
    if (run.length === 0) {
      return
    }
    const evenings = run
      .map((day) => day.lastPoint)
      .filter((point): point is GeoPoint => point !== null)
    let shift = 0
    for (let index = 1; index < evenings.length; index += 1) {
      const previous = evenings[index - 1]
      const current = evenings[index]
      if (previous !== undefined && current !== undefined) {
        shift += distanceKm(previous, current)
      }
    }
    const avgDailyShiftKm =
      evenings.length > 1 ? shift / (evenings.length - 1) : 0
    trips.push({
      dates: run.map((day) => day.date),
      mediaIds: run.flatMap((day) => day.mediaIds),
      reason: {
        avgDailyShiftKm,
        daysAway: run.length,
        maxDistanceFromBaseKm: Math.max(
          ...run.map((day) => maxDistanceFrom(base, day)),
        ),
      },
      tripType: classify(run.length, avgDailyShiftKm, trekMaxDailyShiftKm),
    })
    run = []
  }

  for (const day of located) {
    const evening = day.lastPoint
    if (evening === null) {
      continue
    }
    const awayInEvening = distanceKm(base, evening) > baseRadiusKm
    if (awayInEvening) {
      run.push(day)
      continue
    }
    if (run.length > 0) {
      // The day you walk back to base still belongs to the trip.
      run.push(day)
      closeRun()
      continue
    }
    if (maxDistanceFrom(base, day) >= dayTripKm) {
      run.push(day)
      closeRun()
    }
  }
  closeRun()

  return { base, trips }
}
