import * as FileSystem from 'expo-file-system'
import {
  createPhotoId,
  getLocalFileByteSize,
  persistPhotoLocally,
  type PickedPhoto,
} from '@/platform/media/photo'
import { createSignedPhotoUrls } from '@/features/photos/api/signed-photo-url'
import {
  groupVariantsByPhotoId,
  pickDetailPhotoVariantPath,
} from '@/features/photos/lib/pick-photo-variant-path'
import { readMeaningfulPhotoGps } from '@/features/photos/lib/read-photo-coordinate'
import { PHOTO_UPLOAD_OPERATION } from '@/platform/sync/photo-upload'
import {
  enqueueFailedSyncOperationForApp,
  enqueueSyncOperationForApp,
} from '@/platform/sync/enqueue-operation'
import { getSupabaseClient, isSupabaseConfigured } from '@/platform/supabase'

export interface EntryPhotoSummary {
  caption: string | null
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

export async function listEntryPhotos(
  entryId: string,
): Promise<EntryPhotoSummary[]> {
  if (!isSupabaseConfigured()) {
    return []
  }

  const client = getSupabaseClient()
  const { data: links, error } = await client
    .from('entry_photos')
    .select('photo_id, position, is_cover, caption')
    .eq('entry_id', entryId)
    .order('position')

  if (error !== null) {
    throw new EntryPhotoError(error.message, 'DATABASE')
  }

  if (links.length === 0) {
    return []
  }

  const photoIds = links.map((row) => String(row.photo_id))
  const [
    { data: photos, error: photosError },
    { data: variants, error: variantsError },
  ] = await Promise.all([
    client.from('photos').select('id, latitude, longitude').in('id', photoIds),
    client
      .from('photo_variants')
      .select('photo_id, storage_path, variant')
      .in('photo_id', photoIds),
  ])

  if (photosError !== null) {
    throw new EntryPhotoError(photosError.message, 'DATABASE')
  }

  if (variantsError !== null) {
    throw new EntryPhotoError(variantsError.message, 'DATABASE')
  }

  const photoById = new Map(photos.map((photo) => [String(photo.id), photo]))
  const variantsByPhotoId = groupVariantsByPhotoId(variants)
  const storagePathByPhotoId = new Map<string, string>()

  for (const photoId of photoIds) {
    const storagePath = pickDetailPhotoVariantPath(
      variantsByPhotoId.get(photoId) ?? [],
    )
    if (storagePath !== null) {
      storagePathByPhotoId.set(photoId, storagePath)
    }
  }

  const signedByPath = await createSignedPhotoUrls([
    ...storagePathByPhotoId.values(),
  ])

  return links.map((row) => {
    const photoId = String(row.photo_id)
    const photo = photoById.get(photoId)
    const storagePath = storagePathByPhotoId.get(photoId)
    const previewUrl =
      storagePath !== undefined ? (signedByPath.get(storagePath) ?? null) : null
    const coords = readMeaningfulPhotoGps(photo?.latitude, photo?.longitude)

    return {
      caption:
        typeof row.caption === 'string' && row.caption.trim().length > 0
          ? row.caption.trim()
          : null,
      hasGps: coords !== null,
      id: photoId,
      isCover: row.is_cover === true,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      position: typeof row.position === 'number' ? row.position : 0,
      previewUrl,
    } satisfies EntryPhotoSummary
  })
}

export async function updateEntryPhotoCaption(
  entryId: string,
  photoId: string,
  caption: string | null,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new EntryPhotoError('Supabase is not configured.', 'DATABASE')
  }

  const normalized =
    caption === null || caption.trim().length === 0
      ? null
      : caption.trim().slice(0, 500)

  const { error } = await getSupabaseClient()
    .from('entry_photos')
    .update({ caption: normalized })
    .eq('entry_id', entryId)
    .eq('photo_id', photoId)

