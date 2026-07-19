import type { MapCoordinate, JourneyMapCamera } from './journey-map-camera.ts'
import { computeJourneyStopMapCamera } from './journey-map-camera.ts'

export interface PhotoMapPoint {
  id: string
  latitude: number
  longitude: number
}

const NULL_ISLAND_EPSILON = 1e-6

/**
 * Reject non-finite coords and the common accidental (0,0) Null Island pin
 * unless callers explicitly allow it.
 */
export function isValidPhotoMapCoordinate(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  options: { allowNullIsland?: boolean } = {},
): latitude is number {
  if (
    latitude === null ||
    latitude === undefined ||
    longitude === null ||
    longitude === undefined ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return false
  }

  if (options.allowNullIsland === true) {
    return true
  }

  return !(
    Math.abs(latitude) < NULL_ISLAND_EPSILON &&
    Math.abs(longitude) < NULL_ISLAND_EPSILON
  )
}

function toValidCoordinate(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): MapCoordinate | null {
  if (
    latitude === null ||
    latitude === undefined ||
    longitude === null ||
    longitude === undefined ||
    !isValidPhotoMapCoordinate(latitude, longitude)
  ) {
    return null
  }
  return { latitude, longitude }
}

export function collectValidPhotoMapPoints(
  photos: readonly {
    id: string
    latitude: number | null | undefined
    longitude: number | null | undefined
  }[],
): PhotoMapPoint[] {
  const points: PhotoMapPoint[] = []
  for (const photo of photos) {
    const coordinate = toValidCoordinate(photo.latitude, photo.longitude)
    if (coordinate === null) {
      continue
    }
    points.push({
      id: photo.id,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
    })
  }
  return points
}

/**
 * Fit a map camera to every geotagged photo. Builds on
 * `computeJourneyStopMapCamera` (padding, max zoom, antimeridian unwrap)
 * after filtering invalid / Null Island coordinates.
 */
export function computePhotoMapCamera(
  photos: readonly {
    id?: string
    latitude: number | null | undefined
    longitude: number | null | undefined
  }[],
  options?: Parameters<typeof computeJourneyStopMapCamera>[1],
): JourneyMapCamera | null {
  const coordinates: MapCoordinate[] = []
  for (const photo of photos) {
    const coordinate = toValidCoordinate(photo.latitude, photo.longitude)
    if (coordinate === null) {
      continue
    }
    coordinates.push(coordinate)
  }
  return computeJourneyStopMapCamera(coordinates, options)
}
