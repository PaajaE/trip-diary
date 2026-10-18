import { centroid, distanceKm, type GeoPoint } from './geo.ts'

/**
 * Smart stage organiser. Works on located local days and cuts the journey
 * into stages with a kind (stay, region, detour, ...) and the trips that
 * happen inside a stay. Pure and deterministic: the same days always give
 * the same stages.
 */

/** A located local day; a day without GPS never takes part in staging. */
export interface StageDay {
  centre: GeoPoint
  /** Local calendar date (YYYY-MM-DD). */
  date: string
  /** Where the day started and where it ended ("the night"). */
  first: GeoPoint
  last: GeoPoint
  mediaIds: string[]
  /** Number of located photos of the day. */
  photoCount: number
  /** Located photos in capture order. */
  points: GeoPoint[]
  /** IANA zone of the day; a change between days makes a cheaper boundary. */
  timeZone: string
}

export type StageKind =
  | 'stay'
  | 'region'
  | 'detour'
  | 'arrival'
  | 'transfer'
  | 'stop'
  | 'remoteStop'

export type StageTripKind = 'day' | 'trek' | 'multiDay'

export interface StageTrip {
  /** Furthest distance from the base (or the stage centre), rounded. */
  awayKm: number
  days: StageDay[]
  kind: StageTripKind
}

export interface StagePlace {
  centre: GeoPoint
  days: StageDay[]
  photoCount: number
}

export interface PlannedStage {
  centre: GeoPoint
  days: StageDay[]
  kind: StageKind
  /** Places visited inside a region stage (informative, not persisted). */
  places: StagePlace[]
  radiusKm: number
  /** Short English diagnostic, not meant for the UI. */
  reason: string
  /** Trips inside the stage (day trips, treks, multi-day trips). */
  trips: StageTrip[]
}

export interface StagePlanOptions {
  /** Segmentation penalty; chosen automatically when omitted. */
  beta?: number
}

// Partition (dynamic programming) ------------------------------------------
export const PARTITION_WINDOW_DAYS = 80
export const BETA_GRID_START_EXPONENT = 3.7
export const BETA_GRID_STEP = 0.12
export const BETA_GRID_SIZE = 26
export const BETA_MIN_SEGMENT_LIMIT = 3
export const BETA_DAYS_PER_SEGMENT = 7
export const ZONE_CHANGE_BONUS = 0.4
export const GAP_MOVE_BONUS = 0.3
export const GAP_MOVE_MIN_DAYS = 3
export const GAP_MOVE_MIN_KM = 25
export const JUMP_BONUS_KM = 150
export const JUMP_BONUS = 0.3
export const LONG_JUMP_BONUS_KM = 600
export const LONG_JUMP_BONUS = 0.5

// Spikes and silences --------------------------------------------------------
export const SPIKE_MIN_KM = 150
export const SPIKE_NEIGHBOURS_RATIO = 0.5
export const SILENCE_SPLIT_DAYS = 7
export const SILENCE_SPLIT_MIN_KM = 25

// Detours (local excursions folded into the surrounding stay/region) ----------
export const DETOUR_MAX_STAGE_DAYS = 10
export const DETOUR_MAX_DAYS = 7
export const DETOUR_MAX_RETURN_GAP_DAYS = 7
export const DETOUR_MIN_KM = 12
export const DETOUR_MAX_KM = 100
export const DETOUR_RETURN_MIN_KM = 40
export const DETOUR_RETURN_RATIO = 0.5

// Regions, stays, gateways ----------------------------------------------------
export const REGION_MAX_DISTANCE_KM = 220
export const REGION_MAX_GAP_DAYS = 7
export const BASE_RADIUS_KM = 8
export const STAY_LIKE_MIN_NIGHTS = 4
export const STAY_LIKE_NIGHTS_RATIO = 0.5
export const GATEWAY_MIN_DAYS = 4
export const GATEWAY_ARRIVAL_KM = 600
export const GATEWAY_REST_KM = 100
export const GATEWAY_MIN_PHOTOS = 10
export const GATEWAY_MAX_DAYS = 2
export const TRIM_MIN_DAYS = 3
export const TRIM_MIN_BASE_NIGHTS = 3
export const TRIM_AWAY_KM = 25

