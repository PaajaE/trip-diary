/**
 * Kontrola zastávek (plan 4f, UX flow point 3; mockups M-Kontrola,
 * W-Kontrola, M-Cestou, M-Rozdelit): the cards of one day in time order.
 * Stops (with number, time fact, "nová", lock, unsure flag, skeleton while
 * the place is looked up), collapsed rides "Cestou" (one tap makes a stop of
 * them), trips inside the day with their stops, and plain transit facts
 * between stops ("Auto, 86 km", "Pauza 50 min"). One photo is never an
 * interval: it is "kolem 15:07".
 */
import {
  classifyGap,
  distanceKm,
  GAP_MIN_DISTANCE_M,
  type GeoPoint,
  type MovementMode,
} from '@trip-diary/core/automation'
import type { MediaItem } from '@/entities/media/model/media-library'
import type {
  FlowDay,
  FlowStop,
  FlowTrip,
} from '@/features/journey-flow/model/flow-days'
import type { FlowMarkers } from '@/features/journey-flow/model/flow-markers'

/** A standstill at least this long between two stops is a "Pauza". */
export const PAUSE_MIN_MS = 20 * 60_000

/** "kolem 15:07" for one shot, else a range. Instants; the UI formats in `tz`. */
export type TimeFact =
  | { at: string; kind: 'around'; tz: string | null }
  | { from: string; kind: 'range'; to: string; tz: string | null }

export type TransitHint =
  /** "Auto, 86 km": mode by speed and distance (`transit` = unknown). */
  | {
      distanceKm: number
      from: string
      kind: 'move'
      mode: MovementMode
      to: string
    }
  /** "Pauza 50 min": no movement between the two stops. */
  | { durationMs: number; from: string; kind: 'pause'; to: string }

export interface StopCard {
  kind: 'stop'
  /** 1-based number among the stops of the day (rides excluded). */
  number: number
  /** The user already opened this to-check stop. */
  opened: boolean
  stop: FlowStop
  time: TimeFact
  /** Deserves a look (shown in the "Ke kontrole" filter). */
  toCheck: boolean
}

export interface RideCard {
  kind: 'enRoute'
  mediaCount: number
  /**
   * Mode of the stretch the ride belongs to (classifyGap between the stops
   * around it), null when unknown: only 'vehicle' may say "z okna auta".
   */
  mode: MovementMode | null
  /** The collapsed ride stops ("Cestou"), in time order. */
  stopIds: string[]
  time: TimeFact
}

export interface TransitCard {
  hint: TransitHint
  kind: 'transit'
}

export type DayCard = RideCard | StopCard | TransitCard

export interface TripCard {
  cards: DayCard[]
  /** Straight-line distance over the trip's stops (km), null without GPS. */
  distanceKm: number | null
  kind: 'trip'
  time: TimeFact
  trip: FlowTrip
}

export type ReviewCard = DayCard | TripCard

export type ReviewFilter = 'all' | 'toCheck'

export interface StopReviewModel {
  cards: ReviewCard[]
  /** Unlocked stops "Zastávky sedí" confirms (rides included: they keep). */
  confirmIds: string[]
  dayKey: string
  filter: ReviewFilter
  /** Stops of the day (rides excluded): "Potvrdí všech 12 zastávek". */
  stopCount: number
  toCheckCount: number
  /** "2 zastávky ke kontrole jsi ještě neotevřel". */
  unopenedToCheck: string[]
  /** The "Nezařazené" card: photos without a stop and probable copies. */
  unassigned: { copies: number; media: number }
}

/** "kolem 15:07" for one shot, a range otherwise. */
export function timeFact(
  startsAt: string,
  endsAt: string,
  mediaCount: number,
  tz: string | null,
): TimeFact {
  return mediaCount <= 1 || Date.parse(startsAt) === Date.parse(endsAt)
    ? { at: startsAt, kind: 'around', tz }
    : { from: startsAt, kind: 'range', to: endsAt, tz }
}

/** Plain fact between two stops, null when there is nothing to say. */
export function transitBetween(
  from: { centre: GeoPoint | null; endsAt: string },
  to: { centre: GeoPoint | null; startsAt: string },
): TransitHint | null {
  const durationMs = Math.max(
    0,
    Date.parse(to.startsAt) - Date.parse(from.endsAt),
  )
  if (Number.isNaN(durationMs)) return null
  if (from.centre === null || to.centre === null) return null
  const distanceM = distanceKm(from.centre, to.centre) * 1000
  if (distanceM < GAP_MIN_DISTANCE_M) {
    return durationMs >= PAUSE_MIN_MS
      ? { durationMs, from: from.endsAt, kind: 'pause', to: to.startsAt }
      : null
  }
  const gap = classifyGap({
    altitudeChangeM: null,
    distanceM,
    durationMs,
    environment: null,
    next: null,
    previous: null,
  })
  return {
    distanceKm: Math.round(distanceM / 100) / 10,
    from: from.endsAt,
    kind: 'move',
    mode: gap.mode,
    to: to.startsAt,
  }
}

