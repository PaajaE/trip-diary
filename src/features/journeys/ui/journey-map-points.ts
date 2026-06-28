import type { JourneyDetail } from '@/entities/journey/model/journey'
import type { JourneyPhotoLocation } from '@/entities/photo/api/photo-location.repository'
import type { JourneyMoment } from '@/features/journeys/lib/journey-content'

export type JourneyMapPointType = 'moment' | 'photo' | 'planned'

export interface JourneyMapPoint {
  entryId: string | null
  id: string
  latitude: number
  longitude: number
  photoId: string | null
  title: string
  type: JourneyMapPointType
}

export function getJourneyMapPoints(
  moments: JourneyMoment[],
  plannedStops: JourneyDetail['stops'],
  photoLocations: JourneyPhotoLocation[] = [],
): JourneyMapPoint[] {
  const points: JourneyMapPoint[] = []
  const usedPhotoIds = new Set<string>()
  const entriesWithPhotoPins = new Set<string>()
  const usedEntryIds = new Set<string>()
  const usedStopIds = new Set<string>()

  for (const photo of photoLocations) {
    const coordinates = getValidCoordinates(photo.latitude, photo.longitude)
    if (coordinates === null || usedPhotoIds.has(photo.id)) {
      continue
    }

    usedPhotoIds.add(photo.id)
    entriesWithPhotoPins.add(photo.entryId)
    points.push({
      entryId: photo.entryId,
      id: `photo:${photo.id}`,
      photoId: photo.id,
      ...coordinates,
      title: photo.entryTitle ?? '',
      type: 'photo',
    })
  }

  for (const moment of moments) {
    if (
      moment.location === null ||
      usedEntryIds.has(moment.entry.id) ||
      entriesWithPhotoPins.has(moment.entry.id)
    ) {
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
      photoId: null,
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
      photoId: null,
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
