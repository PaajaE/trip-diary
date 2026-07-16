import {
  createPhotoId,
  getLocalFileByteSize,
  persistPhotoLocally,
  type PickedPhoto,
} from '@/platform/media/photo'
import { PHOTO_UPLOAD_OPERATION } from '@/platform/sync/photo-upload'
import { enqueueSyncOperationForApp } from '@/platform/sync/enqueue-operation'
import { getSyncOperation, waitForSyncOperation } from '@/platform/sync/queue'
import { getSupabaseClient, isSupabaseConfigured } from '@/platform/supabase'
import { isHeicLikeImageInput } from '@trip-diary/utils'

export interface EntryPhotoSummary {
  hasGps: boolean
  id: string
  isCover: boolean
  latitude: number | null
  longitude: number | null
  position: number
  previewUrl: string | null
}

export type EntryPhotoErrorCode =
  | 'ASSET_INVALID'
  | 'DATABASE'
  | 'NETWORK'
  | 'PERMISSION'
  | 'QUEUE'
  | 'STORAGE'
  | 'TIMEOUT'
  | 'UNKNOWN'
  | 'UPLOAD'

export class EntryPhotoError extends Error {
  constructor(
    message: string,
    readonly code: EntryPhotoErrorCode = 'UNKNOWN',
  ) {
    super(message)
    this.name = 'EntryPhotoError'
  }
}

const SIGNED_URL_TTL_SECONDS = 60 * 60

export async function listEntryPhotos(
  entryId: string,
): Promise<EntryPhotoSummary[]> {
  if (!isSupabaseConfigured()) {
    return []
  }

  const client = getSupabaseClient()
  const { data: links, error } = await client
    .from('entry_photos')
    .select('photo_id, position, is_cover')
    .eq('entry_id', entryId)
    .order('position')

  if (error !== null) {
    throw new EntryPhotoError(error.message, 'DATABASE')
  }

  if (links.length === 0) {
    return []
  }

  const photoIds = links.map((row) => String(row.photo_id))
  const [{ data: photos }, { data: variants }] = await Promise.all([
    client.from('photos').select('id, latitude, longitude').in('id', photoIds),
    client
      .from('photo_variants')
      .select('photo_id, storage_path, variant')
      .in('photo_id', photoIds)
      .eq('variant', 'preview'),
  ])

  const photoById = new Map(
    (photos ?? []).map((photo) => [String(photo.id), photo]),
  )
  const pathByPhotoId = new Map(
    (variants ?? []).map((variant) => [
      String(variant.photo_id),
      String(variant.storage_path),
    ]),
  )

  return Promise.all(
    links.map(async (row) => {
      const photoId = String(row.photo_id)
      const photo = photoById.get(photoId)
      const storagePath = pathByPhotoId.get(photoId) ?? null
      const previewUrl =
        storagePath !== null ? await createSignedPhotoUrl(storagePath) : null
      const latitude =
        typeof photo?.latitude === 'number' ? photo.latitude : null
      const longitude =
        typeof photo?.longitude === 'number' ? photo.longitude : null

      return {
        hasGps: latitude !== null && longitude !== null,
        id: photoId,
        isCover: row.is_cover === true,
        latitude,
        longitude,
        position: typeof row.position === 'number' ? row.position : 0,
        previewUrl,
      } satisfies EntryPhotoSummary
    }),
  )
}

export async function setEntryCoverPhoto(
  entryId: string,
  photoId: string,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new EntryPhotoError('Supabase is not configured.', 'DATABASE')
  }

  const { error } = await getSupabaseClient().rpc('set_entry_photo_cover', {
    p_entry_id: entryId,
    p_photo_id: photoId,
  })

  if (error !== null) {
    throw new EntryPhotoError(error.message, 'DATABASE')
  }
}

export async function deleteEntryPhoto(
  entryId: string,
  photoId: string,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new EntryPhotoError('Supabase is not configured.', 'DATABASE')
  }

  const client = getSupabaseClient()

  const { data: variants } = await client
    .from('photo_variants')
    .select('storage_path')
    .eq('photo_id', photoId)

  const paths = (variants ?? [])
    .map((row) =>
      typeof row.storage_path === 'string' ? row.storage_path : null,
    )
    .filter((path): path is string => path !== null)

  if (paths.length > 0) {
    await client.storage.from('photos').remove(paths)
  }

  const { error: linkError } = await client
    .from('entry_photos')
    .delete()
    .eq('entry_id', entryId)
    .eq('photo_id', photoId)

  if (linkError !== null) {
    throw new EntryPhotoError(linkError.message, 'DATABASE')
  }

  const { error: photoError } = await client
    .from('photos')
    .delete()
    .eq('id', photoId)

  if (photoError !== null) {
    throw new EntryPhotoError(photoError.message, 'DATABASE')
  }
}

