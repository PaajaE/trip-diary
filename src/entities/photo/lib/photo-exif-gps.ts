export interface ParsedPhotoGps {
  latitude?: number
  longitude?: number
}

export function parseNativeExifGps(
  exif: string | Record<string, unknown> | undefined,
): ParsedPhotoGps {
  const parsed = parseNativeExifInput(exif)
  if (parsed === undefined) {
    return {}
  }

  const latitude = readCoordinate(parsed, [
    'latitude',
    'gpslatitude',
    'gpslat',
  ])
  const longitude = readCoordinate(parsed, [
    'longitude',
    'gpslongitude',
    'gpslong',
    'gpslon',
  ])

  return {
    ...(latitude === undefined ? {} : { latitude }),
    ...(longitude === undefined ? {} : { longitude }),
  }
}

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

  return !(latitude === 0 && longitude === 0)
}

function parseNativeExifInput(
  exif: string | Record<string, unknown> | undefined,
): unknown {
  if (exif === undefined) {
    return undefined
  }

  if (typeof exif === 'string') {
    return safeJsonParse(exif)
  }

  if (typeof exif === 'object') {
    return exif
  }

  return undefined
}

function readCoordinate(source: unknown, keys: string[]): number | undefined {
  const coordinate = findValue(source, (key) => keys.includes(key))
  const reference = findValue(
    source,
    (key) =>
      (keys.includes('latitude') && key === 'gpslatituderef') ||
      (keys.includes('longitude') && key === 'gpslongituderef'),
  )

  const normalized = normalizeCoordinate(coordinate, reference)
  return normalized === undefined || !Number.isFinite(normalized)
    ? undefined
    : normalized
}

function findValue(
  source: unknown,
  matches: (normalizedKey: string) => boolean,
): unknown {
  if (source === null || typeof source !== 'object') {
    return undefined
  }

  if (Array.isArray(source)) {
    for (const item of source) {
      const match = findValue(item, matches)
      if (match !== undefined) {
        return match
      }
    }
    return undefined
  }

  for (const [key, value] of Object.entries(source)) {
    if (matches(key.toLowerCase())) {
      return value
    }
    const nested = findValue(value, matches)
    if (nested !== undefined) {
      return nested
    }
  }

  return undefined
}

function normalizeCoordinate(
  value: unknown,
  reference: unknown,
): number | undefined {
  const ref =
    typeof reference === 'string' && reference.length > 0
      ? reference.toUpperCase()
      : undefined

  if (typeof value === 'number' && Number.isFinite(value)) {
    return applyCoordinateReference(value, ref)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.includes(',')) {
      const parts = trimmed.split(',').map((part) => part.trim())
      if (parts.length >= 3) {
        const decimal = convertDmsToDecimal(parts[0], parts[1], parts[2])
        return decimal === undefined
          ? undefined
          : applyCoordinateReference(decimal, ref)
      }
    }

    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) {
      return applyCoordinateReference(parsed, ref)
    }
  }

  if (Array.isArray(value) && value.length >= 3) {
    const [degrees, minutes, seconds] = value as unknown[]
    const decimal = convertDmsToDecimal(degrees, minutes, seconds)
    return decimal === undefined
      ? undefined
      : applyCoordinateReference(decimal, ref)
  }

  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const decimal = convertDmsToDecimal(
      source.degrees ?? source.degree ?? source[0],
      source.minutes ?? source.minute ?? source[1],
      source.seconds ?? source.second ?? source[2],
    )
    return decimal === undefined
      ? undefined
      : applyCoordinateReference(decimal, ref)
  }

  return undefined
}

function convertDmsToDecimal(
  degreesValue: unknown,
  minutesValue: unknown,
  secondsValue: unknown,
) {
  const degrees = normalizeNumber(degreesValue)
  const minutes = normalizeNumber(minutesValue)
  const seconds = normalizeNumber(secondsValue)

  if (degrees === undefined || minutes === undefined || seconds === undefined) {
    return undefined
  }

  return Math.abs(degrees) + minutes / 60 + seconds / 3600
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.includes('/')) {
      const [numerator, denominator] = trimmed.split('/')
      const top = Number(numerator)
      const bottom = Number(denominator)
      if (Number.isFinite(top) && Number.isFinite(bottom) && bottom !== 0) {
        return top / bottom
      }
      return undefined
    }

    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}

function applyCoordinateReference(
  value: number,
  reference: string | undefined,
) {
  if (reference === 'S' || reference === 'W') {
    return -Math.abs(value)
  }

  return value
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}
