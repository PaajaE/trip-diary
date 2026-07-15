import type { MapCoordinate } from '@trip-diary/utils'
import type { JourneyPhotoLocation } from '@/entities/photo/api/photo-location.repository'
import type { JourneyMoment } from '@/features/journeys/lib/journey-content'
import {
  getPublicMapBoundsCoordinates,
  resolveJourneyMapRoute,
  type JourneyMapRoute,
} from '@/features/journeys/lib/journey-map-route'
import {
  getJourneyMapPoints,
  type JourneyMapPoint,
} from '@/features/journeys/ui/journey-map-points'

export function getPublicJourneyMapPoints(
  moments: JourneyMoment[],
  photoLocations: JourneyPhotoLocation[] = [],
): JourneyMapPoint[] {
  return getJourneyMapPoints(moments, [], photoLocations)
}

export function getMapPointIdForMoment(
  entryId: string,
  points: JourneyMapPoint[],
): string | null {
  const photoPoint = points.find(
    (point) => point.entryId === entryId && point.type === 'photo',
  )
  if (photoPoint !== undefined) {
    return photoPoint.id
  }

  const momentPoint = points.find(
    (point) => point.entryId === entryId && point.type === 'moment',
  )
  return momentPoint?.id ?? null
}

export function getEntryIdFromMapPoint(
  pointId: string | null,
  points: JourneyMapPoint[],
): string | null {
  if (pointId === null) {
    return null
  }

  const point = points.find((candidate) => candidate.id === pointId)
  return point?.entryId ?? null
}

export function mapPointsToCoordinates(
  points: JourneyMapPoint[],
): MapCoordinate[] {
  return points.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
  }))
}

export function resolvePublicJourneyMapRoute(
  moments: JourneyMoment[],
  photoLocations: JourneyPhotoLocation[] = [],
  storedRoute?: readonly MapCoordinate[] | null,
): JourneyMapRoute {
  return resolveJourneyMapRoute({
    moments,
    photoLocations,
    ...(storedRoute !== undefined ? { storedRoute } : {}),
  })
}

export function resolvePublicJourneyMapBoundsCoordinates(
  moments: JourneyMoment[],
  photoLocations: JourneyPhotoLocation[] = [],
  mapPoints: JourneyMapPoint[] = getPublicJourneyMapPoints(
    moments,
    photoLocations,
  ),
  storedRoute?: readonly MapCoordinate[] | null,
): MapCoordinate[] {
  const route = resolvePublicJourneyMapRoute(
    moments,
    photoLocations,
    storedRoute,
  )

  return getPublicMapBoundsCoordinates(route, mapPointsToCoordinates(mapPoints))
}

export function momentHasMapMarker(
  entryId: string,
  points: JourneyMapPoint[],
): boolean {
  return getMapPointIdForMoment(entryId, points) !== null
}

export function resolvePublicMapFocusPointId(
  activeMomentId: string | null,
  pendingMapPhotoId: string | null,
  mapPoints: JourneyMapPoint[],
): string | null {
  if (pendingMapPhotoId !== null) {
    const photoPointId = `photo:${pendingMapPhotoId}`
    if (mapPoints.some((point) => point.id === photoPointId)) {
      return photoPointId
    }
  }

  if (activeMomentId !== null) {
    return getMapPointIdForMoment(activeMomentId, mapPoints)
  }

  return null
}
