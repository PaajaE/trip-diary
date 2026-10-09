import { parseExifCaptureInstant } from '@trip-diary/utils'
import type {
  MediaLibraryAsset,
  MediaLibraryEmbeddedMetadata,
} from '@/shared/lib/media-library'

/** Max distance between PHAsset location and EXIF GPS to count as a match. */
const LOCATION_TOLERANCE_DEGREES = 0.0001
/** Max difference between PHAsset creationDate and EXIF instant. */
const TIME_TOLERANCE_MS = 1000

export type CheckResult = 'match' | 'mismatch' | 'not-comparable'

export interface AssetDiagnostic {
  asset: MediaLibraryAsset
  exifInstant: string | null
  exifOffsetMinutes: number | null
  hasExifGps: boolean
  hasLocation: boolean
  location: CheckResult
  time: CheckResult
}

export interface LibraryDiagnosticsSummary {
  assets: number
  images: number
  locationMatches: number
  locationMismatches: number
  /** Images whose EXIF has GPS but PHAsset has no location — must be 0. */
  locationMissing: number
  timeMatches: number
  timeMismatches: number
  videos: number
  withExifOffset: number
  withLocation: number
}

export function diagnoseAsset(
  asset: MediaLibraryAsset,
  metadata: MediaLibraryEmbeddedMetadata | null,
): AssetDiagnostic {
  const hasLocation =
    asset.latitude !== undefined && asset.longitude !== undefined
  const exifGps =
    metadata?.gpsLatitude !== undefined && metadata.gpsLongitude !== undefined
      ? { latitude: metadata.gpsLatitude, longitude: metadata.gpsLongitude }
      : null
  const exif =
    metadata === null
      ? null
      : parseExifCaptureInstant(
          metadata.dateTimeOriginal,
          metadata.offsetTimeOriginal,
          metadata.subsecTimeOriginal,
        )

  return {
    asset,
    exifInstant: exif?.instant ?? null,
    exifOffsetMinutes: exif?.offsetMinutes ?? null,
    hasExifGps: exifGps !== null,
    hasLocation,
    location: compareLocation(asset, exifGps),
    time: compareTime(asset.creationDate, exif?.instant ?? null),
  }
}

export function summarizeDiagnostics(
  diagnostics: readonly AssetDiagnostic[],
): LibraryDiagnosticsSummary {
  const count = (predicate: (item: AssetDiagnostic) => boolean) =>
    diagnostics.filter(predicate).length

  return {
    assets: diagnostics.length,
    images: count((item) => item.asset.mediaType === 'image'),
    locationMatches: count((item) => item.location === 'match'),
    locationMismatches: count((item) => item.location === 'mismatch'),
    locationMissing: count((item) => item.hasExifGps && !item.hasLocation),
    timeMatches: count((item) => item.time === 'match'),
    timeMismatches: count((item) => item.time === 'mismatch'),
    videos: count((item) => item.asset.mediaType === 'video'),
    withExifOffset: count((item) => item.exifOffsetMinutes !== null),
    withLocation: count((item) => item.hasLocation),
  }
}

function compareLocation(
  asset: MediaLibraryAsset,
  exifGps: { latitude: number; longitude: number } | null,
): CheckResult {
  if (exifGps === null) {
    return 'not-comparable'
  }
  if (asset.latitude === undefined || asset.longitude === undefined) {
    return 'mismatch'
  }
  return Math.abs(asset.latitude - exifGps.latitude) <=
    LOCATION_TOLERANCE_DEGREES &&
    Math.abs(asset.longitude - exifGps.longitude) <= LOCATION_TOLERANCE_DEGREES
    ? 'match'
    : 'mismatch'
}

function compareTime(
  creationDate: string | undefined,
  exifInstant: string | null,
): CheckResult {
  if (creationDate === undefined || exifInstant === null) {
    return 'not-comparable'
  }
  const difference = Math.abs(
    new Date(creationDate).getTime() - new Date(exifInstant).getTime(),
  )
  return difference <= TIME_TOLERANCE_MS ? 'match' : 'mismatch'
}
