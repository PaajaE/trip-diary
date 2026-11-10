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

const pickAssetsResultSchema = z.object({
  assets: z.array(mediaLibraryAssetSchema),
  cancelled: z.boolean(),
  /** Picked items that had an identifier. */
  requested: z.number().int().nonnegative(),
  /** Picked items readable as PHAsset (fewer under limited access). */
  resolved: z.number().int().nonnegative(),
})
export type PickMediaLibraryAssetsResult = z.infer<
  typeof pickAssetsResultSchema
>

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
  | 'PICKER_FAILED'
  | 'THUMBNAIL_FAILED'
  | 'UNKNOWN'

const MEDIA_LIBRARY_ERROR_CODES: readonly MediaLibraryErrorCode[] = [
  'ASSET_UNAVAILABLE',
  'EXPORT_FAILED',
  'NOT_AUTHORIZED',
  'NOT_FOUND',
  'PICKER_FAILED',
  'THUMBNAIL_FAILED',
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
  pickAssets(): Promise<unknown>
  deletePhotoExports(options: { fileUrls: string[] }): Promise<unknown>
  exportPhoto(options: ExportMediaLibraryPhotoOptions): Promise<unknown>
  deleteThumbnails(options: { ids?: string[] }): Promise<unknown>
  getThumbnails(options: {
    allowNetwork?: boolean
    ids: string[]
    size: number
  }): Promise<unknown>
  readEmbeddedMetadata(options: {
    allowNetwork?: boolean
    id: string
  }): Promise<unknown>
  requestAuthorization(): Promise<unknown>
}

export const THUMBNAIL_CHUNK_SIZE = 60
export const THUMBNAIL_PARALLEL_CHUNKS = 2
export const THUMBNAIL_DEFAULT_SIZE = 256

const thumbnailSchema = z.union([
  z.object({
    fileUrl: z.string().min(1),
    height: z.number().int().positive(),
    id: z.string().min(1),
    unavailable: z.literal(false),
    width: z.number().int().positive(),
  }),
  // iCloud-only (network off), missing, or outside limited access.
  z.object({ id: z.string().min(1), unavailable: z.literal(true) }),
])
const thumbnailsResultSchema = z.object({
  thumbnails: z.array(thumbnailSchema),
})

export type MediaLibraryThumbnail =
  | {
      /** WebView-loadable URL (already passed through convertFileSrc). */
      src: string
      height: number
      id: string
      unavailable: false
      width: number
    }
  | { id: string; unavailable: true }

export interface GetMediaLibraryThumbnailsOptions {
  /** Allow downloading from iCloud (default false). */
  allowNetwork?: boolean
  /** Longest edge in px (native clamps to 96-512; default 256). */
  size?: number
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

/**
 * Opens the native multi-select photo picker. Resolves with `cancelled: true`
 * and no assets when the user dismisses it. Throws `MediaLibraryError`
 * (NOT_AUTHORIZED, PICKER_FAILED, ...) otherwise; also when unavailable (web).
 */
export async function pickMediaLibraryAssets(): Promise<PickMediaLibraryAssetsResult> {
  if (!isMediaLibraryAvailable()) {
    throw new MediaLibraryError(
      'PICKER_FAILED',
      'Photo picker is not available on this platform',
    )
  }
  try {
    return pickAssetsResultSchema.parse(await MediaLibrary.pickAssets())
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new MediaLibraryError('PICKER_FAILED', 'Invalid picker result')
    }
    throw toMediaLibraryError(error)
  }
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

async function fetchThumbnailChunk(
  ids: string[],
  options: GetMediaLibraryThumbnailsOptions,
): Promise<MediaLibraryThumbnail[]> {
  try {
    const { thumbnails } = thumbnailsResultSchema.parse(
      await MediaLibrary.getThumbnails({
        ids,
        size: options.size ?? THUMBNAIL_DEFAULT_SIZE,
        ...(options.allowNetwork === undefined
          ? {}
          : { allowNetwork: options.allowNetwork }),
      }),
    )
    const byId = new Map(thumbnails.map((item) => [item.id, item]))
    return ids.map((id): MediaLibraryThumbnail => {
      const item = byId.get(id)
      if (!item || item.unavailable) return { id, unavailable: true }
      return {
        height: item.height,
        id,
        src: Capacitor.convertFileSrc(item.fileUrl),
        unavailable: false,
        width: item.width,
      }
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new MediaLibraryError(
        'THUMBNAIL_FAILED',
        'Invalid thumbnail result',
      )
    }
    throw toMediaLibraryError(error)
  }
}

/**
 * Small local previews for not-yet-uploaded assets (native cache, nothing is
 * uploaded). Ids are de-duplicated, sent in chunks of 60 with at most 2 chunks
 * in flight, and results keep the order of first appearance. A missing or
 * iCloud-only asset yields `{ unavailable: true }`, not an error. Throws
 * `MediaLibraryError` (NOT_AUTHORIZED, THUMBNAIL_FAILED, ...); also on web.
 */
export async function getMediaLibraryThumbnails(
  ids: readonly string[],
  options: GetMediaLibraryThumbnailsOptions = {},
): Promise<MediaLibraryThumbnail[]> {
  if (!isMediaLibraryAvailable()) {
    throw new MediaLibraryError(
      'THUMBNAIL_FAILED',
      'Thumbnails are not available on this platform',
    )
  }
  const unique = [...new Set(ids)]
  const chunks: string[][] = []
  for (let i = 0; i < unique.length; i += THUMBNAIL_CHUNK_SIZE) {
    chunks.push(unique.slice(i, i + THUMBNAIL_CHUNK_SIZE))
  }
  const results: MediaLibraryThumbnail[][] = new Array<MediaLibraryThumbnail[]>(
    chunks.length,
  )
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < chunks.length) {
      const index = next++
      const chunk = chunks[index]
      if (chunk) results[index] = await fetchThumbnailChunk(chunk, options)
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(THUMBNAIL_PARALLEL_CHUNKS, chunks.length) },
      worker,
    ),
  )
  return results.flat()
}

/** Deletes cached thumbnails of `ids`, or the whole cache when omitted. */
export async function deleteMediaLibraryThumbnails(
  ids?: readonly string[],
): Promise<void> {
  if (!isMediaLibraryAvailable()) return
  try {
    await MediaLibrary.deleteThumbnails(ids ? { ids: [...ids] } : {})
  } catch (error) {
    throw toMediaLibraryError(error)
  }
}
