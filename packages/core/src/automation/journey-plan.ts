import { distanceKm, type GeoPoint } from './geo.ts'
import {
  autoBeta,
  BASE_RADIUS_KM,
  DAY_TRIP_MIN_KM,
  daysBetween,
  findStayTrips,
  planStages,
  STAY_MIN_NIGHTS,
  stayBase,
  TREK_MAX_STEP_KM,
  type StageDay,
  type StageKind,
  type StageTripKind,
} from './stages.ts'

/**
 * Holistic journey planner (Atlas, step 2): one deterministic pass over all
 * located local days. Cuts the journey into stages (hard boundary at a long
 * photo gap), recognises multi-day treks (also whole stages that are a
 * trek) and tells a base stay with day trips from a trek. Place information
 * is optional; without it the planner falls back to geometry alone.
 */

/** What a resolved place is; `near` means "close to a settlement". */
export type PlaceKind =
  | 'settlement'
  | 'natural'
  | 'attraction'
  | 'near'
  | 'region'
  | 'country'

/** Photos of one local day that belong to one named place. */
export interface DayPlace {
  /** ISO 3166 country code of the place, when known. */
  country?: string | undefined
  kind: PlaceKind | undefined
  name: string
  photos: number
}

export interface JourneyDay extends StageDay {
  places: DayPlace[]
}

export type JourneyStageKind = StageKind | 'trek'

export interface JourneyTrip {
  awayKm: number
  days: JourneyDay[]
  kind: StageTripKind
}

export interface JourneyStage {
  centre: GeoPoint
  days: JourneyDay[]
  /** True when the next stage starts after a hard photo gap (or there is none). */
  gapAfter: boolean
  kind: JourneyStageKind
  radiusKm: number
  /** Short English diagnostic, not meant for the UI. */
  reason: string
  trips: JourneyTrip[]
}

export interface JourneyPlanOptions {
  /** Stage segmentation penalty; chosen automatically when omitted. */
  beta?: number
}

/** A photo gap of at least this many calendar days is a hard boundary. */
export const HARD_GAP_DAYS = 3
/** ...unless the journey returns to a base it slept at in this lookback. */
export const GAP_LOOKBACK_DAYS = 21
export const GAP_MIN_BASE_NIGHTS = 2
/** Share of natural places among informative photos for a trek. */
export const TREK_NATURAL_SHARE = 0.5
export const TREK_DAY_NATURAL_SHARE = 0.6
export const TREK_MIN_INFORMATIVE_PHOTOS = 5
export const TREK_DAY_MIN_INFORMATIVE_PHOTOS = 3
/** A trek stays within this radius of its own centre. */
export const TREK_MAX_RADIUS_KM = 40
/** A trek from a base spends a night at least this far from it. */
export const TREK_MIN_NIGHT_AWAY_KM = 12
/** More returns to one base than this are a base stay, not a trek. */
export const TREK_MAX_BASE_RETURNS = 2

/** A whole stage this short that is all nature is a trek, base or not. */
export const TREK_STAGE_MAX_DAYS = 6
/** Days of approach/departure this long are cut off a base stay. */
export const STAY_TRIM_MIN_DAYS = 3

const TREK_NAME_DAYS = /\(\s*(\d+)\s*-?\s*days?\s*\)/i

function isNatural(place: DayPlace): boolean {
  return place.kind === 'natural'
}

/** Region and country names say little about what the day was. */
function isInformative(place: DayPlace): boolean {
  return place.kind !== 'region' && place.kind !== 'country'
}

interface Share {
  informative: number
  natural: number
}

function shareOf(days: readonly JourneyDay[]): Share {
  const share: Share = { informative: 0, natural: 0 }
  for (const day of days) {
    for (const place of day.places) {
      if (!isInformative(place)) continue
      share.informative += place.photos
      if (isNatural(place)) share.natural += place.photos
    }
  }
  return share
}

function naturalEnough(
  share: Share,
  minShare: number,
  minPhotos: number,
): boolean {
  return (
    share.informative >= minPhotos &&
    share.natural / share.informative >= minShare
  )
}

function meanStepKm(days: readonly JourneyDay[]): number {
  let total = 0
  days.slice(1).forEach((day, index) => {
    const previous = days[index]
    if (previous !== undefined) total += distanceKm(previous.last, day.last)
  })
  return days.length < 2 ? 0 : total / (days.length - 1)
}

