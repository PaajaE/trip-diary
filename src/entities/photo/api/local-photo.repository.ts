import {
  localPhotoSchema,
  type LocalPhotoVariant,
} from '@/entities/photo/model/photo'
import {
  processPhoto,
  type ProcessedPhoto,
  type SelectedPhotoFile,
} from '@/entities/photo/lib/process-photo'
import { localDb } from '@/shared/lib/local-db'
import { syncOperationSchema } from '@/shared/sync/sync-operation'

export async function addLocalPhotos(
  creatorId: string,
  entryId: string,
  files: (File | SelectedPhotoFile)[],
  processedPhotos?: ProcessedPhoto[],
): Promise<string[]> {
  const startingPosition = await localDb.photos
    .where('entryId')
    .equals(entryId)
    .count()
  const photoIds: string[] = []

  for (const [index, file] of files.entries()) {
    const selectedFile = file instanceof File ? file : file.file

    const preprocessed = processedPhotos?.[index]
    let processed: ProcessedPhoto

    if (preprocessed !== undefined && preprocessed.variants.length > 0) {
      processed = preprocessed
    } else {
      processed = await processPhoto(file)
    }

    if (processed.variants.length === 0) {
      throw new Error(
        `Photo variants could not be created (${selectedFile.name})`,
      )
    }
    const photoId = crypto.randomUUID()
    const now = new Date().toISOString()
    const photo = localPhotoSchema.parse({
      capturedAt: processed.capturedAt,
      createdAt: now,
      creatorId,
      entryId,
      id: photoId,
      latitude: processed.latitude,
      longitude: processed.longitude,
      position: startingPosition + index,
      syncStatus: 'pending',
    })
    const variants: LocalPhotoVariant[] = processed.variants.map((variant) => ({
      ...variant,
      createdAt: now,
      id: `${photoId}:${variant.kind}`,
      photoId,
      sizeBytes: variant.blob.size,
    }))
    const operation = syncOperationSchema.parse({
      createdAt: now,
      creatorId,
      id: crypto.randomUUID(),
      photoId,
      status: 'pending',
      type: 'photo.upload',
    })

    await localDb.transaction(
      'rw',
      localDb.photos,
      localDb.photoVariants,
      localDb.syncOperations,
      async () => {
        await localDb.photos.add(photo)
        await localDb.photoVariants.bulkAdd(variants)
        await localDb.syncOperations.add(operation)
      },
    )
    photoIds.push(photoId)
  }

  return photoIds
}