// Kinds -----------------------------------------------------------------------
export const DETOUR_KIND_MIN_KM = 100
export const REMOTE_STOP_MAX_DAYS = 2
export const REMOTE_STOP_MIN_KM = 150
export const FAR_PLACE_KM = 600
export const STAY_MIN_NIGHTS = 3
export const STAY_NIGHTS_RATIO = 0.5
export const SHORT_STAGE_MAX_DAYS = 3
export const SHORT_TRANSFER_MIN_STEP_KM = 40
export const LONG_TRANSFER_MIN_STEP_KM = 80

// Trips inside a stay ---------------------------------------------------------
export const DAY_TRIP_MIN_KM = 12
export const TREK_MAX_STEP_KM = 25
export const TREK_MAX_AWAY_KM = 80

// Places inside a region ---------------------------------------------------------
export const PLACE_MIN_DAYS = 3
export const PLACE_JOIN_KM = 25
export const PLACE_TINY_MAX_PHOTOS = 5

const DAY_MS = 86_400_000

/** Whole calendar days between two YYYY-MM-DD dates. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS,
  )
}

function meanCentre(days: readonly StageDay[]): GeoPoint {
  const centre = centroid(days.map((day) => day.centre))
  // Stages are never empty; the fallback only satisfies the type.
  return centre ?? { latitude: 0, longitude: 0 }
}

function radiusOf(centre: GeoPoint, days: readonly StageDay[]): number {
  return Math.max(0, ...days.map((day) => distanceKm(centre, day.centre)))
}

/**
 * Where the nights of a stay cluster: the centre of the largest group of
 * evenings within `radiusKm` of each other (at least two), or null.
 */
export function stayBase(
  days: readonly StageDay[],
  radiusKm: number = BASE_RADIUS_KM,
): GeoPoint | null {
  const evenings = days.map((day) => day.last)
  let best: GeoPoint[] = []
  for (const candidate of evenings) {
    const near = evenings.filter(
      (other) => distanceKm(candidate, other) <= radiusKm,
    )
    if (near.length > best.length) best = near
  }
  return best.length >= 2 ? centroid(best) : null
}

function nightsNear(days: readonly StageDay[], base: GeoPoint): number {
  return days.filter((day) => distanceKm(base, day.last) <= BASE_RADIUS_KM)
    .length
}

// Partition --------------------------------------------------------------------

/**
 * Optimal contiguous segmentation of the days. Cost of a segment is the sum
 * of squared distances of its days from their centre plus `beta`; a zone
 * change, a photo gap with a move, or a long jump make a boundary cheaper.
 * Returns a function of beta so the scatter costs are computed only once.
 */
function createPartitioner(
  days: readonly StageDay[],
): (beta: number) => [number, number][] {
  const n = days.length
  const scatter = new Map<number, number>()
  const scatterOf = (from: number, to: number): number => {
    const key = from * (n + 1) + to
    let value = scatter.get(key)
    if (value === undefined) {
      const part = days.slice(from, to)
      const centre = meanCentre(part)
      value = part.reduce(
        (sum, day) => sum + distanceKm(centre, day.centre) ** 2,
        0,
      )
      scatter.set(key, value)
    }
    return value
  }
  // Boundary bonus in units of beta for a cut before day k.
  const bonusFactor: number[] = days.map((day, k) => {
    const previous = days[k - 1]
    if (previous === undefined) return 0
    let factor = 0
    if (previous.timeZone !== day.timeZone) factor += ZONE_CHANGE_BONUS
    if (
      daysBetween(previous.date, day.date) >= GAP_MOVE_MIN_DAYS &&
      distanceKm(previous.last, day.first) > GAP_MOVE_MIN_KM
    ) {
      factor += GAP_MOVE_BONUS
    }
    const jump = distanceKm(previous.centre, day.centre)
    if (jump > JUMP_BONUS_KM) factor += JUMP_BONUS
    if (jump > LONG_JUMP_BONUS_KM) factor += LONG_JUMP_BONUS
    return factor
  })

  return (beta) => {
    const best = [0, ...new Array<number>(n).fill(Number.POSITIVE_INFINITY)]
    const back = new Array<number>(n + 1).fill(0)
    for (let j = 1; j <= n; j += 1) {
      for (let i = Math.max(0, j - PARTITION_WINDOW_DAYS); i < j; i += 1) {
        const bonus = i > 0 ? (bonusFactor[i] ?? 0) * beta : 0
        const value = (best[i] ?? 0) + scatterOf(i, j) + beta - bonus
        if (value < (best[j] ?? Number.POSITIVE_INFINITY)) {
          best[j] = value
          back[j] = i
        }
      }
    }
    const segments: [number, number][] = []
    let j = n
    while (j > 0) {
      const i = back[j] ?? 0
      segments.push([i, j])
      j = i
    }
    return segments.reverse()
  }
}

