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

/** Arithmetic mean of points; fine for the small extent of one moment. */
export function centroid(points: readonly GeoPoint[]): GeoPoint | null {
  if (points.length === 0) {
    return null
  }
  let latitude = 0
  let longitude = 0
  for (const point of points) {
    latitude += point.latitude
    longitude += point.longitude
  }
  return {
    latitude: latitude / points.length,
    longitude: longitude / points.length,
  }
}
