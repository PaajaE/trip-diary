/**
 * Canonical video policy shared by web, mobile, and maintenance scripts.
 *
 * Permanent cloud objects per video:
 *   video.mp4  — canonical H.264/AAC MP4
 *   small.jpg  — ~800px poster
 *   thumb.jpg  — ~220px poster
 */

export type MediaType = 'photo' | 'video'

export type VideoVariantKind = 'video'

/** All variant kinds including video canonical + poster image variants. */
export type MediaVariantKind =
  | 'thumb'
  | 'small'
  | 'medium'
  | 'full'
  | 'preview'
  | 'large'
  | 'video'

export const VIDEO_CANONICAL_VARIANT: VideoVariantKind = 'video'

/** Poster variants uploaded for every video. */
export const VIDEO_POSTER_VARIANTS = ['thumb', 'small'] as const
export type VideoPosterVariant = (typeof VIDEO_POSTER_VARIANTS)[number]

/** Max clip duration accepted by the product (seconds). */
export const VIDEO_MAX_DURATION_SECONDS = 180

/** Max canonical video file size before upload (bytes). */
export const VIDEO_MAX_CANONICAL_BYTES = 80 * 1024 * 1024

/** Storage bucket ceiling — operational headroom, not product limit. */
export const VIDEO_BUCKET_FILE_SIZE_LIMIT_BYTES = 100 * 1024 * 1024

/** Poster frame extraction offset when duration is unknown or very short (ms). */
export const VIDEO_POSTER_TIME_MS = 500

/** Variants synced for video media. */
export const VIDEO_UPLOAD_VARIANTS: readonly MediaVariantKind[] = [
  'video',
  'thumb',
  'small',
] as const

/** Gallery contexts must never download the video variant. */
export const VIDEO_POSTER_PREFERENCE: readonly VideoPosterVariant[] = [
  'small',
  'thumb',
]

const MP4_FTYP = new Uint8Array([0x66, 0x74, 0x79, 0x70]) // 'ftyp'

export function isMediaType(value: string): value is MediaType {
  return value === 'photo' || value === 'video'
}

export function isVideoVariantKind(value: string): value is VideoVariantKind {
  return value === 'video'
}

export function buildVideoStoragePath(
  creatorId: string,
  mediaId: string,
): string {
  return `${creatorId}/${mediaId}/video.mp4`
}

export function buildVideoPosterStoragePath(
  creatorId: string,
  mediaId: string,
  variant: VideoPosterVariant,
): string {
  return `${creatorId}/${mediaId}/${variant}.jpg`
}

/**
 * Validate MP4 container by checking for 'ftyp' box at offset 4.
 * Does not guarantee H.264/AAC — callers must probe playback separately.
 */
export function looksLikeMp4Bytes(header: Uint8Array): boolean {
  if (header.length < 12) {
    return false
  }
  return (
    header[4] === MP4_FTYP[0] &&
    header[5] === MP4_FTYP[1] &&
    header[6] === MP4_FTYP[2] &&
    header[7] === MP4_FTYP[3]
  )
}

export function isSupportedWebVideoMime(mimeType: string): boolean {
  const normalized = mimeType.trim().toLowerCase()
  return normalized === 'video/mp4' || normalized === 'video/quicktime'
}

export function formatVideoDurationLabel(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes)}:${String(seconds).padStart(2, '0')}`
}

/** Rough storage estimate for canonical H.264 1080p ~2.5 Mbps. */
export function estimateCanonicalVideoBytes(durationSeconds: number): number {
  const bitrateBps = 2_500_000
  return Math.round((durationSeconds * bitrateBps) / 8)
}
