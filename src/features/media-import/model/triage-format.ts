/** Date formatting for the import flow. Day keys are 'YYYY-MM-DD' strings. */

function dayDate(key: string): Date {
  return new Date(`${key}T12:00:00.000Z`)
}

/** "3.–11. 8. 2026" (cs) for two day keys; one date when they are equal. */
export function formatDayRange(
  first: string,
  last: string,
  locale: string,
): string {
  const format = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'numeric',
    timeZone: 'UTC',
    year: 'numeric',
  })
  if (first === last) return format.format(dayDate(first))
  if (locale.startsWith('cs') && first.slice(0, 7) === last.slice(0, 7)) {
    // "3.–11. 8. 2026": the form the mockup uses, independent of ICU version.
    return `${String(Number(first.slice(8)))}.–${String(Number(last.slice(8)))}. ${String(Number(first.slice(5, 7)))}. ${first.slice(0, 4)}`
  }
  return format.formatRange(dayDate(first), dayDate(last))
}

/** "Út 4. 8." for a day key. */
export function formatDayHeading(key: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'numeric',
    timeZone: 'UTC',
    weekday: 'short',
  }).format(dayDate(key))
}

/** "3. 8." for a day key. */
export function formatDayShort(key: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'numeric',
    timeZone: 'UTC',
  }).format(dayDate(key))
}

/** "14:07" of an instant in the device calendar zone. */
export function formatTime(
  instant: string,
  locale: string,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    timeZone,
  }).format(Date.parse(instant))
}

export interface RoutePoint {
  latitude: number
  longitude: number
}

/**
 * Fits points into a width x height box (with padding) keeping the aspect
 * ratio roughly; a single point lands in the middle.
 */
export function projectRoute(
  points: readonly RoutePoint[],
  width: number,
  height: number,
  pad: number,
): { x: number; y: number }[] {
  if (points.length === 0) return []
  const lons = points.map((p) => p.longitude)
  const lats = points.map((p) => p.latitude)
  const minLon = Math.min(...lons)
  const maxLon = Math.max(...lons)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const spanLon = maxLon - minLon
  const spanLat = maxLat - minLat
  const innerW = width - 2 * pad
  const innerH = height - 2 * pad
  return points.map((p) => ({
    x:
      spanLon === 0
        ? width / 2
        : pad + ((p.longitude - minLon) / spanLon) * innerW,
    y:
      spanLat === 0
        ? height / 2
        : pad + (1 - (p.latitude - minLat) / spanLat) * innerH,
  }))
}
