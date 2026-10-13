import { Capacitor, registerPlugin } from '@capacitor/core'
import { z } from 'zod'

/**
 * Native photo library (PhotoKit) access — v2 media import source.
 * Implemented in ios/App/App/MediaLibraryPlugin.swift; unavailable on web.
 */

export const mediaLibraryStatusSchema = z.enum([
  'notDetermined',
  'restricted',
  'denied',
  'authorized',
  'limited',
  'unknown',
])

export const mediaLibraryAssetSchema = z.object({
  altitude: z.number().optional(),
  burstId: z.string().optional(),
  creationDate: z.iso.datetime().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  height: z.number().int().nonnegative(),
  id: z.string().min(1),
  isFavorite: z.boolean(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  mediaType: z.enum(['image', 'video', 'audio', 'unknown']),
  modificationDate: z.iso.datetime().optional(),
  sourceType: z.enum(['userLibrary', 'cloudShared', 'itunesSynced']),
  subtypes: z.array(z.string()),
  width: z.number().int().nonnegative(),
})

const listAssetsResultSchema = z.object({
  assets: z.array(mediaLibraryAssetSchema),
  elapsedMs: z.number().int().nonnegative(),
})

export const embeddedMetadataSchema = z.object({
  available: z.boolean(),
  dateTimeOriginal: z.string().optional(),
  gpsLatitude: z.number().optional(),
  gpsLongitude: z.number().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  offsetTimeOriginal: z.string().optional(),
  reason: z.string().optional(),
  subsecTimeOriginal: z.string().optional(),
})

export type MediaLibraryStatus = z.infer<typeof mediaLibraryStatusSchema>
export type MediaLibraryAsset = z.infer<typeof mediaLibraryAssetSchema>
export type MediaLibraryEmbeddedMetadata = z.infer<
  typeof embeddedMetadataSchema
>

export interface ListMediaLibraryAssetsOptions {
  from?: string
  limit?: number
  mediaTypes?: ('image' | 'video')[]
  to?: string
}

export interface ExportMediaLibraryPhotoOptions {
  /** Allow downloading the original from iCloud (default false). */
  allowNetwork?: boolean
  id: string
  /** Longest edge of the exported JPEG in pixels (native clamps it). */
  maxLongEdge?: number
}

export const exportedPhotoSchema = z.object({
  byteSize: z.number().int().positive(),
  fileUrl: z.string().min(1),
  hasExif: z.boolean(),
  height: z.number().int().positive(),
  mimeType: z.literal('image/jpeg'),
  width: z.number().int().positive(),
})
export type ExportedMediaLibraryPhoto = z.infer<typeof exportedPhotoSchema>

export type MediaLibraryErrorCode =
  | 'ASSET_UNAVAILABLE'
  | 'EXPORT_FAILED'
  | 'NOT_AUTHORIZED'
  | 'NOT_FOUND'
  | 'UNKNOWN'

const MEDIA_LIBRARY_ERROR_CODES: readonly MediaLibraryErrorCode[] = [
  'ASSET_UNAVAILABLE',
  'EXPORT_FAILED',
  'NOT_AUTHORIZED',
  'NOT_FOUND',
]

export class MediaLibraryError extends Error {
  readonly code: MediaLibraryErrorCode

  constructor(code: MediaLibraryErrorCode, message: string) {
    super(message)
    this.name = 'MediaLibraryError'
    this.code = code
  }
}

/** Maps a rejection from the native plugin to a typed error. */
export function toMediaLibraryError(error: unknown): MediaLibraryError {
  if (error instanceof MediaLibraryError) return error
  const parsed = z
    .object({ code: z.string().optional(), message: z.string().optional() })
    .safeParse(error)
  const code = parsed.success ? parsed.data.code : undefined
  const message =
    (parsed.success ? parsed.data.message : undefined) ?? 'Media library error'
  const known = MEDIA_LIBRARY_ERROR_CODES.find((item) => item === code)
  return new MediaLibraryError(known ?? 'UNKNOWN', message)
}

interface MediaLibraryPlugin {
  getAuthorizationStatus(): Promise<unknown>
  listAssets(options: ListMediaLibraryAssetsOptions): Promise<unknown>
  deletePhotoExports(options: { fileUrls: string[] }): Promise<unknown>
  exportPhoto(options: ExportMediaLibraryPhotoOptions): Promise<unknown>
  readEmbeddedMetadata(options: {
    allowNetwork?: boolean
    id: string
  }): Promise<unknown>
  requestAuthorization(): Promise<unknown>
}

const MediaLibrary = registerPlugin<MediaLibraryPlugin>('MediaLibrary')

const statusResultSchema = z.object({ status: mediaLibraryStatusSchema })

export function isMediaLibraryAvailable(): boolean {
  return (
    Capacitor.getPlatform() === 'ios' &&
    Capacitor.isPluginAvailable('MediaLibrary')
  )
}

export async function getMediaLibraryStatus(): Promise<MediaLibraryStatus> {
  const result = await MediaLibrary.getAuthorizationStatus()
  return statusResultSchema.parse(result).status
}

export async function requestMediaLibraryAccess(): Promise<MediaLibraryStatus> {
  const result = await MediaLibrary.requestAuthorization()
  return statusResultSchema.parse(result).status
}

export async function listMediaLibraryAssets(
  options: ListMediaLibraryAssetsOptions = {},
): Promise<z.infer<typeof listAssetsResultSchema>> {
  const result = await MediaLibrary.listAssets(options)
  return listAssetsResultSchema.parse(result)
}

export async function readMediaLibraryEmbeddedMetadata(
  id: string,
  options: { allowNetwork?: boolean } = {},
): Promise<MediaLibraryEmbeddedMetadata> {
  const result = await MediaLibrary.readEmbeddedMetadata({ id, ...options })
  return embeddedMetadataSchema.parse(result)
}

/**
 * Renders one image asset to a temporary JPEG (EXIF kept when the original
 * has it). The caller must delete the file with `deleteMediaLibraryPhotoExports`.
 */
export async function exportMediaLibraryPhoto(
  options: ExportMediaLibraryPhotoOptions,
): Promise<ExportedMediaLibraryPhoto> {
  try {
    return exportedPhotoSchema.parse(await MediaLibrary.exportPhoto(options))
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new MediaLibraryError('EXPORT_FAILED', 'Invalid export result')
    }
    throw toMediaLibraryError(error)
  }
}

/** Removes files produced by `exportMediaLibraryPhoto`. */
export async function deleteMediaLibraryPhotoExports(
  fileUrls: string[],
): Promise<void> {
  try {
    await MediaLibrary.deletePhotoExports({ fileUrls })
  } catch (error) {
    throw toMediaLibraryError(error)
  }
}
