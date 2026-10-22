import { distanceKm } from './geo.ts'
import { BASE_RADIUS_KM, stayBase } from './stages.ts'
import type {
  DayPlace,
  JourneyDay,
  JourneyStage,
  JourneyTrip,
} from './journey-plan.ts'

/**
 * Names of suggested stages and trips built from the places of their days.
 * Pure; the wording comes from a small label set (Czech by default) so the
 * app can pass translated labels.
 */
export interface NameLabels {
  /** "A and B" */
  and: (first: string, second: string) => string
  /** "Day trip: X" */
  dayTrip: (name: string) => string
  /** Makes a repeated title unique: "Title 2". */
  repeat: (title: string, count: number) => string
  /** "Stay X" */
  stay: (name: string) => string
  /** "A → B" */
  travel: (from: string, to: string) => string
  /** Locale for country names (Intl.DisplayNames); Czech when omitted. */
  locale?: string
  /** "Trek: X" */
  trek: (name: string) => string
  /** "Trek around X" */
  trekAround: (name: string) => string
}

export const CS_NAME_LABELS: NameLabels = {
  and: (first, second) => `${first} a ${second}`,
  dayTrip: (name) => `Výlet: ${name}`,
  locale: 'cs',
  repeat: (title, count) => `${title} ${String(count)}`,
  stay: (name) => `Pobyt ${name}`,
  travel: (from, to) => `${from} → ${to}`,
  trek: (name) => `Trek: ${name}`,
  trekAround: (name) => `Trek kolem ${name}`,
}

interface Tally {
  first: number
  kind: DayPlace['kind']
  name: string
  photos: number
}

/**
 * Names in titles: trail names may carry their length ("Skyline trail
 * (3days)") and viewpoint words add nothing to a title.
 */
