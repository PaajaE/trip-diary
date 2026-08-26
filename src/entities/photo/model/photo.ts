import { z } from 'zod'

export const photoVariantKindSchema = z.enum([
  'thumb',
  'small',
  'medium',
  'full',
  'preview',
  'large',
  'video',
])
export type PhotoVariantKind = z.infer<typeof photoVariantKindSchema>

export const mediaTypeSchema = z.enum(['photo', 'video'])
export type MediaType = z.infer<typeof mediaTypeSchema>

export const localPhotoSchema = z.object({
  capturedAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  creatorId: z.uuid(),
  durationMs: z.number().int().positive().nullable().optional(),
  entryId: z.uuid(),
  id: z.uuid(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  mediaType: mediaTypeSchema.default('photo'),
  position: z.number().int().nonnegative(),
  syncStatus: z.enum(['pending', 'syncing', 'synced', 'failed']),
})

export type LocalPhoto = z.infer<typeof localPhotoSchema>

export interface LocalPhotoVariant {
  blob: Blob
  createdAt: string
  ext: 'jpg' | 'webp' | 'mp4'
  height: number
  id: string
  kind: PhotoVariantKind
  mimeType: 'image/jpeg' | 'image/webp' | 'video/mp4'
  photoId: string
  sizeBytes: number
  width: number
}
