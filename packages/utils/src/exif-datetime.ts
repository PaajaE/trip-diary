const EXIF_DATE_TIME_PATTERN =
  /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/
const EXIF_OFFSET_PATTERN = /^([+-])(\d{2}):(\d{2})$/

export interface ExifCaptureInstant {
  /** Exact capture instant as UTC ISO-8601. */
  instant: string
  /** UTC offset at the capture place, in minutes (e.g. -360 for MDT). */
  offsetMinutes: number
}

/** Parses an EXIF `OffsetTime*` value such as `-06:00` into minutes. */
export function parseExifOffsetMinutes(
  value: string | null | undefined,
): number | null {
  if (typeof value !== 'string') {
    return null
  }
  const match = EXIF_OFFSET_PATTERN.exec(value.trim())
  if (match === null) {
    return null
  }
  const [, sign, hours, minutes] = match
  const total = Number(hours) * 60 + Number(minutes)
  if (total > 14 * 60) {
    return null
  }
  return sign === '-' ? -total : total
}

/**
 * Combines EXIF `DateTimeOriginal` (local wall clock, no zone) with
 * `OffsetTimeOriginal` into an exact instant.
 *
 * Returns null when either part is missing or invalid: without the offset the
 * wall clock is ambiguous and must not be guessed from the device timezone.
 */
export function parseExifCaptureInstant(
  dateTimeOriginal: string | null | undefined,
  offsetTimeOriginal: string | null | undefined,
  subsecTimeOriginal?: string | null,
): ExifCaptureInstant | null {
  if (typeof dateTimeOriginal !== 'string') {
    return null
  }
  const offsetMinutes = parseExifOffsetMinutes(offsetTimeOriginal)
  if (offsetMinutes === null) {
    return null
  }
  const match = EXIF_DATE_TIME_PATTERN.exec(dateTimeOriginal.trim())
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

  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  const check = new Date(wallClockAsUtc)
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    check.getUTCSeconds() !== second
  ) {
    return null
  }

  const subsecond = parseSubsecondMs(subsecTimeOriginal)
  const instantMs = wallClockAsUtc - offsetMinutes * 60_000 + subsecond

  return {
    instant: new Date(instantMs).toISOString(),
    offsetMinutes,
  }
}

function parseSubsecondMs(value: string | null | undefined): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
    return 0
  }
  const digits = value.trim().slice(0, 3).padEnd(3, '0')
  return Number(digits)
}
