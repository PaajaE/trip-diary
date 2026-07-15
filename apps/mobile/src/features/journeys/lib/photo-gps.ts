export function isMeaningfulGpsCoordinate(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): latitude is number {
  if (
    latitude === null ||
    latitude === undefined ||
    longitude === null ||
    longitude === undefined
  ) {
    return false
  }

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return false
  }

  if (latitude === 0 && longitude === 0) {
    return false
  }

  return true
}

export function selectFirstPhotoGps(
  photos: Array<{ latitude: number | null; longitude: number | null }>,
): { latitude: number; longitude: number } | null {
  for (const photo of photos) {
    const { latitude, longitude } = photo
    if (
      isMeaningfulGpsCoordinate(latitude, longitude) &&
      typeof longitude === 'number'
    ) {
      return { latitude, longitude }
    }
  }

  return null
}