interface Item {
  card: RideCard | StopCard
  /** Trip the item belongs to, null outside trips. */
  tripId: string | null
  /** Ends of the item for transit facts. */
  centre: GeoPoint | null
  endsAt: string
  startsAt: string
}

/** Builds the cards of one day. `filter: 'toCheck'` lists only stops to check. */
export function buildStopReview(
  day: FlowDay,
  markers: FlowMarkers,
  filter: ReviewFilter = 'all',
): StopReviewModel {
  const opened = new Set(markers.openedStopIds)
  const tripOf = new Map<string, string>()
  for (const trip of day.trips) {
    for (const id of trip.stopIds) if (!tripOf.has(id)) tripOf.set(id, trip.id)
  }

  const items: Item[] = []
  let number = 0
  for (const stop of day.stops) {
    const tripId = tripOf.get(stop.id) ?? null
    const last = items[items.length - 1]
    if (stop.kind === 'en_route') {
      if (last?.card.kind === 'enRoute' && last.tripId === tripId) {
        last.card.stopIds.push(stop.id)
        last.card.mediaCount += stop.media.length
        last.endsAt = stop.endsAt
        last.card.time = timeFact(
          last.startsAt,
          stop.endsAt,
          last.card.mediaCount,
          stop.tz,
        )
        continue
      }
      items.push({
        card: {
          kind: 'enRoute',
          mediaCount: stop.media.length,
          mode: null,
          stopIds: [stop.id],
          time: timeFact(
            stop.startsAt,
            stop.endsAt,
            stop.media.length,
            stop.tz,
          ),
        },
        centre: stop.centre,
        endsAt: stop.endsAt,
        startsAt: stop.startsAt,
        tripId,
      })
      continue
    }
    number += 1
    items.push({
      card: {
        kind: 'stop',
        number,
        opened: opened.has(stop.id),
        stop,
        time: timeFact(stop.startsAt, stop.endsAt, stop.media.length, stop.tz),
        toCheck: stop.needsLook,
      },
      centre: stop.centre,
      endsAt: stop.endsAt,
      startsAt: stop.startsAt,
      tripId,
    })
  }

  // Transit facts between consecutive stops; a ride between them carries
  // the fact of the whole stretch (placed before the ride card).
  interface Placed {
    card: DayCard
    tripId: string | null
  }
  const placed: Placed[] = []
  let previousStop: Item | null = null
  let pendingRide: Item[] = []
  const flushRide = (next: Item | null) => {
    if (previousStop !== null && next !== null) {
      // The mode is what the stretch says (classifyGap); an unclear one
      // stays the neutral "Přesun", a ride is never assumed to be a car.
      const hint = transitBetween(previousStop, next)
      const mode = hint?.kind === 'move' ? hint.mode : null
      for (const ride of pendingRide) {
        if (ride.card.kind === 'enRoute') ride.card.mode = mode
      }
      if (hint !== null) {
        const tripId =
          previousStop.tripId !== null && previousStop.tripId === next.tripId
            ? next.tripId
            : null
        placed.push({ card: { hint, kind: 'transit' }, tripId })
      }
    }
    for (const ride of pendingRide)
      placed.push({ card: ride.card, tripId: ride.tripId })
    pendingRide = []
  }
  for (const item of items) {
    if (item.card.kind === 'enRoute') {
      pendingRide.push(item)
      continue
    }
    flushRide(item)
    placed.push({ card: item.card, tripId: item.tripId })
    previousStop = item
  }
  flushRide(null)

  // Fold trip members into trip cards (a trip appears where it starts).
  const cards: ReviewCard[] = []
  const tripCards = new Map<string, TripCard>()
  const tripById = new Map(day.trips.map((trip) => [trip.id, trip]))
  for (const entry of placed) {
    const trip = entry.tripId === null ? undefined : tripById.get(entry.tripId)
    if (trip === undefined) {
      cards.push(entry.card)
      continue
    }
    let card = tripCards.get(trip.id)
    if (card === undefined) {
      card = {
        cards: [],
        distanceKm: null,
        kind: 'trip',
        time: timeFact(trip.startsAt, trip.endsAt, 2, null),
        trip,
      }
      tripCards.set(trip.id, card)
      cards.push(card)
    }
    card.cards.push(entry.card)
  }
  for (const card of tripCards.values()) {
    const centres = card.cards.flatMap((inner) =>
      inner.kind === 'stop' && inner.stop.centre !== null
        ? [inner.stop.centre]
        : [],
    )
    let km = 0
    for (let i = 1; i < centres.length; i += 1) {
      const a = centres[i - 1]
      const b = centres[i]
      if (a !== undefined && b !== undefined) km += distanceKm(a, b)
    }
    card.distanceKm = centres.length < 2 ? null : Math.round(km * 10) / 10
    const tz = card.cards.find((inner) => inner.kind === 'stop')
    card.time = timeFact(
      card.trip.startsAt,
      card.trip.endsAt,
      2,
      tz?.kind === 'stop' ? tz.stop.tz : null,
    )
  }

  const stopCards = items
    .map((item) => item.card)
    .filter((card): card is StopCard => card.kind === 'stop')
  const toCheck = stopCards.filter((card) => card.toCheck)
  return {
    cards: filter === 'toCheck' ? toCheck : cards,
    // Only stops that still hold photos (an emptied one is not confirmed).
    confirmIds: day.stops
      .filter((stop) => !stop.locked && stop.media.length > 0)
      .map((stop) => stop.id),
    dayKey: day.key,
    filter,
    stopCount: stopCards.length,
    toCheckCount: toCheck.length,
    unopenedToCheck: toCheck
      .filter((card) => !card.opened)
      .map((card) => card.stop.id),
    unassigned: { copies: day.duplicates.length, media: day.unassigned.length },
  }
}

