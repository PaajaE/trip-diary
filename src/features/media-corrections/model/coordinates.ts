export interface Coordinates {
  latitude: number
  longitude: number
}

/** "50,0875" and "50.0875" both work; anything else is null. */
function parseDecimal(text: string): number | null {
  const normalised = text.trim().replace(',', '.')
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(normalised)) return null
  const value = Number(normalised)
  return Number.isFinite(value) ? value : null
}

/** Latitude -90..90 and longitude -180..180, or null when either is invalid. */
export function parseCoordinates(
  latitude: string,
  longitude: string,
): Coordinates | null {
  const lat = parseDecimal(latitude)
  const lng = parseDecimal(longitude)
  if (lat === null || lng === null) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { latitude: lat, longitude: lng }
}

/** Text for an input; six decimals are about 0.1 m. */
export function formatCoordinate(value: number): string {
  return value.toFixed(6)
}

/** The first item that has a position: where the picker map opens. */
export function firstPosition(
  items: readonly {
    latitude: number | null
    longitude: number | null
  }[],
): Coordinates | null {
  for (const item of items) {
    if (item.latitude !== null && item.longitude !== null) {
      return { latitude: item.latitude, longitude: item.longitude }
    }
  }
  return null
}
