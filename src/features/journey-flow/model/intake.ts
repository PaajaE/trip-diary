/**
 * Příjem nových dnů (plan 4f, UX flow point 2; mockups Main and W-Prijem):
 * only the days that got new photos since the arrivals were last seen, each
 * with plain facts. No "sure day" badge: just how many stops, how many
 * deserve a look, the photo count, a cover and the place names.
 */
import type { StopName } from '@trip-diary/core/automation'
import type { FlowDay, FlowStop } from '@/features/journey-flow/model/flow-days'
import {
  arrivedAfter,
  type FlowMarkers,
} from '@/features/journey-flow/model/flow-markers'
import { isUnreviewed } from '@/features/journey-workspace/model/day-status'
import { UNKNOWN_DAY } from '@/features/journey-workspace/model/workspace-days'

export interface IntakeDay {
  /** Cover photo: first ★ of the day, else the cover of the biggest stop. */
  coverMediaId: string | null
  key: string
  /** Stops that deserve a look ("2 si zaslouží pohled"). */
  needsLookCount: number
  /** Photos and videos that arrived since the marker. */
  newMediaCount: number
  photoCount: number
  /**
   * Names of the first and the last named stop ("Calgary → Banff"); one
   * entry when they are the same, none when no stop has a name yet.
   */
  places: StopName[]
  /** Stops whose photos are all sorted ("Fotky: 3 z 12 zastávek hotovo"). */
  sortedStops: number
  /** Stops of the day (collapsed rides "Cestou" do not count). */
  stopCount: number
  /** Trips inside the day ("výlet a 5 zastávek"). */
  tripCount: number
  videoCount: number
}

export interface IntakeModel {
  /** New days in calendar order (the mockup's order). */
  days: IntakeDay[]
  /** The same days, least sure first (most stops to look at, then date). */
  byConfidence: string[]
  /** Header facts: "3 dny, 412 fotek" and "32 vypadá jistě, 8 potřebuje oko". */
  totals: {
    days: number
    lookStops: number
    newMedia: number
    sureStops: number
  }
}

const isStop = (stop: FlowStop) => stop.kind !== 'en_route'

function nameKey(name: StopName): string {
  const { base } = name
  switch (base.kind) {
    case 'title':
    case 'place':
      return `${base.kind}|${base.text}`
    case 'district':
      return `d|${base.district}|${base.city}`
    case 'near':
      return `n|${base.city}`
    case 'dayPart':
    case 'pending':
      return '' // not a place
  }
}

function placesOf(stops: readonly FlowStop[]): StopName[] {
  const named = stops.filter(
    (stop) => isStop(stop) && nameKey(stop.name) !== '',
  )
  const first = named[0]
  const last = named[named.length - 1]
  if (first === undefined || last === undefined) return []
  return nameKey(first.name) === nameKey(last.name)
    ? [first.name]
    : [first.name, last.name]
}

function coverOf(day: FlowDay): string | null {
  const starred = day.media.find(
    (item) => item.starred && item.kind === 'photo',
  )
  if (starred !== undefined) return starred.id
  const biggest = [...day.stops]
    .filter(isStop)
    .sort((a, b) => b.media.length - a.media.length)[0]
  return biggest?.coverMediaId ?? day.media[0]?.id ?? null
}

/**
 * Is the day new? Some of its media arrived after the marker; before the
 * first acknowledgement (no marker) a day with unsorted photos counts.
 */
export function isNewDay(day: FlowDay, markers: FlowMarkers): boolean {
  if (markers.seenUpTo === null) return day.media.some(isUnreviewed)
  return day.media.some((item) =>
    arrivedAfter(item.createdAt, markers.seenUpTo),
  )
}

export function buildIntake(
  days: readonly FlowDay[],
  markers: FlowMarkers,
): IntakeModel {
  const out: IntakeDay[] = []
  let sure = 0
  let look = 0
  let newMedia = 0
  for (const day of days) {
    if (day.key === UNKNOWN_DAY || !isNewDay(day, markers)) continue
    const stops = day.stops.filter(isStop)
    const needsLook = stops.filter((stop) => stop.needsLook).length
    const fresh =
      markers.seenUpTo === null
        ? day.media.filter(isUnreviewed).length
        : day.media.filter((item) =>
            arrivedAfter(item.createdAt, markers.seenUpTo),
          ).length
    sure += stops.length - needsLook
    look += needsLook
    newMedia += fresh
    out.push({
      coverMediaId: coverOf(day),
      key: day.key,
      needsLookCount: needsLook,
      newMediaCount: fresh,
      photoCount: day.media.filter((item) => item.kind === 'photo').length,
      places: placesOf(day.stops),
      sortedStops: day.stops.filter(
        (stop) => stop.media.length > 0 && !stop.media.some(isUnreviewed),
      ).length,
      stopCount: stops.length,
      tripCount: day.trips.length,
      videoCount: day.media.filter((item) => item.kind === 'video').length,
    })
  }
  const share = (day: IntakeDay) =>
    day.stopCount === 0 ? 0 : day.needsLookCount / day.stopCount
  const byConfidence = [...out]
    .sort(
      (a, b) =>
        b.needsLookCount - a.needsLookCount ||
        share(b) - share(a) ||
        (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    )
    .map((day) => day.key)
  return {
    byConfidence,
    days: out,
    totals: { days: out.length, lookStops: look, newMedia, sureStops: sure },
  }
}
