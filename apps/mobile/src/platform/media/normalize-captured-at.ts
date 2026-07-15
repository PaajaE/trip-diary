const EXIF_CAPTURED_AT_PATTERN =
  /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/

/**
 * Normalizes photo capture timestamps for Postgres `timestamptz`.
 *
 * Web converts EXIF dates via `exifr` → `Date` → `toISOString()`. Mobile ImagePicker
 * exposes EXIF as `YYYY:MM:DD HH:mm:ss` without timezone. We interpret that string as
 * local wall-clock components (device timezone), then emit UTC ISO-8601 — the same
 * conversion `Date` would apply before `toISOString()`.
 *
 * Invalid values return null so metadata never blocks upload.
 */
export function normalizePhotoCapturedAt(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }

  if (trimmed.includes('/')) {
    return null
  }

  const exifMatch = EXIF_CAPTURED_AT_PATTERN.exec(trimmed)
  if (exifMatch !== null) {
    return exifWallClockToIso(exifMatch)
  }

  if (trimmed.includes(':') && !trimmed.includes('T')) {
    return null
  }

  const parsed = Date.parse(trimmed)
  if (!Number.isFinite(parsed)) {
    return null
  }

  const date = new Date(parsed)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toISOString()
}

function exifWallClockToIso(match: RegExpExecArray): string | null {
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null
  }

  const date = new Date(year, month - 1, day, hour, minute, second)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return null
  }

  return date.toISOString()
}
