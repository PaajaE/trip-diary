import {
  localPhotoSchema,
  type LocalPhotoVariant,
} from '@/entities/photo/model/photo'
import { processPhoto } from '@/entities/photo/lib/process-photo'
import { localDb } from '@/shared/lib/local-db'
import { syncOperationSchema } from '@/shared/sync/sync-operation'

export async function addLocalPhotos(
  creatorId: string,
  entryId: string,
  files: File[],
): Promise<void> {
  const startingPosition = await localDb.photos
    .where('entryId')
    .equals(entryId)
    .count()

  for (const [index, file] of files.entries()) {
    const processed = await processPhoto(file)
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
  }
}