/** Finest segmentation with an average stage of roughly a week or more. */
export function autoBeta(days: readonly StageDay[]): number {
  const partitionFor = createPartitioner(days)
  const limit = Math.max(
    BETA_MIN_SEGMENT_LIMIT,
    Math.floor(days.length / BETA_DAYS_PER_SEGMENT),
  )
  let beta = 0
  for (let k = 0; k < BETA_GRID_SIZE; k += 1) {
    beta = 10 ** (BETA_GRID_START_EXPONENT + BETA_GRID_STEP * k)
    if (partitionFor(beta).length <= limit) return beta
  }
  return beta
}

// Stage internals ----------------------------------------------------------------

interface Excursion {
  days: StageDay[]
  kind: StageTripKind
  awayKm: number
}

interface Stage {
  centre: GeoPoint
  days: StageDay[]
  excursions: Excursion[]
  gateway: boolean
  photoCount: number
  radiusKm: number
  region: boolean
}

function makeStage(days: StageDay[], extra: Partial<Stage> = {}): Stage {
  const stage: Stage = {
    centre: meanCentre(days),
    days,
    excursions: [],
    gateway: false,
    photoCount: 0,
    radiusKm: 0,
    region: false,
    ...extra,
  }
  refresh(stage)
  return stage
}

function refresh(stage: Stage): void {
  stage.centre = meanCentre(stage.days)
  stage.radiusKm = radiusOf(stage.centre, stage.days)
  stage.photoCount = stage.days.reduce((sum, day) => sum + day.photoCount, 0)
}

function isSpike(days: readonly StageDay[], index: number): boolean {
  const previous = days[index - 1]
  const current = days[index]
  const next = days[index + 1]
  if (previous === undefined || current === undefined || next === undefined) {
    return false
  }
  const before = distanceKm(previous.centre, current.centre)
  const after = distanceKm(current.centre, next.centre)
  return (
    before > SPIKE_MIN_KM &&
    after > SPIKE_MIN_KM &&
    distanceKm(previous.centre, next.centre) <
      SPIKE_NEIGHBOURS_RATIO * Math.min(before, after)
  )
}

/** Runs of days that are staged independently (spikes and long silences cut). */
function splitRuns(days: readonly StageDay[]): StageDay[][] {
  const spikes = new Set<number>()
  days.forEach((_, index) => {
    if (isSpike(days, index)) spikes.add(index)
  })
  const [firstDay, ...rest] = days
  if (firstDay === undefined) return []
  const runs: StageDay[][] = [[firstDay]]
  rest.forEach((day, offset) => {
    const previous = days[offset]
    const index = offset + 1
    const current = runs[runs.length - 1]
    if (previous === undefined || current === undefined) return
    const cut =
      spikes.has(offset) ||
      spikes.has(index) ||
      (daysBetween(previous.date, day.date) >= SILENCE_SPLIT_DAYS &&
        distanceKm(previous.last, day.first) > SILENCE_SPLIT_MIN_KM)
    if (cut) runs.push([day])
    else current.push(day)
  })
  return runs
}

/**
 * A short stage between two stages at (nearly) the same place is a trip
 * inside the bigger stage: fold it (and the second part) into the first.
 */
function foldDetours(stages: readonly Stage[]): Stage[] {
  const out: Stage[] = []
  let k = 0
  while (k < stages.length) {
    const stage = stages[k]
    const previous = out[out.length - 1]
    const next = stages[k + 1]
    if (
      stage !== undefined &&
      previous !== undefined &&
      next !== undefined &&
      stage.days.length <= DETOUR_MAX_STAGE_DAYS
    ) {
      const between = distanceKm(previous.centre, next.centre)
      const away = Math.max(
        distanceKm(previous.centre, stage.centre),
        distanceKm(stage.centre, next.centre),
      )
      const lastBefore = previous.days[previous.days.length - 1]
      const firstAfter = next.days[0]
      const span =
        lastBefore !== undefined && firstAfter !== undefined
          ? daysBetween(lastBefore.date, firstAfter.date)
          : Number.POSITIVE_INFINITY
      if (
        between < Math.max(DETOUR_RETURN_MIN_KM, DETOUR_RETURN_RATIO * away) &&
        away > DETOUR_MIN_KM &&
        away <= DETOUR_MAX_KM &&
        stage.days.length <= DETOUR_MAX_DAYS &&
        span <= DETOUR_MAX_RETURN_GAP_DAYS
      ) {
        previous.excursions.push({
          awayKm: Math.round(distanceKm(previous.centre, stage.centre)),
          days: stage.days,
          kind: stage.days.length >= 2 ? 'trek' : 'day',
        })
        previous.days = [...previous.days, ...stage.days, ...next.days]
        previous.region = true
        refresh(previous)
        k += 2
        continue
      }
    }
    if (stage !== undefined) out.push(stage)
    k += 1
  }
  return out
}

