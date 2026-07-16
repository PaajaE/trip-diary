import {
  getMeaningfulGpsCoordinates,
  isMeaningfulGpsCoordinate,
} from '@trip-diary/utils'

export { isMeaningfulGpsCoordinate }

export function selectFirstPhotoGps(
  photos: Array<{ latitude: number | null; longitude: number | null }>,
): { latitude: number; longitude: number } | null {
  for (const photo of photos) {
    const meaningful = getMeaningfulGpsCoordinates(
      photo.latitude,
      photo.longitude,
    )
    if (meaningful !== null) {
      return meaningful
    }
  }

  return null
}

export function selectCoverPhotoGps(
  photos: Array<{
    isCover?: boolean
    latitude: number | null
    longitude: number | null
  }>,
): { latitude: number; longitude: number } | null {
  const cover = photos.find((photo) => photo.isCover === true)
  if (cover !== undefined) {
    const fromCover = getMeaningfulGpsCoordinates(
      cover.latitude,
      cover.longitude,
    )
    if (fromCover !== null) {
      return fromCover
    }
  }

  return selectFirstPhotoGps(photos)
}