export async function uploadEntryPhotos(input: {
  coverLocalId?: string | null
  entryId: string
  journeyId: string
  photos: PickedPhoto[]
  startingPosition?: number
  userId: string
}): Promise<string[]> {
  if (input.photos.length === 0) {
    return []
  }

  if (!isSupabaseConfigured()) {
    throw new EntryPhotoError('Supabase is not configured.', 'DATABASE')
  }

  const photoIds: string[] = []
  const operationIds: string[] = []
  let position = input.startingPosition ?? 0
  const coverLocalId = input.coverLocalId ?? input.photos[0].localId

  for (const picked of input.photos) {
    try {
      assertPickedPhotoValid(picked)
      const photoId = createPhotoId()
      const filename = `entry-${input.entryId}-${String(position)}-${photoId}.jpg`
      const localUri = await persistPhotoLocally(picked.uri, filename)
      const byteSize = await getLocalFileByteSize(localUri)
      const operationId = `photo-upload-${photoId}`
      const isCover = picked.localId === coverLocalId

      if (__DEV__) {
        console.log('[moment-photos] enqueue', {
          byteSize,
          entryId: input.entryId,
          height: picked.height,
          isCover,
          mimeType: picked.mimeType,
          operationId,
          width: picked.width,
        })
      }

      await enqueueSyncOperationForApp({
        id: operationId,
        operationType: PHOTO_UPLOAD_OPERATION,
        payload: {
          byteSize,
          capturedAt: picked.metadata.capturedAt,
          entryId: input.entryId,
          height: picked.height,
          isCover,
          journeyId: input.journeyId,
          latitude: picked.metadata.latitude,
          localUri,
          longitude: picked.metadata.longitude,
          mimeType: picked.mimeType,
          originalFilename: filename,
          photoId,
          position,
          variant: 'preview',
          width: picked.width,
        },
        userId: input.userId,
      })

      photoIds.push(photoId)
      operationIds.push(operationId)
      position += 1
    } catch (error) {
      throw classifyEntryPhotoFailure(error, 'ASSET_INVALID')
    }
  }

  for (const operationId of operationIds) {
    let settled
    try {
      settled = await waitForSyncOperation(operationId, {
        timeoutMs: 180_000,
      })
    } catch (error) {
      const existing = await getSyncOperation(operationId)
      if (__DEV__) {
        console.log('[moment-photos] wait failed', {
          operationId,
          status: existing?.status ?? 'missing',
        })
      }
      throw classifyEntryPhotoFailure(error, 'TIMEOUT')
    }

    if (__DEV__) {
      console.log('[moment-photos] settled', {
        operationId,
        status: settled.status,
      })
    }

    if (settled.status === 'failed') {
      const message =
        typeof settled.payload.lastError === 'string'
          ? settled.payload.lastError
          : 'Photo upload failed.'
      throw classifyEntryPhotoFailure(new Error(message), 'UPLOAD')
    }
  }

  return photoIds
}

async function createSignedPhotoUrl(
  storagePath: string,
): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .storage.from('photos')
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)

  if (error !== null || typeof data.signedUrl !== 'string') {
    return null
  }

  return data.signedUrl
}

function assertPickedPhotoValid(photo: PickedPhoto): void {
  if (photo.uri.trim().length === 0) {
    throw new EntryPhotoError(
      'Selected photo has an empty URI.',
      'ASSET_INVALID',
    )
  }

  if (photo.width <= 0 || photo.height <= 0) {
    throw new EntryPhotoError(
      'Selected photo has invalid dimensions.',
      'ASSET_INVALID',
    )
  }

  const mimeType: string = photo.mimeType
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/webp') {
    throw new EntryPhotoError(
      `Unsupported photo type: ${mimeType}`,
      'ASSET_INVALID',
    )
  }

  if (
    isHeicLikeImageInput({
      mimeType: photo.mimeType,
      nameOrUri: photo.uri,
    })
  ) {
    throw new EntryPhotoError(
      'HEIC/HEIF photos cannot be uploaded until converted to JPEG or WebP.',
      'ASSET_INVALID',
    )
  }
}

function classifyEntryPhotoFailure(
  error: unknown,
  fallback: EntryPhotoErrorCode,
): EntryPhotoError {
  if (error instanceof EntryPhotoError) {
    return error
  }

  const message =
    error instanceof Error ? error.message : 'Photo upload failed.'
  const normalized = message.toLowerCase()

  if (normalized.includes('timed out')) {
    return new EntryPhotoError(message, 'TIMEOUT')
  }

  if (
    normalized.includes('permission') ||
    normalized.includes('row-level security') ||
    normalized.includes('42501')
  ) {
    return new EntryPhotoError(message, 'PERMISSION')
  }

  if (
    normalized.includes('network') ||
    normalized.includes('fetch') ||
    normalized.includes('timeout')
  ) {
    return new EntryPhotoError(message, 'NETWORK')
  }

  if (
    normalized.includes('storage') ||
    normalized.includes('bucket') ||
    normalized.includes('payload too large')
  ) {
    return new EntryPhotoError(message, 'STORAGE')
  }

  if (
    normalized.includes('local photo') ||
    normalized.includes('uri') ||
    normalized.includes('asset') ||
    normalized.includes('document directory')
  ) {
    return new EntryPhotoError(message, 'ASSET_INVALID')
  }

  if (
    normalized.includes('duplicate') ||
    normalized.includes('violates') ||
    normalized.includes('photos') ||
    normalized.includes('database')
  ) {
    return new EntryPhotoError(message, 'DATABASE')
  }

  if (normalized.includes('sync operation')) {
    return new EntryPhotoError(message, 'QUEUE')
  }

  return new EntryPhotoError(message, fallback)
}
