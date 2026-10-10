import { z } from 'zod'
import type { ImageVariantKind } from '@trip-diary/core/media-upload'

export type MediaVariantKind = ImageVariantKind

export type MediaUploadErrorCode =
  | 'create_failed'
  | 'delete_failed'
  | 'duplicate'
  | 'export_failed'
  | 'finalize_failed'
  | 'heic_unsupported'
  | 'invalid_response'
  | 'processing_failed'
  | 'sign_failed'
  | 'upload_failed'
  | 'variant_failed'
  | 'video_too_large'
  | 'video_too_long'

/** Typed failure surfaced by the media repository and upload pipeline. */
export class MediaUploadError extends Error {
  readonly code: MediaUploadErrorCode

  constructor(code: MediaUploadErrorCode, message?: string, cause?: unknown) {
    super(message ?? code, cause === undefined ? undefined : { cause })
    this.name = 'MediaUploadError'
    this.code = code
  }
}

export const signPutResponseSchema = z.object({
  headers: z.record(z.string(), z.string()),
  key: z.string().min(1),
  publicUrl: z.string().min(1),
  url: z.string().min(1),
})
export type SignPutResponse = z.infer<typeof signPutResponseSchema>

export const multipartCreateResponseSchema = z.object({
  key: z.string().min(1),
  partBytes: z.number().int().positive(),
  partCount: z.number().int().positive(),
  publicUrl: z.string().min(1),
  uploadId: z.string().min(1),
})
export type MultipartCreateResponse = z.infer<
  typeof multipartCreateResponseSchema
>

export const multipartSignPartsResponseSchema = z.object({
  key: z.string().min(1),
  parts: z.array(
    z.object({
      partNumber: z.number().int().positive(),
      url: z.string().min(1),
    }),
  ),
})
export type MultipartSignPartsResponse = z.infer<
  typeof multipartSignPartsResponseSchema
>

export const multipartCompleteResponseSchema = z.object({
  key: z.string().min(1),
  publicUrl: z.string().min(1),
})
export type MultipartCompleteResponse = z.infer<
  typeof multipartCompleteResponseSchema
>

export const deleteMediaResponseSchema = z.object({ deleted: z.number() })

export const mediaStatusSchema = z.enum([
  'pending',
  'uploading',
  'ready',
  'failed',
])
export type MediaStatus = z.infer<typeof mediaStatusSchema>

export interface NewPhotoMedia {
  capturedAt: string | null
  capturedTz: string | null
  contentHash: string
  height: number | null
  id: string
  latitude: number | null
  longitude: number | null
  ownerId: string
  sourceAssetId?: string
  width: number | null
}

/** Video row: no content hash (dedupe by sourceAssetId), duration required. */
export interface NewVideoMedia {
  capturedAt: string | null
  capturedTz: string | null
  contentHash: null
  durationMs: number
  height: number
  id: string
  kind: 'video'
  latitude: number | null
  longitude: number | null
  ownerId: string
  sourceAssetId?: string
  width: number
}

export interface NewMediaVariant {
  byteSize: number
  height: number
  kind: MediaVariantKind | 'video'
  mediaId: string
  mimeType: 'image/jpeg' | 'image/webp' | 'video/mp4'
  storageKey: string
  width: number
}