function stayLike(stage: Stage): boolean {
  const base = stayBase(stage.days)
  return (
    base !== null &&
    nightsNear(stage.days, base) >=
      Math.max(STAY_LIKE_MIN_NIGHTS, STAY_LIKE_NIGHTS_RATIO * stage.days.length)
  )
}

/** Consecutive roaming stages that stay in one area become one region. */
function mergeRegions(stages: readonly Stage[]): Stage[] {
  const merged: Stage[] = []
  for (const stage of stages) {
    const previous = merged[merged.length - 1]
    const lastBefore = previous?.days[previous.days.length - 1]
    const firstAfter = stage.days[0]
    if (
      previous !== undefined &&
      lastBefore !== undefined &&
      firstAfter !== undefined &&
      !stayLike(previous) &&
      !stayLike(stage) &&
      distanceKm(previous.centre, stage.centre) <= REGION_MAX_DISTANCE_KM &&
      daysBetween(lastBefore.date, firstAfter.date) <= REGION_MAX_GAP_DAYS
    ) {
      previous.days = [...previous.days, ...stage.days]
      previous.excursions = [...previous.excursions, ...stage.excursions]
      previous.region = true
      refresh(previous)
      continue
    }
    merged.push(stage)
  }
  return merged
}

/** A city visit right after a very long jump becomes its own arrival stage. */
function splitGateways(stages: readonly Stage[]): Stage[] {
  const out: Stage[] = []
  stages.forEach((stage, index) => {
    const before = stages[index - 1]
    const lastBefore = before?.days[before.days.length - 1]
    const firstDay = stage.days[0]
    const arrival =
      lastBefore !== undefined &&
      firstDay !== undefined &&
      distanceKm(lastBefore.centre, firstDay.centre) > GATEWAY_ARRIVAL_KM
    if (stage.days.length >= GATEWAY_MIN_DAYS && !stayLike(stage) && arrival) {
      for (let take = 1; take <= GATEWAY_MAX_DAYS; take += 1) {
        const head = stage.days.slice(0, take)
        const rest = stage.days.slice(take)
        if (rest.length === 0) break
        const apart =
          distanceKm(meanCentre(head), meanCentre(rest)) > GATEWAY_REST_KM
        const photos = head.reduce((sum, day) => sum + day.photoCount, 0)
        if (apart && photos >= GATEWAY_MIN_PHOTOS) {
          out.push(makeStage(head, { gateway: true }))
          stage.days = rest
          break
        }
      }
      refresh(stage)
    }
    out.push(stage)
  })
  return out
}

/**
 * Leaving/arriving days whose night is far from the base of a stay belong to
 * the neighbouring transit stage.
 */
function trimStays(stages: readonly Stage[]): void {
  stages.forEach((stage, k) => {
    const base = stayBase(stage.days)
    if (base === null || nightsNear(stage.days, base) < TRIM_MIN_BASE_NIGHTS) {
      return
    }
    const days = stage.days
    const isAway = (day: StageDay | undefined) =>
      day !== undefined && distanceKm(base, day.last) > TRIM_AWAY_KM
    const isHome = (day: StageDay | undefined) =>
      day !== undefined && distanceKm(base, day.last) <= BASE_RADIUS_KM
    const following = stages[k + 1]
    while (
      days.length > TRIM_MIN_DAYS &&
      following !== undefined &&
      isAway(days[days.length - 1]) &&
      isHome(days[days.length - 2])
    ) {
      const moved = days.pop()
      if (moved !== undefined) following.days.unshift(moved)
    }
    const preceding = stages[k - 1]
    while (
      days.length > TRIM_MIN_DAYS &&
      preceding !== undefined &&
      isAway(days[0]) &&
      isHome(days[1])
    ) {
      const moved = days.shift()
      if (moved !== undefined) preceding.days.push(moved)
    }
  })
  for (const stage of stages) refresh(stage)
}

