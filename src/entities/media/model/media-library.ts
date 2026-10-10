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

export type MediaLibraryErrorCode =
  | 'invalid_input'
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
