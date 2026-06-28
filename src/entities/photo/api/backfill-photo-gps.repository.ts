import { extractGpsFromBlob } from '@/entities/photo/lib/extract-photo-gps'
import { isMeaningfulGpsCoordinate } from '@/entities/photo/lib/photo-exif-gps'
import type { LocalPhotoVariant } from '@/entities/photo/model/photo'
import { localDb } from '@/shared/lib/local-db'
import { syncOperationSchema } from '@/shared/sync/sync-operation'

export interface PhotoGpsBackfillResult {
  filledPhotoIds: string[]
  skippedPhotoIds: string[]
}

function pickGpsExtractionVariant(
  variants: LocalPhotoVariant[],
): LocalPhotoVariant | undefined {
  return (
    variants.find(({ kind }) => kind === 'large') ??
    variants.find(({ kind }) => kind === 'preview') ??
    variants.find(({ kind }) => kind === 'thumb')
  )
}

async function queuePhotoGpsUpdate(
  photoId: string,
  creatorId: string,
): Promise<void> {
  const existing = await localDb.syncOperations
    .filter(
      (operation) =>
        operation.type === 'photo.gps.update' && operation.photoId === photoId,
    )
    .first()

  if (existing !== undefined) {
    return
  }

  const uploadPending = await localDb.syncOperations
    .filter(
      (operation) =>
        operation.type === 'photo.upload' && operation.photoId === photoId,
    )
    .first()

  if (uploadPending !== undefined) {
    return
  }

  await localDb.syncOperations.add(
    syncOperationSchema.parse({
      createdAt: new Date().toISOString(),
      creatorId,
      id: crypto.randomUUID(),
      photoId,
      status: 'pending',
      type: 'photo.gps.update',
    }),
  )
}

export async function backfillPhotoGpsFromLocalVariants(
  photoId: string,
): Promise<boolean> {
  const photo = await localDb.photos.get(photoId)
  if (photo === undefined) {
    return false
  }

  if (isMeaningfulGpsCoordinate(photo.latitude, photo.longitude)) {
    return false
  }

  const variants = await localDb.photoVariants
    .where('photoId')
    .equals(photoId)
    .toArray()
  const variant = pickGpsExtractionVariant(variants)
  if (variant === undefined) {
    return false
  }

  const gps = await extractGpsFromBlob(variant.blob)
  if (gps === null) {
    return false
  }

  await localDb.photos.update(photoId, {
    latitude: gps.latitude,
    longitude: gps.longitude,
  })

  if (photo.syncStatus === 'synced') {
    await queuePhotoGpsUpdate(photoId, photo.creatorId)
  }

  return true
}

export async function backfillEntryPhotoGps(
  entryIds: string[],
): Promise<PhotoGpsBackfillResult> {
  const uniqueEntryIds = [...new Set(entryIds)]
  if (uniqueEntryIds.length === 0) {
    return { filledPhotoIds: [], skippedPhotoIds: [] }
  }

  const photos = await localDb.photos
    .where('entryId')
    .anyOf(uniqueEntryIds)
    .toArray()

  const filledPhotoIds: string[] = []
  const skippedPhotoIds: string[] = []

  for (const photo of photos) {
    const filled = await backfillPhotoGpsFromLocalVariants(photo.id)
    if (filled) {
      filledPhotoIds.push(photo.id)
    } else {
      skippedPhotoIds.push(photo.id)
    }
  }

  return { filledPhotoIds, skippedPhotoIds }
}
