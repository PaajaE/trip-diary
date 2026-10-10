import exifr from 'exifr'
import {
  resolveCaptureZone,
  timeZoneAt,
  wallClockToInstant,
} from '@trip-diary/core/automation'
import {
  parseExifCaptureInstant,
  parseExifOffsetMinutes,
} from '@trip-diary/utils'

export interface RawExifTime {
  dateTimeOriginal: string | null
  offsetTimeOriginal: string | null
  subsecTimeOriginal: string | null
}

export interface CaptureTime {
  capturedAt: string | null
  capturedTz: string | null
}

/**
 * Capture instant (UTC) plus IANA zone, never derived from the device clock
 * or zone. With an EXIF offset the instant is exact; without one the wall
 * clock is only interpreted in the GPS zone. Otherwise both are null.
 */
export function resolveCaptureTime(
  exif: RawExifTime,
  position: { latitude: number | null; longitude: number | null },
): CaptureTime {
  const none = { capturedAt: null, capturedTz: null }
  if (exif.dateTimeOriginal === null) {
    return none
  }
  const hasPosition = position.latitude !== null && position.longitude !== null

  const exact = parseExifCaptureInstant(
    exif.dateTimeOriginal,
    exif.offsetTimeOriginal,
    exif.subsecTimeOriginal,
  )
  if (exact !== null) {
    const zone = resolveCaptureZone({
      capturedAt: exact.instant,
      exifOffsetMinutes: parseExifOffsetMinutes(exif.offsetTimeOriginal),
      homeTimeZone: null,
      latitude: position.latitude,
      longitude: position.longitude,
    })
    return { capturedAt: exact.instant, capturedTz: zone?.timeZone ?? null }
  }

  if (
    hasPosition &&
    position.latitude !== null &&
    position.longitude !== null
  ) {
    const timeZone = timeZoneAt(position.latitude, position.longitude)
    const instant = wallClockToInstant(exif.dateTimeOriginal, timeZone)
    return instant === null
      ? none
      : { capturedAt: instant, capturedTz: timeZone }
  }
  return none
}

/** Reads raw (unrevived) EXIF time strings so no local zone is applied. */
export async function readRawExifTime(file: File): Promise<RawExifTime> {
  const empty = {
    dateTimeOriginal: null,
    offsetTimeOriginal: null,
    subsecTimeOriginal: null,
  }
  try {
    const tags = (await exifr.parse(await file.arrayBuffer(), {
      pick: ['DateTimeOriginal', 'OffsetTimeOriginal', 'SubSecTimeOriginal'],
      reviveValues: false,
    })) as Record<string, unknown> | undefined
    const text = (value: unknown): string | null =>
      typeof value === 'string'
        ? value
        : typeof value === 'number'
          ? String(value)
          : null
    return {
      dateTimeOriginal: text(tags?.DateTimeOriginal),
      offsetTimeOriginal: text(tags?.OffsetTimeOriginal),
      subsecTimeOriginal: text(tags?.SubSecTimeOriginal),
    }
  } catch {
    return empty
  }
}
