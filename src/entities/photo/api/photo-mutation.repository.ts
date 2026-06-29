import { getSupabaseClient } from '@/shared/api/supabase'
import { localDb } from '@/shared/lib/local-db'
import {
  clearDeletedRecord,
  isRecordDeleted,
  markDeletedRecord,
} from '@/shared/lib/local-deleted-records'
import { isBrowserOnline } from '@/shared/lib/network'
import { syncOperationSchema } from '@/shared/sync/sync-operation'

export async function deletePhoto(
  photoId: string,
  creatorId: string,
): Promise<void> {
  if (await isRecordDeleted('photo', photoId)) {
    return
  }

  const photo = await localDb.photos.get(photoId)
  if (photo === undefined || photo.creatorId !== creatorId) {
    throw new Error('Photo is unavailable')
  }

  if (photo.syncStatus === 'pending') {
    await purgeLocalPhotoArtifacts(photoId)
    return
  }

  if (!isBrowserOnline()) {
    await queuePhotoDelete(photoId, creatorId, photo.entryId)
    return
  }

  try {
    await deletePhotoOnRemote(photoId)
    await purgeLocalPhotoArtifacts(photoId)
    await clearDeletedRecord(photoId)
  } catch {
    await queuePhotoDelete(photoId, creatorId, photo.entryId)
  }
}

async function queuePhotoDelete(
  photoId: string,
  creatorId: string,
  entryId: string,
): Promise<void> {
  const now = new Date().toISOString()

  await localDb.transaction(
    'rw',
    localDb.deletedRecords,
    localDb.photos,
    localDb.photoVariants,
    localDb.syncOperations,
    async () => {
      await markDeletedRecord({
        creatorId,
        deletedAt: now,
        id: photoId,
        kind: 'photo',
      })
      await localDb.photos.delete(photoId)
      await localDb.photoVariants.where('photoId').equals(photoId).delete()
      await purgePhotoSyncOperations(photoId)
      await localDb.syncOperations.add(
        syncOperationSchema.parse({
          createdAt: now,
          creatorId,
          entryId,
          id: crypto.randomUUID(),
          photoId,
          status: 'pending',
          type: 'photo.delete',
        }),
      )
    },
  )
}

async function purgeLocalPhotoArtifacts(photoId: string): Promise<void> {
  await localDb.transaction(
    'rw',
    localDb.deletedRecords,
    localDb.photos,
    localDb.photoVariants,
    localDb.syncOperations,
    async () => {
      await localDb.deletedRecords.delete(photoId)
      await localDb.photos.delete(photoId)
      await localDb.photoVariants.where('photoId').equals(photoId).delete()
      await purgePhotoSyncOperations(photoId)
    },
  )
}

async function purgePhotoSyncOperations(photoId: string): Promise<void> {
  await localDb.syncOperations
    .filter(
      (operation) =>
        (operation.type === 'photo.upload' ||
          operation.type === 'photo.gps.update' ||
          operation.type === 'photo.delete') &&
        operation.photoId === photoId,
    )
    .delete()
}

export async function deletePhotoOnRemote(photoId: string): Promise<void> {
  const client = getSupabaseClient()
  const { data: variants, error: variantsError } = await client
    .from('photo_variants')
    .select('storage_path')
    .eq('photo_id', photoId)
  if (variantsError !== null) {
    throw variantsError
  }

  const storagePaths = variants.map((variant) => variant.storage_path)
  if (storagePaths.length > 0) {
    const { error: storageError } = await client.storage
      .from('photos')
      .remove(storagePaths)
    if (storageError !== null) {
      throw storageError
    }
  }

  const { error: entryPhotosError } = await client
    .from('entry_photos')
    .delete()
    .eq('photo_id', photoId)
  if (entryPhotosError !== null) {
    throw entryPhotosError
  }

  const { error: photoVariantsError } = await client
    .from('photo_variants')
    .delete()
    .eq('photo_id', photoId)
  if (photoVariantsError !== null) {
    throw photoVariantsError
  }

  const { error: photoError } = await client
    .from('photos')
    .delete()
    .eq('id', photoId)
  if (photoError !== null) {
    throw photoError
  }
}
