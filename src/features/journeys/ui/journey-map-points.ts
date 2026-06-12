import type { JourneyDetail } from '@/entities/journey/model/journey'
import type { JourneyMoment } from '@/features/journeys/lib/journey-content'

export interface JourneyMapPoint {
  entryId: string | null
  id: string
  latitude: number
  longitude: number
  title: string
  type: 'moment' | 'planned'
}

export function getJourneyMapPoints(
  moments: JourneyMoment[],
  plannedStops: JourneyDetail['stops'],
): JourneyMapPoint[] {
  const points: JourneyMapPoint[] = []
  const usedEntryIds = new Set<string>()
  const usedStopIds = new Set<string>()

  for (const moment of moments) {
    if (moment.location === null || usedEntryIds.has(moment.entry.id)) {
      continue
    }
    const coordinates = getValidCoordinates(
      moment.location.latitude,
      moment.location.longitude,
    )
    if (coordinates === null) {
      continue
    }

    usedEntryIds.add(moment.entry.id)
    if (moment.stop !== null) {
      usedStopIds.add(moment.stop.id)
    }
    points.push({
      entryId: moment.entry.id,
      id: `moment:${moment.entry.id}`,
      ...coordinates,
      title: moment.entry.title ?? moment.stop?.title ?? '',
      type: 'moment',
    })
  }

  for (const stop of plannedStops) {
    const coordinates = getValidCoordinates(stop.mapLatitude, stop.mapLongitude)
    if (coordinates === null || usedStopIds.has(stop.id)) {
      continue
    }

    usedStopIds.add(stop.id)
    points.push({
      entryId: null,
      id: `planned:${stop.id}`,
      ...coordinates,
      title: stop.title,
      type: 'planned',
    })
  }

  return points
}

function getValidCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
) {
  return latitude !== null &&
    latitude !== undefined &&
    longitude !== null &&
    longitude !== undefined &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
    ? { latitude, longitude }
    : null
}
