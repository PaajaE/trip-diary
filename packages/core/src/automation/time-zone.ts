import tzLookup from '@photostructure/tz-lookup'

/** IANA time zone at a position (offline lookup; oceans map to Etc/GMT±N). */
export function timeZoneAt(latitude: number, longitude: number): string {
  return tzLookup(latitude, longitude)
}

/** UTC offset of `timeZone` at `instantMs`, in minutes (e.g. -360 for MDT). */
export function zoneOffsetMinutes(timeZone: string, instantMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(instantMs))
  const name = parts.find((part) => part.type === 'timeZoneName')?.value ?? ''
  const match = /^GMT(?:([+-])(\d{2}):(\d{2}))?$/.exec(name)
  if (match === null) {
    throw new Error(`Unsupported offset format "${name}" for ${timeZone}`)
  }
  const [, sign, hours, minutes] = match
  if (sign === undefined || hours === undefined || minutes === undefined) {
    return 0
  }
  const total = Number(hours) * 60 + Number(minutes)
  return sign === '-' ? -total : total
}

export interface CaptureZoneInput {
  /** Exact capture instant (ISO 8601). */
  capturedAt: string
  /** UTC offset recorded by the camera (EXIF OffsetTimeOriginal), if any. */
  exifOffsetMinutes: number | null
  /** Journey home zone, used when nothing better is known. */
  homeTimeZone: string | null
  latitude: number | null
  longitude: number | null
}

export interface CaptureZone {
  source: 'gps' | 'exif-offset' | 'home'
  timeZone: string
}

/**
 * Picks the time zone a media item was captured in (plan chapter 4.2):
 * GPS position first, then the camera's recorded offset, then the journey
 * home zone. Returns null when nothing is known.
 */
export function resolveCaptureZone(
  input: CaptureZoneInput,
): CaptureZone | null {
  if (input.latitude !== null && input.longitude !== null) {
    return {
      source: 'gps',
      timeZone: timeZoneAt(input.latitude, input.longitude),
    }
  }

  const instantMs = Date.parse(input.capturedAt)
  if (input.exifOffsetMinutes !== null && !Number.isNaN(instantMs)) {
    if (
      input.homeTimeZone !== null &&
      zoneOffsetMinutes(input.homeTimeZone, instantMs) ===
        input.exifOffsetMinutes
    ) {
      return { source: 'home', timeZone: input.homeTimeZone }
    }
    if (input.exifOffsetMinutes % 60 === 0) {
      // POSIX-style names invert the sign: UTC-6 is "Etc/GMT+6".
      const hours = -input.exifOffsetMinutes / 60
      const name =
        hours === 0
          ? 'Etc/GMT'
          : `Etc/GMT${hours > 0 ? '+' : ''}${String(hours)}`
      return { source: 'exif-offset', timeZone: name }
    }
  }

  return input.homeTimeZone === null
    ? null
    : { source: 'home', timeZone: input.homeTimeZone }
}

/**
 * Converts a wall-clock time without offset (EXIF DateTimeOriginal such as
 * "2026:09:11 12:00:00") into an exact instant in `timeZone`. Used for media
 * whose camera did not record an offset, where PhotoKit guessed the device
 * zone instead.
 */
export function wallClockToInstant(
  wallClock: string,
  timeZone: string,
): string | null {
  const match =
    /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(
      wallClock.trim(),
    )
  if (match === null) {
    return null
  }
  const [, year, month, day, hour, minute, second] = match.map(Number)
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined
  ) {
    return null
  }
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  // Two passes settle the offset also next to DST transitions.
  let instant = asUtc - zoneOffsetMinutes(timeZone, asUtc) * 60_000
  instant = asUtc - zoneOffsetMinutes(timeZone, instant) * 60_000
  return new Date(instant).toISOString()
}
