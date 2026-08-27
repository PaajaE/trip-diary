import { processPhoto } from '@/entities/photo/lib/process-photo'
import { isVideoInput, processVideo } from '@/entities/photo/lib/process-video'
import type { SelectedPhotoFile } from '@/entities/photo/lib/process-photo'
import { addLocalPhotos } from '@/entities/photo/api/local-photo.repository'
import { getSupabaseClient } from '@/shared/api/supabase'
import { localDb } from '@/shared/lib/local-db'
import { isBrowserOnline } from '@/shared/lib/network'
import { canAutomaticallySync } from '@/shared/sync/auto-sync'
import { syncPendingOperations } from '@/shared/sync/sync.service'

export async function addPhotosToEntry(
  creatorId: string,
  entryId: string,
  files: SelectedPhotoFile[],
): Promise<string[]> {
  if (files.length === 0) {
    return []
  }

  const processedPhotos = await Promise.all(
    files.map(async (file) => {
      if (isVideoInput(file)) {
        return processVideo(file)
      }
      return processPhoto(file)
    }),
  )

  const photoIds = await addLocalPhotos(
    creatorId,
    entryId,
    files,
    processedPhotos,
  )

  try {
    if (await canAutomaticallySync()) {
      void syncPendingOperations().catch(() => {
        // Local queue keeps photos safe until the next sync attempt.
      })
    }
  } catch {
    // Offline-first: photos remain queued locally.
  }

  return photoIds
}

export async function reorderEntryPhotos(
  entryId: string,
  creatorId: string,
  orderedPhotoIds: readonly string[],
): Promise<void> {
  const localPhotos = await localDb.photos
    .where('entryId')
    .equals(entryId)
    .toArray()
  const photoById = new Map(localPhotos.map((photo) => [photo.id, photo]))

  await localDb.transaction('rw', localDb.photos, async () => {
    for (const [index, photoId] of orderedPhotoIds.entries()) {
      const photo = photoById.get(photoId)
      if (photo !== undefined && photo.position !== index) {
        await localDb.photos.update(photoId, { position: index })
      }
    }
  })

  if (!isBrowserOnline()) {
    return
  }

  const client = getSupabaseClient()
  const updates = orderedPhotoIds.map((photoId, index) =>
    client
      .from('entry_photos')
      .update({ position: index })
      .eq('entry_id', entryId)
      .eq('photo_id', photoId)
      .eq('creator_id', creatorId),
  )
  const results = await Promise.all(updates)
  const failed = results.find((result) => result.error !== null)
  if (failed?.error !== undefined) {
    throw failed.error
  }
}