function maxStepKm(days: readonly JourneyDay[]): number {
  let max = 0
  days.slice(1).forEach((day, index) => {
    const previous = days[index]
    if (previous !== undefined) {
      max = Math.max(max, distanceKm(previous.last, day.last))
    }
  })
  return max
}

function radiusAround(days: readonly JourneyDay[]): number {
  if (days.length === 0) return 0
  const lat = days.reduce((sum, d) => sum + d.centre.latitude, 0) / days.length
  const lon = days.reduce((sum, d) => sum + d.centre.longitude, 0) / days.length
  const centre = { latitude: lat, longitude: lon }
  return Math.max(...days.map((d) => distanceKm(centre, d.centre)))
}

function farthestFrom(base: GeoPoint, days: readonly JourneyDay[]): number {
  return Math.max(
    0,
    ...days.flatMap((day) => day.points.map((p) => distanceKm(base, p))),
  )
}

// Hard gaps -------------------------------------------------------------------

/**
 * A long photo gap cuts the journey, except when the traveller comes back to
 * a base he slept at shortly before (a lazy week at a home base).
 */
function isHardGap(before: readonly JourneyDay[], after: JourneyDay): boolean {
  const last = before[before.length - 1]
  if (last === undefined) return false
  if (daysBetween(last.date, after.date) < HARD_GAP_DAYS) return false
  const nights = before.filter(
    (day) =>
      daysBetween(day.date, after.date) <= GAP_LOOKBACK_DAYS &&
      distanceKm(day.last, after.first) <= BASE_RADIUS_KM,
  ).length
  return nights < GAP_MIN_BASE_NIGHTS
}

/** Splits the days (sorted by date) at hard gaps. */
export function splitAtGaps(days: readonly JourneyDay[]): JourneyDay[][] {
  const runs: JourneyDay[][] = []
  for (const day of days) {
    const current = runs[runs.length - 1]
    if (current === undefined || isHardGap(current, day)) runs.push([day])
    else current.push(day)
  }
  return runs
}

// Trips -------------------------------------------------------------------------

/** Maximal runs of consecutive trek-like days (no base needed). */
function roamingTrips(days: readonly JourneyDay[]): JourneyTrip[] {
  const trips: JourneyTrip[] = []
  let run: JourneyDay[] = []
  const close = () => {
    if (run.length >= 2) {
      const away = radiusAround(run)
      if (maxStepKm(run) <= TREK_MAX_STEP_KM && away <= TREK_MAX_RADIUS_KM) {
        trips.push({ awayKm: Math.round(away), days: run, kind: 'trek' })
      }
    } else if (run.length === 1) {
      const only = run[0]
      // A trail that says how long it is ("(3days)") is a trek in itself.
      const hinted =
        only?.places.some((place) => {
          if (!isNatural(place)) return false
          const match = TREK_NAME_DAYS.exec(place.name)
          return match !== null && Number(match[1]) >= 2
        }) ?? false
      if (only !== undefined && hinted) {
        trips.push({ awayKm: 0, days: [only], kind: 'trek' })
      }
    }
    run = []
  }
  for (const day of days) {
    const previous = run[run.length - 1]
    const share = shareOf([day])
    const trekLike = naturalEnough(
      share,
      TREK_DAY_NATURAL_SHARE,
      TREK_DAY_MIN_INFORMATIVE_PHOTOS,
    )
    const hinted = day.places.some(
      (place) => isNatural(place) && TREK_NAME_DAYS.test(place.name),
    )
    if (!trekLike && !hinted) {
      close()
      continue
    }
    if (previous !== undefined && daysBetween(previous.date, day.date) > 1) {
      close()
    }
    run.push(day)
  }
  close()
  return trips
}

function dayTripsOf(
  days: readonly JourneyDay[],
  base: GeoPoint,
): JourneyTrip[] {
  return days
    .filter((day) => farthestFrom(base, [day]) >= DAY_TRIP_MIN_KM)
    .map((day) => ({
      awayKm: Math.round(farthestFrom(base, [day])),
      days: [day],
      kind: 'day' as const,
    }))
}