// Kinds, trips, places ---------------------------------------------------------

function meanStep(days: readonly StageDay[]): number {
  const steps = days.slice(1).map((day, index) => {
    const previous = days[index]
    return previous === undefined ? 0 : distanceKm(previous.last, day.first)
  })
  return steps.length === 0
    ? 0
    : steps.reduce((sum, step) => sum + step, 0) / steps.length
}

/**
 * Trips around a base: a day that gets far from it and returns is a day
 * trip; a run of evenings away from the base is a trek (walking, little
 * movement per day) or a longer multi-day trip.
 */
export function findStayTrips(
  days: readonly StageDay[],
  base: GeoPoint,
): StageTrip[] {
  const trips: StageTrip[] = []
  let run: StageDay[] = []
  const close = () => {
    if (run.length === 0) return
    const away = Math.max(
      0,
      ...run.flatMap((day) => day.points.map((p) => distanceKm(base, p))),
    )
    const evenings = run.map((day) => day.last)
    let shift = 0
    evenings.slice(1).forEach((evening, index) => {
      const previous = evenings[index]
      if (previous !== undefined) shift += distanceKm(previous, evening)
    })
    const step = shift / Math.max(1, evenings.length - 1)
    const kind: StageTripKind =
      run.length === 1
        ? 'day'
        : step <= TREK_MAX_STEP_KM && away <= TREK_MAX_AWAY_KM
          ? 'trek'
          : 'multiDay'
    trips.push({ awayKm: Math.round(away), days: run, kind })
    run = []
  }
  for (const day of days) {
    if (distanceKm(base, day.last) > BASE_RADIUS_KM) {
      run.push(day)
      continue
    }
    if (run.length > 0) {
      // The day you come back to the base still belongs to the trip.
      run.push(day)
      close()
      continue
    }
    const farthest = Math.max(
      0,
      ...day.points.map((point) => distanceKm(base, point)),
    )
    if (farthest >= DAY_TRIP_MIN_KM) {
      run.push(day)
      close()
    }
  }
  close()
  return trips
}

/** Trips of a stay without staging (for hand-made stage windows). */
export function findTripsAroundBase(days: readonly StageDay[]): StageTrip[] {
  const base = stayBase(days)
  return base === null ? [] : findStayTrips(days, base)
}

function placesOf(days: readonly StageDay[]): StagePlace[] {
  const visits: StageDay[][] = []
  for (const day of days) {
    const current = visits[visits.length - 1]
    const lastDay = current?.[current.length - 1]
    if (
      current !== undefined &&
      lastDay !== undefined &&
      distanceKm(lastDay.centre, day.centre) <= PLACE_JOIN_KM
    ) {
      current.push(day)
    } else {
      visits.push([day])
    }
  }
  // Tiny visits (one day, few photos) fold into the previous place.
  const folded: StageDay[][] = []
  for (const visit of visits) {
    const previous = folded[folded.length - 1]
    const only = visit[0]
    if (
      previous !== undefined &&
      visit.length === 1 &&
      only !== undefined &&
      only.photoCount <= PLACE_TINY_MAX_PHOTOS
    ) {
      previous.push(only)
    } else {
      folded.push(visit)
    }
  }
  return folded.map((visit) => ({
    centre: meanCentre(visit),
    days: visit,
    photoCount: visit.reduce((sum, day) => sum + day.photoCount, 0),
  }))
}

