import { compareText } from './compare.ts'
import type { GeoPoint } from './geo.ts'

/** What a resolved place is (same values as `PlaceKind` of the journey plan). */
export type MediaPlaceKind =
  | 'settlement'
  | 'natural'
  | 'attraction'
  | 'near'
  | 'region'
  | 'country'

/** Minimal media shape the automation works with. */
export interface MediaPoint {
  /** Altitude in metres, when known (separates climbing from driving). */
  altitude?: number | null
  /** Exact capture instant (ISO 8601 with offset) or null when unknown. */
  capturedAt: string | null
  /** IANA zone the photo was taken in (media captured_tz), when known. */
  capturedTz?: string | null
  /**
   * Normalised capture device (EXIF make + model), null when unknown. Together
   * with `ownerId` it forms a stream (ZS-3). Optional so older callers compile.
   */
  device?: string | null
  /** Video length; a video occupies [capturedAt, capturedAt + duration]. */
  durationMs?: number | null
  id: string
  kind?: 'photo' | 'video' | null
  latitude: number | null
  longitude: number | null
  /** Id of the still when this video is the clip of a Live Photo. */
  livePhotoOf?: string | null
  /**
   * Kind of the place the media was geocoded to (within ~150 m), when known.
   * Optional input of the movement logic: a photo at a known place is a stop,
   * never a collapsed "en route" photo.
   */
  placeKind?: MediaPlaceKind | null
  /** Author of the media (stream key for parallel stops). */
  ownerId?: string | null
}

export interface DatedMediaPoint extends MediaPoint {
  capturedAt: string
  /** Parsed capture instant in epoch milliseconds. */
  time: number
}

/** A real fix: finite, in range and not the (0, 0) "null island" default. */
export function validFix(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    !(latitude === 0 && longitude === 0)
  )
}

/** The position of a media item; an invalid fix counts as no position. */
export function pointOf(media: MediaPoint): GeoPoint | null {
  return media.latitude === null ||
    media.longitude === null ||
    !validFix(media.latitude, media.longitude)
    ? null
    : { latitude: media.latitude, longitude: media.longitude }
}

/** A video never lasts longer than this for the automation (a day). */
export const MAX_MEDIA_DURATION_MS = 24 * 3_600_000

/** Video length in ms; NaN, Infinity and negative values count as 0. */
export function durationOf(media: MediaPoint): number {
  const value = media.durationMs
  return value === null ||
    value === undefined ||
    !Number.isFinite(value) ||
    value < 0
    ? 0
    : Math.min(value, MAX_MEDIA_DURATION_MS)
}

/** ISO 8601 date-time with an explicit offset (`Z` or `+hh:mm`). */
const INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/

/**
 * Parses a capture instant. Only ISO 8601 with an offset is accepted: a value
 * without one would be read in the local zone of the machine, which makes the
 * result depend on where the code runs. Invalid values give NaN.
 */
export function parseInstant(value: string): number {
  return INSTANT_PATTERN.test(value) ? Date.parse(value) : Number.NaN
}

/**
 * Keeps media with a valid capture time, sorted by time then id so results do
 * not depend on input order.
 */
export function sortDated(media: readonly MediaPoint[]): {
  dated: DatedMediaPoint[]
  undated: MediaPoint[]
} {
  const dated: DatedMediaPoint[] = []
  const undated: MediaPoint[] = []
  for (const item of media) {
    const time =
      item.capturedAt === null ? Number.NaN : parseInstant(item.capturedAt)
    if (item.capturedAt === null || Number.isNaN(time)) {
      undated.push(item)
    } else {
      dated.push({ ...item, capturedAt: item.capturedAt, time })
    }
  }
  dated.sort((a, b) => a.time - b.time || compareText(a.id, b.id))
  return { dated, undated }
}
