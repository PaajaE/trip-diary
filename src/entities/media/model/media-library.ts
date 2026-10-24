import { mediaQualitySchema } from '@trip-diary/core/automation'
import { z } from 'zod'

const instantSchema = z.iso.datetime({ offset: true })

export const mediaKindSchema = z.enum(['photo', 'video'])
export const mediaVariantKindSchema = z.enum([
  'thumb',
  'small',
  'medium',
  'large',
  'video',
  'poster',
])

export const mediaVariantSchema = z.object({
  byteSize: z.number().int().positive(),
  createdAt: instantSchema,
  height: z.number().int().positive(),
  kind: mediaVariantKindSchema,
  mediaId: z.uuid(),
  mimeType: z.enum(['image/webp', 'image/jpeg', 'video/mp4']),
  storageKey: z.string().min(1),
  width: z.number().int().positive(),
})
export type MediaVariant = z.infer<typeof mediaVariantSchema>

/** A library item with its stored variants. Times: UTC instant plus IANA zone. */
export const mediaItemSchema = z.object({
  altitude: z.number().nullable(),
  caption: z.string().max(2000).nullable(),
  capturedAt: instantSchema.nullable(),
  capturedTz: z.string().min(1).nullable(),
  createdAt: instantSchema,
  durationMs: z.number().int().positive().nullable(),
  focalX: z.number().min(0).max(1).nullable(),
  focalY: z.number().min(0).max(1).nullable(),
  height: z.number().int().positive().nullable(),
  hideLocation: z.boolean(),
  id: z.uuid(),
  journeyId: z.uuid().nullable(),
  kind: mediaKindSchema,
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  momentId: z.uuid().nullable(),
  ownerId: z.uuid(),
  /** 49-bit dHash (a safe JS integer); null/absent until analysed (phase 4e). */
  phash: z.number().int().nonnegative().nullable().optional(),
  /** On-device analysis result; invalid stored JSON is dropped, never fatal. */
  quality: mediaQualitySchema.nullable().optional(),
  /** When the owner sorted the item (UX-39); absent in old cached data. */
  reviewedAt: instantSchema.nullable().optional(),
  segmentOverrideId: z.uuid().nullable(),
  starred: z.boolean(),
  status: z.enum(['pending', 'uploading', 'ready', 'failed']),
  updatedAt: instantSchema,
  variants: z.array(mediaVariantSchema),
  width: z.number().int().positive().nullable(),
})
export type MediaItem = z.infer<typeof mediaItemSchema>

/** Only owner-editable metadata columns granted for UPDATE on public.media. */
export interface MediaMetaPatch {
  caption?: string | null
  focalX?: number | null
  focalY?: number | null
  hideLocation?: boolean
  starred?: boolean
}

/** A media item in the trash: the library item plus when it was trashed. */
export const trashedMediaItemSchema = mediaItemSchema.extend({
  deletedAt: instantSchema,
  /** Set once a purge was claimed: the files may already be gone. */
  purgeClaimedAt: instantSchema.nullable(),
})
export type TrashedMediaItem = z.infer<typeof trashedMediaItemSchema>

/** Results of the trash/restore/move RPCs: how many rows changed. */
export const rpcCountSchema = z.number().int().nonnegative()
/** purge_media returns the ids it removed. */
export const purgedIdsSchema = z.array(z.uuid())
export const newMomentIdSchema = z.uuid()

/** Largest |delta| shift_media_time accepts: 366 days, in seconds. */
export const MAX_SHIFT_SECONDS = 31_622_400

export type MediaLibraryErrorCode =
  | 'forbidden'
  | 'invalid_input'
  | 'invalid_response'
  | 'invalid_row'
  | 'list_failed'
  | 'not_found'
  | 'update_failed'

/** Typed failure surfaced by the media library repository. */
export class MediaLibraryError extends Error {
  readonly code: MediaLibraryErrorCode

  constructor(code: MediaLibraryErrorCode, message?: string, cause?: unknown) {
    super(message ?? code, cause === undefined ? undefined : { cause })
    this.name = 'MediaLibraryError'
    this.code = code
  }
}
