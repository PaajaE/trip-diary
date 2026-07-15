export interface MapCoordinate {
  latitude: number
  longitude: number
}

export interface JourneyMapBoundsCamera {
  maxZoomLevel: number
  ne: [number, number]
  padding: number
  sw: [number, number]
  type: 'bounds'
}

export interface JourneyMapCenterCamera {
  center: MapCoordinate
  type: 'center'
  zoomLevel: number
}

export type JourneyMapCamera = JourneyMapBoundsCamera | JourneyMapCenterCamera

export interface ComputeJourneyStopMapCameraOptions {
  boundsPadding?: number
  identicalCoordinatePadDegrees?: number
  maxFitZoomLevel?: number
  multiStopPadDegrees?: number
  singleStopPadDegrees?: number
  singleStopZoomLevel?: number
}

const DEFAULT_OPTIONS: Required<ComputeJourneyStopMapCameraOptions> = {
  boundsPadding: 48,
  identicalCoordinatePadDegrees: 0.02,
  maxFitZoomLevel: 14,
  multiStopPadDegrees: 0.04,
  singleStopPadDegrees: 0.08,
  singleStopZoomLevel: 12,
}

function clampLatitude(latitude: number): number {
  return Math.max(-90, Math.min(90, latitude))
}

function wrapLongitude(longitude: number): number {
  if (longitude > 180) {
    return longitude - 360
  }

  if (longitude < -180) {
    return longitude + 360
  }

  return longitude
}

function unwrapLongitudes(longitudes: number[]): number[] {
  const hasPositive = longitudes.some((longitude) => longitude >= 0)
  const hasNegative = longitudes.some((longitude) => longitude < 0)

  if (!hasPositive || !hasNegative) {
    return longitudes
  }

  const rawSpan = Math.max(...longitudes) - Math.min(...longitudes)
  if (rawSpan <= 180) {
    return longitudes
  }

  return longitudes.map((longitude) =>
    longitude < 0 ? longitude + 360 : longitude,
  )
}

export function computeJourneyStopMapCamera(
  points: readonly MapCoordinate[],
  options: ComputeJourneyStopMapCameraOptions = {},
): JourneyMapCamera | null {
  const resolved = { ...DEFAULT_OPTIONS, ...options }

  if (points.length === 0) {
    return null
  }

  const normalizedPoints = points.map((point) => ({
    latitude: clampLatitude(point.latitude),
    longitude: wrapLongitude(point.longitude),
  }))

  if (normalizedPoints.length === 1) {
    const [point] = normalizedPoints
    if (point === undefined) {
      return null
    }

    return {
      center: point,
      type: 'center',
      zoomLevel: resolved.singleStopZoomLevel,
    }
  }

  const latitudes = normalizedPoints.map((point) => point.latitude)
  const longitudes = normalizedPoints.map((point) => point.longitude)
  const unwrappedLongitudes = unwrapLongitudes(longitudes)

  let minLatitude = Math.min(...latitudes)
  let maxLatitude = Math.max(...latitudes)
  let minLongitude = Math.min(...unwrappedLongitudes)
  let maxLongitude = Math.max(...unwrappedLongitudes)

  if (
    minLatitude === maxLatitude &&
    minLongitude === maxLongitude
  ) {
    return {
      center: {
        latitude: minLatitude,
        longitude: wrapLongitude(minLongitude),
      },
      type: 'center',
      zoomLevel: resolved.singleStopZoomLevel,
    }
  }

  const pad = resolved.multiStopPadDegrees
  minLatitude = clampLatitude(minLatitude - pad)
  maxLatitude = clampLatitude(maxLatitude + pad)
  minLongitude = minLongitude - pad
  maxLongitude = maxLongitude + pad

  return {
    maxZoomLevel: resolved.maxFitZoomLevel,
    ne: [wrapLongitude(maxLongitude), maxLatitude],
    padding: resolved.boundsPadding,
    sw: [wrapLongitude(minLongitude), minLatitude],
    type: 'bounds',
  }
}
