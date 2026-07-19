import { getMeaningfulGpsCoordinates } from '@trip-diary/utils'

/** Coerce Supabase numeric/string GPS fields into finite numbers. */
export function readPhotoCoordinate(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length === 0) {
      return null
    }
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

export function readMeaningfulPhotoGps(
  latitude: unknown,
  longitude: unknown,
): { latitude: number; longitude: number } | null {
  return getMeaningfulGpsCoordinates(
    readPhotoCoordinate(latitude),
    readPhotoCoordinate(longitude),
  )
}