/** The stop before `stopId` among the day's stops (rides excluded): "Spojit s předchozí". */
export function previousStopId(day: FlowDay, stopId: string): string | null {
  const stops = day.stops.filter((stop) => stop.kind !== 'en_route')
  const index = stops.findIndex((stop) => stop.id === stopId)
  return index > 0 ? (stops[index - 1]?.id ?? null) : null
}

export interface SplitPart {
  mediaIds: string[]
  time: TimeFact
}

export interface SplitPreview {
  /** The split instant: photos captured at or after it form the new stop. */
  at: string
  after: SplitPart
  before: SplitPart
  /** Silence between the two parts ("pauza 18 min"). */
  pauseMs: number
}

function partOf(items: readonly MediaItem[], tz: string | null): SplitPart {
  const first = items[0]
  const last = items[items.length - 1]
  return {
    mediaIds: items.map((item) => item.id),
    time:
      first?.capturedAt == null || last?.capturedAt == null
        ? { at: '', kind: 'around', tz }
        : timeFact(first.capturedAt, last.capturedAt, items.length, tz),
  }
}

/**
 * "Řez před touto fotkou" (M-Rozdelit): what split_moment would do when the
 * new stop starts with `mediaId`. Null when it cannot split there (first
 * photo, no capture time, or nothing would stay).
 */
export function splitPreview(
  stop: FlowStop,
  mediaId: string,
): SplitPreview | null {
  const dated = stop.media.filter((item) => item.capturedAt !== null)
  const chosen = dated.find((item) => item.id === mediaId)
  if (chosen?.capturedAt == null) return null
  const at = Date.parse(chosen.capturedAt)
  const before = dated.filter(
    (item) => item.capturedAt !== null && Date.parse(item.capturedAt) < at,
  )
  const after = dated.filter(
    (item) => item.capturedAt !== null && Date.parse(item.capturedAt) >= at,
  )
  const lastBefore = before[before.length - 1]
  if (lastBefore?.capturedAt == null || after.length === 0) return null
  return {
    after: partOf(after, stop.tz),
    at: chosen.capturedAt,
    before: partOf(before, stop.tz),
    pauseMs: at - Date.parse(lastBefore.capturedAt),
  }
}

/** Where a cut looks most natural: the photo after the longest silence. */
export function suggestedSplitId(stop: FlowStop): string | null {
  let best: { gap: number; id: string } | null = null
  const dated = stop.media.filter((item) => item.capturedAt !== null)
  for (let i = 1; i < dated.length; i += 1) {
    const prev = dated[i - 1]
    const item = dated[i]
    if (prev?.capturedAt == null || item?.capturedAt == null) continue
    const gap = Date.parse(item.capturedAt) - Date.parse(prev.capturedAt)
    if (best === null || gap > best.gap) best = { gap, id: item.id }
  }
  return best === null || best.gap <= 0 ? null : best.id
}