function classifyStage(
  stages: readonly Stage[],
  index: number,
): { kind: StageKind; reason: string } {
  const stage = stages[index]
  if (stage === undefined) return { kind: 'stop', reason: '' }
  const days = stage.days
  const neighbours = [stages[index - 1], stages[index + 1]].filter(
    (other): other is Stage => other !== undefined,
  )
  const distances = neighbours.map((other) =>
    distanceKm(stage.centre, other.centre),
  )
  const nearest = distances.length === 0 ? 0 : Math.min(...distances)
  const base = stayBase(days)
  const nights = base === null ? 0 : nightsNear(days, base)
  const first = days[0]
  const last = days[days.length - 1]
  const span =
    first !== undefined && last !== undefined
      ? daysBetween(first.date, last.date) + 1
      : days.length
  const step = Math.round(meanStep(days))
  const count = String(days.length)

  if (stage.gateway) {
    return {
      kind: 'arrival',
      reason:
        neighbours.length > 0
          ? `${count} d at a city, a region ${String(Math.round(nearest))} km away follows`
          : 'arrival',
    }
  }
  const before = stages[index - 1]
  const after = stages[index + 1]
  const lastBefore = before?.days[before.days.length - 1]
  const firstAfter = after?.days[0]
  if (
    before !== undefined &&
    after !== undefined &&
    lastBefore !== undefined &&
    firstAfter !== undefined &&
    distanceKm(before.centre, after.centre) < DETOUR_RETURN_RATIO * nearest &&
    daysBetween(lastBefore.date, firstAfter.date) <=
      DETOUR_MAX_RETURN_GAP_DAYS &&
    nearest > DETOUR_KIND_MIN_KM
  ) {
    return {
      kind: 'detour',
      reason: `${count} d, returns to the original area (${String(Math.round(nearest))} km away)`,
    }
  }
  if (
    days.length <= REMOTE_STOP_MAX_DAYS &&
    distances.length > 0 &&
    distances.every((d) => d > REMOTE_STOP_MIN_KM) &&
    !distances.some((d) => d > FAR_PLACE_KM)
  ) {
    return {
      kind: 'remoteStop',
      reason: `${count} d, ${String(Math.round(nearest))} km from the neighbouring stages`,
    }
  }
  if (
    days.length === 1 &&
    stages.some(
      (other) =>
        other !== stage &&
        distanceKm(stage.centre, other.centre) > FAR_PLACE_KM,
    )
  ) {
    return { kind: 'transfer', reason: '1 d, very distant place' }
  }
  if (
    base !== null &&
    nights >= Math.max(STAY_MIN_NIGHTS, STAY_NIGHTS_RATIO * days.length)
  ) {
    return {
      kind: 'stay',
      reason: `${String(nights)} nights with photos within ${String(BASE_RADIUS_KM)} km of the base, ${String(span)} calendar days`,
    }
  }
  if (days.length <= SHORT_STAGE_MAX_DAYS) {
    return {
      kind: step >= SHORT_TRANSFER_MIN_STEP_KM ? 'transfer' : 'stop',
      reason: `${count} d, ${String(step)} km between nights on average`,
    }
  }
  if (stage.region) {
    return {
      kind: 'region',
      reason: `road trip around an area: ${count} d with photos, radius ${String(Math.round(stage.radiusKm))} km`,
    }
  }
  return {
    kind: step >= LONG_TRANSFER_MIN_STEP_KM ? 'transfer' : 'region',
    reason: `${count} d, radius ${String(Math.round(stage.radiusKm))} km, ${String(step)} km between nights on average`,
  }
}

/**
 * Cuts located local days into stages. `days` must be sorted by date.
 * Deterministic; the stability rules about hand-made data live in
 * `planOrganization`, which maps the stages to time ranges.
 */
export function planStages(
  days: readonly StageDay[],
  options: StagePlanOptions = {},
): PlannedStage[] {
  if (days.length === 0) return []
  const beta = options.beta ?? autoBeta(days)

  let stages: Stage[] = []
  for (const run of splitRuns(days)) {
    for (const [from, to] of createPartitioner(run)(beta)) {
      stages.push(makeStage(run.slice(from, to)))
    }
  }
  stages = foldDetours(stages)
  stages = mergeRegions(stages)
  stages = splitGateways(stages)
  trimStays(stages)

  return stages.map((stage, index): PlannedStage => {
    const { kind, reason } = classifyStage(stages, index)
    const base = stayBase(stage.days)
    const excursionDays = new Set(
      stage.excursions.flatMap((excursion) =>
        excursion.days.map((day) => day.date),
      ),
    )
    const trips: StageTrip[] = stage.excursions.map((excursion) => ({
      ...excursion,
    }))
    if (kind === 'stay' && base !== null) {
      trips.push(
        ...findStayTrips(stage.days, base).filter(
          (trip) => !trip.days.some((day) => excursionDays.has(day.date)),
        ),
      )
    }
    return {
      centre: stage.centre,
      days: stage.days,
      kind,
      places:
        kind === 'region' && stage.days.length >= PLACE_MIN_DAYS
          ? placesOf(stage.days)
          : [],
      radiusKm: stage.radiusKm,
      reason,
      trips,
    }
  })
}
