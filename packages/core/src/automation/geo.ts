export interface GeoPoint {
  latitude: number
  longitude: number
}

const EARTH_RADIUS_KM = 6371.0088

/** Great-circle distance in kilometres (haversine). */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Longitude difference `to - from` folded into [-180, 180] (antimeridian). */
export function lonDelta(from: number, to: number): number {
  let delta = (to - from) % 360
  if (delta > 180) delta -= 360
  else if (delta < -180) delta += 360
  return delta
}

/** Longitude folded into [-180, 180]. */
export function wrapLon(longitude: number): number {
  return lonDelta(0, longitude)
}

/**
 * Arithmetic mean of points; fine for the small extent of one moment. The
 * longitude is averaged relative to the first point, so a group across the
 * antimeridian (Fiji, Chukotka) does not end up on the other side of Earth.
 */
export function centroid(points: readonly GeoPoint[]): GeoPoint | null {
  const first = points[0]
  if (first === undefined) {
    return null
  }
  let latitude = 0
  let offset = 0
  for (const point of points) {
    latitude += point.latitude
    offset += lonDelta(first.longitude, point.longitude)
  }
  return {
    latitude: latitude / points.length,
    longitude: wrapLon(first.longitude + offset / points.length),
  }
}