/** Trips of a base stay: day trips and treks that leave the base for nights. */
function stayTrips(days: readonly JourneyDay[], base: GeoPoint): JourneyTrip[] {
  const byDate = new Map(days.map((day) => [day.date, day]))
  const runs = findStayTrips(days, base).map((trip) => ({
    ...trip,
    days: trip.days.flatMap((day) => byDate.get(day.date) ?? []),
  }))
  // Many overnight absences from one base: a base stay, not treks.
  const returns = runs.filter((run) => run.days.length >= 2).length
  const out: JourneyTrip[] = []
  const firstDay = days[0]
  const lastDay = days[days.length - 1]
  const awayNight = (day: JourneyDay | undefined) =>
    day !== undefined && distanceKm(base, day.last) > BASE_RADIUS_KM
  for (const run of runs) {
    // Getting to and leaving the base is travel, not a trip from the base.
    const startsAtEdge = run.days[0] === firstDay && awayNight(firstDay)
    const endsAtEdge =
      run.days[run.days.length - 1] === lastDay && awayNight(lastDay)
    if (startsAtEdge || endsAtEdge) continue
    if (run.kind === 'day') {
      out.push({ awayKm: run.awayKm, days: run.days, kind: 'day' })
      continue
    }
    const share = shareOf(run.days)
    const natural = naturalEnough(
      share,
      TREK_NATURAL_SHARE,
      TREK_MIN_INFORMATIVE_PHOTOS,
    )
    const unknown = share.informative === 0
    // A night only a few km from the base is a long day trip, not a trek.
    const sleptAway = run.days.some(
      (day) => distanceKm(base, day.last) >= TREK_MIN_NIGHT_AWAY_KM,
    )
    const trek =
      sleptAway &&
      (natural ||
        (unknown && run.kind === 'trek' && returns <= TREK_MAX_BASE_RETURNS))
    if (trek) {
      out.push({ awayKm: run.awayKm, days: run.days, kind: 'trek' })
    } else {
      // Repeated visits from a base, not a trek: keep the day trips.
      out.push(...dayTripsOf(run.days, base))
    }
  }
  return out.sort((a, b) =>
    (a.days[0]?.date ?? '') < (b.days[0]?.date ?? '') ? -1 : 1,
  )
}

function nightsAt(days: readonly JourneyDay[], base: GeoPoint): number {
  return days.filter((day) => distanceKm(base, day.last) <= BASE_RADIUS_KM)
    .length
}

function isBaseStay(days: readonly JourneyDay[]): GeoPoint | null {
  const base = stayBase(days)
  if (base === null) return null
  return nightsAt(days, base) >= Math.max(STAY_MIN_NIGHTS, 0.5 * days.length)
    ? base
    : null
}

/**
 * Trips inside a set of days (a stage, a hand-made stage window or loose
 * days). A base stay gives day trips and treks from the base; otherwise only
 * runs of days spent in nature count as treks.
 */
export function findJourneyTrips(days: readonly JourneyDay[]): JourneyTrip[] {
  const base = isBaseStay(days)
  return base === null ? roamingTrips(days) : stayTrips(days, base)
}

// Stages ------------------------------------------------------------------------

function centreOf(days: readonly JourneyDay[]): GeoPoint {
  const count = Math.max(1, days.length)
  return {
    latitude: days.reduce((sum, d) => sum + d.centre.latitude, 0) / count,
    longitude: days.reduce((sum, d) => sum + d.centre.longitude, 0) / count,
  }
}

function toStage(
  days: JourneyDay[],
  kind: JourneyStageKind,
  reason: string,
): JourneyStage {
  const base = isBaseStay(days)
  const roaming = roamingTrips(days)
  const allNature =
    roaming.length === 1 &&
    roaming[0]?.days.length === days.length &&
    days.length >= 2
  const trek =
    allNature && (base === null || days.length <= TREK_STAGE_MAX_DAYS)
  const centre = centreOf(days)
  const radiusKm = radiusAround(days)
  if (trek) {
    return {
      centre,
      days,
      gapAfter: false,
      kind: 'trek',
      radiusKm,
      reason: `${String(days.length)} d in nature, ${String(Math.round(meanStepKm(days)))} km between nights on average`,
      trips: roaming,
    }
  }
  return {
    centre,
    days,
    gapAfter: false,
    kind,
    radiusKm,
    reason,
    trips: base === null ? roaming : stayTrips(days, base),
  }
}

/**
 * A base stay does not include the days of getting there or leaving: runs of
 * days before the first and after the last night at the base become stages
 * of their own.
 */
