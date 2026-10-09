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

interface MediaLibraryPlugin {
  getAuthorizationStatus(): Promise<unknown>
  listAssets(options: ListMediaLibraryAssetsOptions): Promise<unknown>
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
