import type { JourneyChecklistItem } from '@/entities/checklist/model/checklist'
import type { JourneyDetail } from '@/entities/journey/model/journey'

export function goalStopLocation(
  item: JourneyChecklistItem,
  stops: JourneyDetail['stops'],
): { latitude: number; longitude: number } | null {
  if (item.stopId === null) {
    return null
  }

  const stop = stops.find((candidate) => candidate.id === item.stopId)
  if (stop === undefined) {
    return null
  }

  if (
    stop.mapLatitude === null ||
    stop.mapLongitude === null ||
    !Number.isFinite(stop.mapLatitude) ||
    !Number.isFinite(stop.mapLongitude)
  ) {
    return null
  }

  return {
    latitude: stop.mapLatitude,
    longitude: stop.mapLongitude,
  }
}