function cleanName(name: string): string {
  const cleaned = name
    .replace(/\s*\(\s*\d+\s*-?\s*days?\s*\)/i, '')
    .replace(/\s*\b(viewpoint|lookout|outlook)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned === '' ? name.trim() : cleaned
}

function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/** Country codes of the places in the order they were visited. */
function countriesOf(days: readonly JourneyDay[]): string[] {
  return days
    .flatMap((day) => day.places)
    .flatMap((place) => (place.country === undefined ? [] : [place.country]))
}

function tally(days: readonly JourneyDay[]): Tally[] {
  const byName = new Map<string, Tally>()
  let order = 0
  for (const day of days) {
    for (const place of day.places) {
      if (place.kind === 'region' || place.kind === 'country') continue
      const name = cleanName(place.name)
      if (name === '') continue
      const known = byName.get(name)
      if (known === undefined) {
        byName.set(name, {
          first: order,
          kind: place.kind,
          name,
          photos: place.photos,
        })
      } else {
        known.photos += place.photos
      }
      order += 1
    }
  }
  return [...byName.values()].sort(
    (a, b) =>
      b.photos - a.photos || a.first - b.first || a.name.localeCompare(b.name),
  )
}

/** Place names in the order they were first visited. */
function chronological(days: readonly JourneyDay[]): Tally[] {
  return tally(days).sort((a, b) => a.first - b.first)
}

function isNature(entry: Tally): boolean {
  return entry.kind === 'natural'
}

/** The most prominent place of the days; nature first when `nature` is set. */
function topName(
  days: readonly JourneyDay[],
  filter: (entry: Tally) => boolean = () => true,
): string | null {
  return tally(days).find(filter)?.name ?? null
}

export interface StageNameContext {
  next?: JourneyStage | undefined
  previous?: JourneyStage | undefined
}

function isTown(entry: Tally): boolean {
  return entry.kind === 'settlement'
}

/** Places that can stand for a stay: towns first, never a viewpoint. */
function homeRank(entry: Tally): number {
  switch (entry.kind) {
    case 'settlement':
      return 0
    case 'near':
      return 1
    case undefined:
      return 2
    case 'natural':
      return 3
    case 'attraction':
    case 'region':
    case 'country':
      return 4
  }
}

function longHaulName(stage: JourneyStage, labels: NameLabels): string | null {
  const first = stage.days[0]?.first
  if (first === undefined) return null
  const far = stage.days.some(
    (day) => distanceKm(first, day.last) > LONG_HAUL_KM,
  )
  if (!far) return null
  const countries = countriesOf(stage.days)
  const from = countries[0]
  const to = countries[countries.length - 1]
  const locale = labels.locale ?? 'cs'
  if (from !== undefined && to !== undefined && from !== to) {
    return labels.travel(countryName(from, locale), countryName(to, locale))
  }
  const towns = tally(stage.days)
    .filter(isTown)
    .slice(0, 2)
    .sort((a, b) => a.first - b.first)
  const [one, two] = towns
  return one !== undefined && two !== undefined
    ? labels.travel(one.name, two.name)
    : null
}

/** Transfers longer than this are named by country or by the main towns. */
const LONG_HAUL_KM = 1000

function travelName(
  stage: JourneyStage,
  labels: NameLabels,
  context: StageNameContext,
): string | null {
  const towns = chronological(stage.days).filter(isTown)
  const previousTowns = context.previous
    ? chronological(context.previous.days).filter(isTown)
    : []
  const nextTowns = context.next
    ? chronological(context.next.days).filter(isTown)
    : []
  // An endpoint without its own town is borrowed from the adjacent stage.
  const from = towns[0] ?? previousTowns[previousTowns.length - 1]
  const to = towns.length >= 2 ? towns[towns.length - 1] : nextTowns[0]
  return from !== undefined && to !== undefined && from.name !== to.name
    ? labels.travel(from.name, to.name)
    : null
}

/** Name of a suggested stage, or null when the days know no place. */
export function nameStage(
  stage: JourneyStage,
  labels: NameLabels = CS_NAME_LABELS,
  context: StageNameContext = {},
): string | null {
  const days = stage.days
  if (stage.kind === 'stay') {
    const name = stageHomeName(stage)
    return name === null ? null : labels.stay(name)
  }
  if (stage.kind === 'trek') {
    const nature = topName(days, isNature)
    if (nature !== null) return labels.trekAround(nature)
  }
  const longHaul = longHaulName(stage, labels)
  if (longHaul !== null) return longHaul
  if (stage.kind === 'transfer' || stage.kind === 'arrival') {
    const travel = travelName(stage, labels, context)
    if (travel !== null) return travel
  }
  // Settlements first, then attractions, nature only to fill the title.
  const tier = (entry: Tally) =>
    isNature(entry) ? 2 : entry.kind === 'attraction' ? 1 : 0
  const top = tally(days).sort(
    (a, b) => tier(a) - tier(b) || b.photos - a.photos || a.first - b.first,
  )
  const [one, two] = top
  if (one === undefined) return null
  if (two === undefined) return one.name
  // Keep the order of the visit inside the title: "Banff a Yoho".
  const [first, second] = one.first <= two.first ? [one, two] : [two, one]
  return labels.and(first.name, second.name)
}

/**
 * Candidate names of a suggested trip, best first (the most photographed
 * place, then the next ones), so a caller can avoid repeating a title.
 */
export function tripNames(
  trip: JourneyTrip,
  labels: NameLabels = CS_NAME_LABELS,
  excludeNames: ReadonlySet<string> = new Set(),
): string[] {
  const entries = tally(trip.days).filter(
    (entry) => !excludeNames.has(entry.name),
  )
  if (trip.kind === 'day') {
    return entries.map((entry) => labels.dayTrip(entry.name))
  }
  return [
    ...entries.filter(isNature).map((entry) => labels.trek(entry.name)),
    ...entries
      .filter((entry) => !isNature(entry))
      .map((entry) => labels.trekAround(entry.name)),
  ]
}

/** Name of a suggested trip, or null when the days know no place. */
export function nameTrip(
  trip: JourneyTrip,
  labels: NameLabels = CS_NAME_LABELS,
  excludeNames: ReadonlySet<string> = new Set(),
): string | null {
  return tripNames(trip, labels, excludeNames)[0] ?? null
}

/** The base-stay name of a stage (the place a day trip should not repeat). */
export function stageHomeName(stage: JourneyStage): string | null {
  if (stage.kind !== 'stay') return null
  // Only the days that slept at the base say what the base is called.
  const base = stayBase(stage.days)
  const atBase =
    base === null
      ? stage.days
      : stage.days.filter((day) => distanceKm(base, day.last) <= BASE_RADIUS_KM)
  const best = tally(atBase.length > 0 ? atBase : stage.days).sort(
    (a, b) => homeRank(a) - homeRank(b) || b.photos - a.photos,
  )[0]
  return best?.name ?? null
}
