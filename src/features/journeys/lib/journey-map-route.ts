import type { MapCoordinate } from '@trip-diary/utils'
import type { JourneyPhotoLocation } from '@/entities/photo/api/photo-location.repository'
import {
  sortJourneyMomentsChronologically,
  type JourneyMoment,
} from '@/features/journeys/lib/journey-content'

export type JourneyMapRouteSource = 'stored' | 'approximate' | 'none'

export interface JourneyMapRoute {
  coordinates: MapCoordinate[]
  source: JourneyMapRouteSource
}

export interface ResolveJourneyMapRouteInput {
  moments: JourneyMoment[]
  photoLocations?: JourneyPhotoLocation[]
  storedRoute?: readonly MapCoordinate[] | null
}

export function isValidMapCoordinate(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): latitude is number {
  return (
    latitude !== null &&
    latitude !== undefined &&
    longitude !== null &&
    longitude !== undefined &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  )
}

export function getMomentMapCoordinate(
  moment: JourneyMoment,
  photoLocations: JourneyPhotoLocation[],
): MapCoordinate | null {
  const photo = photoLocations.find(
    (candidate) => candidate.entryId === moment.entry.id,
  )
  if (
    photo !== undefined &&
    isValidMapCoordinate(photo.latitude, photo.longitude)
  ) {
    return { latitude: photo.latitude, longitude: photo.longitude }
  }

  if (
    moment.location !== null &&
    isValidMapCoordinate(moment.location.latitude, moment.location.longitude)
  ) {
    return moment.location
  }

  return null
}

export function resolveApproximateRouteCoordinates(
  moments: JourneyMoment[],
  photoLocations: JourneyPhotoLocation[] = [],
): MapCoordinate[] {
  const coordinates: MapCoordinate[] = []

  for (const moment of sortJourneyMomentsChronologically(moments)) {
    const coordinate = getMomentMapCoordinate(moment, photoLocations)
    if (coordinate !== null) {
      coordinates.push(coordinate)
    }
  }

  return collapseConsecutiveDuplicateCoordinates(coordinates)
}

function collapseConsecutiveDuplicateCoordinates(
  coordinates: MapCoordinate[],
): MapCoordinate[] {
  const collapsed: MapCoordinate[] = []

  for (const coordinate of coordinates) {
    const previous = collapsed.at(-1)
    if (
      previous?.latitude === coordinate.latitude &&
      previous.longitude === coordinate.longitude
    ) {
      continue
    }
    collapsed.push(coordinate)
  }

  return collapsed
}

function normalizeStoredRoute(
  storedRoute: readonly MapCoordinate[] | null | undefined,
): MapCoordinate[] {
  if (storedRoute === null || storedRoute === undefined) {
    return []
  }

  return storedRoute.filter((point) =>
    isValidMapCoordinate(point.latitude, point.longitude),
  )
}

export function resolveJourneyMapRoute(
  input: ResolveJourneyMapRouteInput,
): JourneyMapRoute {
  const stored = normalizeStoredRoute(input.storedRoute)
  if (stored.length >= 2) {
    return { coordinates: stored, source: 'stored' }
  }

  const approximate = resolveApproximateRouteCoordinates(
    input.moments,
    input.photoLocations ?? [],
  )

  if (approximate.length >= 2) {
    return { coordinates: approximate, source: 'approximate' }
  }

  return { coordinates: approximate, source: 'none' }
}

export function getPublicMapBoundsCoordinates(
  route: JourneyMapRoute,
  fallbackPoints: MapCoordinate[],
): MapCoordinate[] {
  if (route.coordinates.length > 0) {
    return route.coordinates
  }

  return fallbackPoints
}
