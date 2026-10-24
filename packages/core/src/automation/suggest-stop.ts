import { distanceKm } from './geo.ts'

export interface SuggestStopMedia {
  capturedAt: string | null
  latitude: number | null
  longitude: number | null
}

export interface SuggestStopStop {
  id: string
  startsAt: string
  endsAt: string
  latitude: number | null
  longitude: number | null
}

export interface SuggestStopOptions {
  /** Max time distance to a stop edge for 'near_time'. Default 3 h. */
  nearTimeMs?: number
  /** Max distance for 'near_time' (when both have coordinates) and 'near_place'. Default 1500 m. */
  nearMeters?: number
}

export interface StopSuggestion {
  stopId: string
  reason: 'inside' | 'near_time' | 'near_place'
}

const NEAR_PLACE_MAX_MS = 24 * 3600_000

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Suggests the stop a photo most likely belongs to.
 * 1. 'inside': time within [startsAt, endsAt] (several: closest centre, then id).
 * 2. 'near_time': within nearTimeMs of a stop edge and (a side lacks coordinates
 *    or distance <= nearMeters); closest in time, then id.
 * 3. 'near_place': both have coordinates, distance <= nearMeters and within 24 h;
 *    nearest by distance, then id.
 */
export function suggestStop(
  media: SuggestStopMedia,
  stops: readonly SuggestStopStop[],
  options: SuggestStopOptions = {},
): StopSuggestion | null {
  const nearTimeMs = options.nearTimeMs ?? 3 * 3600_000
  const nearMeters = options.nearMeters ?? 1500
  if (media.capturedAt === null) {
    return null
  }
  const t = Date.parse(media.capturedAt)
  if (Number.isNaN(t)) {
    return null
  }
  const { latitude, longitude } = media

  const rows: {
    id: string
    start: number
    end: number
    gap: number
    meters: number | null
  }[] = []
  for (const stop of stops) {
    const start = Date.parse(stop.startsAt)
    const end = Date.parse(stop.endsAt)
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
      continue
    }
    const meters =
      latitude !== null &&
      longitude !== null &&
      stop.latitude !== null &&
      stop.longitude !== null
        ? distanceKm(
            { latitude, longitude },
            { latitude: stop.latitude, longitude: stop.longitude },
          ) * 1000
        : null
    rows.push({
      end,
      gap: t < start ? start - t : t > end ? t - end : 0,
      id: stop.id,
      meters,
      start,
    })
  }

  const inside = rows
    .filter((r) => r.gap === 0)
    .sort(
      (a, b) =>
        Math.abs(t - (a.start + a.end) / 2) -
          Math.abs(t - (b.start + b.end) / 2) || cmp(a.id, b.id),
    )[0]
  if (inside !== undefined) {
    return { reason: 'inside', stopId: inside.id }
  }

  const nearTime = rows
    .filter(
      (r) =>
        r.gap <= nearTimeMs && (r.meters === null || r.meters <= nearMeters),
    )
    .sort((a, b) => a.gap - b.gap || cmp(a.id, b.id))[0]
  if (nearTime !== undefined) {
    return { reason: 'near_time', stopId: nearTime.id }
  }

  const nearPlace = rows
    .filter(
      (r) =>
        r.meters !== null &&
        r.meters <= nearMeters &&
        r.gap <= NEAR_PLACE_MAX_MS,
    )
    .sort((a, b) => (a.meters ?? 0) - (b.meters ?? 0) || cmp(a.id, b.id))[0]
  if (nearPlace !== undefined) {
    return { reason: 'near_place', stopId: nearPlace.id }
  }
  return null
}