function trimmedParts(days: JourneyDay[]): {
  core: JourneyDay[]
  head: JourneyDay[]
  tail: JourneyDay[]
} | null {
  const base = isBaseStay(days)
  if (base === null) return null
  const home = (day: JourneyDay) => distanceKm(base, day.last) <= BASE_RADIUS_KM
  const firstHome = days.findIndex(home)
  const lastHome = days.length - 1 - [...days].reverse().findIndex(home)
  const head = firstHome >= STAY_TRIM_MIN_DAYS ? days.slice(0, firstHome) : []
  const tail =
    days.length - 1 - lastHome >= STAY_TRIM_MIN_DAYS
      ? days.slice(lastHome + 1)
      : []
  if (head.length === 0 && tail.length === 0) return null
  return {
    core: days.slice(head.length, days.length - tail.length),
    head,
    tail,
  }
}

function buildStages(
  days: readonly JourneyDay[],
  beta: number,
  byDate: ReadonlyMap<string, JourneyDay>,
  depth = 0,
): JourneyStage[] {
  return planStages(days, { beta }).flatMap((planned) => {
    const stageDays = planned.days.flatMap((day) => byDate.get(day.date) ?? [])
    const parts = depth < 2 ? trimmedParts(stageDays) : null
    if (parts === null)
      return [toStage(stageDays, planned.kind, planned.reason)]
    return [
      ...(parts.head.length > 0
        ? buildStages(parts.head, beta, byDate, depth + 1)
        : []),
      toStage(parts.core, planned.kind, planned.reason),
      ...(parts.tail.length > 0
        ? buildStages(parts.tail, beta, byDate, depth + 1)
        : []),
    ]
  })
}

/** A one-day stage is not merged into a neighbour farther away than this. */
export const MERGE_MAX_KM = 1000

/**
 * A one-day stage that is not a trek joins the stage it connects to: the
 * following one for a travel day, else the one with the closer night. A real
 * long-haul transfer (farther than MERGE_MAX_KM from both) stays on its own.
 */
function mergeSingleDays(stages: readonly JourneyStage[]): JourneyStage[] {
  const queue = [...stages]
  const out: JourneyStage[] = []
  while (queue.length > 0) {
    const stage = queue.shift()
    if (stage === undefined) break
    const only = stage.days[0]
    const next = queue[0]
    const previous = out[out.length - 1]
    if (
      only === undefined ||
      stage.days.length !== 1 ||
      stage.kind === 'trek' ||
      // a long-haul day (a flight) is a stage of its own
      distanceKm(only.first, only.last) > MERGE_MAX_KM
    ) {
      out.push(stage)
      continue
    }
    const nextFirst = next?.days[0]
    const toNext =
      next !== undefined && next.kind !== 'trek' && nextFirst !== undefined
        ? distanceKm(only.last, nextFirst.first)
        : Number.POSITIVE_INFINITY
    const prevLast = previous?.days[previous.days.length - 1]
    const toPrevious =
      previous !== undefined &&
      previous.kind !== 'trek' &&
      prevLast !== undefined
        ? distanceKm(prevLast.last, only.first)
        : Number.POSITIVE_INFINITY
    if (next !== undefined && toNext <= MERGE_MAX_KM) {
      queue[0] = toStage([...stage.days, ...next.days], next.kind, next.reason)
    } else if (previous !== undefined && toPrevious <= MERGE_MAX_KM) {
      out[out.length - 1] = toStage(
        [...previous.days, ...stage.days],
        previous.kind,
        previous.reason,
      )
    } else {
      out.push(stage)
    }
  }
  return out
}

/**
 * Plans the whole journey. `days` must be sorted by date and located. Hard
 * photo gaps end a stage, so no stage covers a long silence.
 */
export function planJourney(
  days: readonly JourneyDay[],
  options: JourneyPlanOptions = {},
): JourneyStage[] {
  if (days.length === 0) return []
  const beta = options.beta ?? autoBeta(days)
  const byDate = new Map(days.map((day) => [day.date, day]))
  const stages: JourneyStage[] = []
  for (const run of splitAtGaps(days)) {
    const built = mergeSingleDays(buildStages(run, beta, byDate))
    const lastStage = built[built.length - 1]
    if (lastStage !== undefined) lastStage.gapAfter = true
    stages.push(...built)
  }
  return stages
}
