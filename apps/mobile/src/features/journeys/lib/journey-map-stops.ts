import type { JourneyStop, JourneyStopStatus } from '@trip-diary/core/journey'
import { parseJourneyStopFromRemoteRecord } from '@trip-diary/core/journey'

export interface MappableJourneyStop {
  id: string
  latitude: number
  longitude: number
  status: JourneyStopStatus
  title: string
}

export function sortJourneyStops(stops: JourneyStop[]): JourneyStop[] {
  return [...stops].sort((left, right) => {
    const leftPosition = left.position ?? Number.MAX_SAFE_INTEGER
    const rightPosition = right.position ?? Number.MAX_SAFE_INTEGER

    if (leftPosition !== rightPosition) {
      return leftPosition - rightPosition
    }

    const titleCompare = left.title.localeCompare(right.title)
    if (titleCompare !== 0) {
      return titleCompare
    }

    return left.id.localeCompare(right.id)
  })
}

export function parseRemoteJourneyStopRows(
  rows: Record<string, unknown>[],
): JourneyStop[] {
  const seenIds = new Set<string>()
  const parsed: JourneyStop[] = []

  for (const row of rows) {
    let stop: JourneyStop | null = null

    try {
      stop = parseJourneyStopFromRemoteRecord(row)
    } catch {
      stop = null
    }

    if (stop === null) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[journey-stops] skipped malformed stop row')
      }
      continue
    }

    if (seenIds.has(stop.id)) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[journey-stops] skipped duplicate stop id')
      }
      continue
    }

    seenIds.add(stop.id)
    parsed.push(stop)
  }

  return sortJourneyStops(parsed)
}

export function toMappableJourneyStops(
  stops: JourneyStop[],
): MappableJourneyStop[] {
  return stops.flatMap((stop) => {
    if (
      stop.mapLatitude === null ||
      stop.mapLongitude === null ||
      !Number.isFinite(stop.mapLatitude) ||
      !Number.isFinite(stop.mapLongitude)
    ) {
      return []
    }

    return [
      {
        id: stop.id,
        latitude: stop.mapLatitude,
        longitude: stop.mapLongitude,
        status: stop.status,
        title: stop.title,
      },
    ]
  })
}
