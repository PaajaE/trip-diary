import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deletePhoto } from '@/entities/photo/api/photo-mutation.repository'
import { localDb } from '@/shared/lib/local-db'
import * as network from '@/shared/lib/network'
import { syncOperationSchema } from '@/shared/sync/sync-operation'

vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

vi.mock('@/shared/lib/network', () => ({
  isBrowserOnline: vi.fn(() => false),
}))

describe('photo mutations offline', () => {
  beforeEach(() => {
    vi.mocked(network.isBrowserOnline).mockReturnValue(false)
  })

  afterEach(async () => {
    await localDb.deletedRecords.clear()
    await localDb.photos.clear()
    await localDb.photoVariants.clear()
    await localDb.syncOperations.clear()
  })

  it('removes a pending photo locally without queueing photo.delete', async () => {
    const userId = crypto.randomUUID()
    const entryId = crypto.randomUUID()
    const photoId = crypto.randomUUID()
    const now = new Date().toISOString()

    await localDb.photos.add({
      capturedAt: null,
      createdAt: now,
      creatorId: userId,
      entryId,
      id: photoId,
      latitude: null,
      longitude: null,
      mediaType: 'photo',
      position: 0,
      syncStatus: 'pending',
    })
    await localDb.photoVariants.add({
      blob: new Blob(['thumb']),
      createdAt: now,
      ext: 'webp',
      height: 100,
      id: `${photoId}:thumb`,
      kind: 'thumb',
      mimeType: 'image/webp',
      photoId,
      sizeBytes: 5,
      width: 100,
    })
    await localDb.syncOperations.add(
      syncOperationSchema.parse({
        createdAt: now,
        creatorId: userId,
        id: crypto.randomUUID(),
        photoId,
        status: 'pending',
        type: 'photo.upload',
      }),
    )

    await deletePhoto(photoId, userId)

    expect(await localDb.photos.get(photoId)).toBeUndefined()
    expect(
      await localDb.photoVariants.where('photoId').equals(photoId).count(),
    ).toBe(0)
    expect(await localDb.syncOperations.toArray()).toHaveLength(0)
  })

  it('queues photo.delete for a previously synced photo', async () => {
    const userId = crypto.randomUUID()
    const entryId = crypto.randomUUID()
    const photoId = crypto.randomUUID()
    const now = new Date().toISOString()

    await localDb.photos.add({
      capturedAt: null,
      createdAt: now,
      creatorId: userId,
      entryId,
      id: photoId,
      latitude: null,
      longitude: null,
      mediaType: 'photo',
      position: 0,
      syncStatus: 'synced',
    })

    await deletePhoto(photoId, userId)

    expect(await localDb.photos.get(photoId)).toBeUndefined()
    expect(await localDb.deletedRecords.get(photoId)).toMatchObject({
      id: photoId,
      kind: 'photo',
    })
    expect(await localDb.syncOperations.toArray()).toMatchObject([
      { entryId, photoId, type: 'photo.delete' },
    ])
  })
})