  if (error !== null) {
    throw new EntryPhotoError(error.message, 'DATABASE')
  }
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
}): Promise<{
  enqueuedPhotoIds: string[]
  failed: Array<{ localId: string; reason: string }>
  queuedCount: number
}> {
  if (input.photos.length === 0) {
    return { enqueuedPhotoIds: [], failed: [], queuedCount: 0 }
  }

  if (!isSupabaseConfigured()) {
    throw new EntryPhotoError('Supabase is not configured.', 'DATABASE')
  }

  const enqueuedPhotoIds: string[] = []
  const failed: Array<{ localId: string; reason: string }> = []
  let position = input.startingPosition ?? 0
  const readyPhotos = input.photos.filter((photo) => photo.status === 'ready')
  const failedPicks = input.photos.filter((photo) => photo.status === 'failed')
  const coverLocalId =
    input.coverLocalId ?? readyPhotos[0]?.localId ?? input.photos[0]?.localId
  let coverAssigned = false

  for (const failedPick of failedPicks) {
    const photoId = createPhotoId()
    const operationId = `photo-upload-${photoId}`
    const reason =
      failedPick.diagnostics.lastError ?? 'Photo could not be prepared.'
    try {
      await enqueueFailedSyncOperationForApp({
        id: operationId,
        operationType: PHOTO_UPLOAD_OPERATION,
        payload: {
          attemptCount: failedPick.diagnostics.attemptCount,
          byteSize: failedPick.diagnostics.originalByteSize ?? 1,
          declaredMime: failedPick.diagnostics.declaredMime,
          entryId: input.entryId,
          failedStage: failedPick.diagnostics.failedStage,
          height: failedPick.height,
          journeyId: input.journeyId,
          lastError: reason,
          localUri: '',
          mimeType: 'image/jpeg',
          originalFilename: `failed-${photoId}.jpg`,
          photoId,
          position,
          retryable: false,
          sourceUriScheme: failedPick.diagnostics.sourceUriScheme,
          width: failedPick.width,
        },
        retryable: false,
        userId: input.userId,
      })
    } catch (error) {
      console.warn('[moment-photos] could not persist failed pick', error)
    }
    failed.push({ localId: failedPick.localId, reason })
    position += 1
  }

  for (const picked of readyPhotos) {
    const photoId = createPhotoId()
    const operationId = `photo-upload-${photoId}`
    try {
      assertPickedPhotoValid(picked)
      const filename = `entry-${input.entryId}-${String(position)}-${photoId}.jpg`

      const localUri = await ensureUploadLocalCopy(picked.uri, filename)
      const byteSize = await getLocalFileByteSize(localUri)
      const preferCover = !coverAssigned && picked.localId === coverLocalId

      let thumbLocalUri = picked.thumbUri
      let thumbByteSize: number | null = null
      let thumbWidth: number | null = null
      let thumbHeight: number | null = null
      if (thumbLocalUri !== null && thumbLocalUri.length > 0) {
        try {
          thumbByteSize = await getLocalFileByteSize(thumbLocalUri)
          thumbWidth = Math.max(1, Math.round(picked.width / 3))
          thumbHeight = Math.max(1, Math.round(picked.height / 3))
        } catch {
          thumbLocalUri = null
        }
      }

      console.log('[moment-photos] enqueue', {
        byteSize,
        entryId: input.entryId,
        height: picked.height,
        isCover: preferCover,
        localUriSuffix: localUri.slice(-48),
        mimeType: picked.mimeType,
        operationId,
        hasThumb: thumbLocalUri !== null,
        width: picked.width,
      })

      await enqueueSyncOperationForApp({
        id: operationId,
        operationType: PHOTO_UPLOAD_OPERATION,
        payload: {
          attemptCount: 0,
          byteSize,
          capturedAt: picked.metadata.capturedAt,
          declaredMime: picked.diagnostics.declaredMime,
          entryId: input.entryId,
          height: picked.height,
          isCover: preferCover,
          journeyId: input.journeyId,
          latitude: picked.metadata.latitude,
          localUri,
          longitude: picked.metadata.longitude,
          mimeType: picked.mimeType,
          originalFilename: filename,
          photoId,
          position,
          sourceUriScheme: picked.diagnostics.sourceUriScheme,
          thumbByteSize,
          thumbHeight,
          thumbLocalUri,
          thumbWidth,
          variant: 'preview',
          width: picked.width,
        },
        userId: input.userId,
      })

      enqueuedPhotoIds.push(photoId)
      if (preferCover) {
        coverAssigned = true
      }
      position += 1
    } catch (error) {
      const classified = classifyEntryPhotoFailure(error, 'UPLOAD')
      console.warn('[moment-photos] enqueue failed', {
        localId: picked.localId,
        message: classified.message,
      })
      failed.push({ localId: picked.localId, reason: classified.message })
      position += 1
    }
  }

  if (enqueuedPhotoIds.length === 0 && failed.length > 0) {
    throw new EntryPhotoError(
      failed[0]?.reason ?? 'Photo upload failed.',
      'UPLOAD',
    )
  }

  return {
    enqueuedPhotoIds,
    failed,
    queuedCount: enqueuedPhotoIds.length,
  }
}

async function ensureUploadLocalCopy(
  sourceUri: string,
  filename: string,
): Promise<string> {
  const documentDirectory = FileSystem.documentDirectory
  if (
    documentDirectory !== null &&
    sourceUri.startsWith(`${documentDirectory}photos/`)
  ) {
    const info = await FileSystem.getInfoAsync(sourceUri, { size: true })
    if (info.exists && 'size' in info && info.size > 0) {
      return sourceUri
    }
  }

  return persistPhotoLocally(sourceUri, filename)
}

function assertPickedPhotoValid(photo: PickedPhoto): void {
  if (photo.status !== 'ready') {
    throw new EntryPhotoError(
      photo.diagnostics.lastError ?? 'Selected photo is not ready.',
      'ASSET_INVALID',
    )
  }

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
    normalized.includes('photo library permission') ||
    normalized.includes('media library permission') ||
    normalized.includes('limited library') ||
    normalized.includes('phphotoserror') ||
    (normalized.includes('permission') &&
      !normalized.includes('permission denied for table') &&
      !normalized.includes('row-level security') &&
      !normalized.includes('42501'))
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
    normalized.includes('permission denied for table') ||
    normalized.includes('row-level security') ||
    normalized.includes('42501') ||
    normalized.includes('duplicate') ||
    normalized.includes('violates') ||
    normalized.includes('entry_photos') ||
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
