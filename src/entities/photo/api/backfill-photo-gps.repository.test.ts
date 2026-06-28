import { afterEach, describe, expect, it, vi } from 'vitest'
import { backfillPhotoGpsFromLocalVariants } from '@/entities/photo/api/backfill-photo-gps.repository'
import { localDb } from '@/shared/lib/local-db'

vi.mock('@/entities/photo/lib/extract-photo-gps', () => ({
  extractGpsFromBlob: vi.fn(),
}))

import { extractGpsFromBlob } from '@/entities/photo/lib/extract-photo-gps'

const photoId = crypto.randomUUID()
const entryId = crypto.randomUUID()
const creatorId = crypto.randomUUID()

describe('backfillPhotoGpsFromLocalVariants', () => {
  afterEach(async () => {
    await localDb.photos.clear()
    await localDb.photoVariants.clear()
    await localDb.syncOperations.clear()
    vi.mocked(extractGpsFromBlob).mockReset()
  })

  it('fills missing GPS from a local variant and queues a metadata sync', async () => {
    const now = new Date().toISOString()
    await localDb.photos.put({
      capturedAt: null,
      createdAt: now,
      creatorId,
      entryId,
      id: photoId,
      latitude: null,
      longitude: null,
      position: 0,
      syncStatus: 'synced',
    })
    await localDb.photoVariants.put({
      blob: new Blob(['photo']),
      createdAt: now,
      ext: 'webp',
      height: 1200,
      id: `${photoId}:large`,
      kind: 'large',
      mimeType: 'image/webp',
      photoId,
      sizeBytes: 5,
      width: 1600,
    })
    vi.mocked(extractGpsFromBlob).mockResolvedValue({
      latitude: 50.08,
      longitude: 14.43,
    })

    await expect(backfillPhotoGpsFromLocalVariants(photoId)).resolves.toBe(true)

    const photo = await localDb.photos.get(photoId)
    expect(photo?.latitude).toBe(50.08)
    expect(photo?.longitude).toBe(14.43)

    const operations = await localDb.syncOperations.toArray()
    expect(operations).toHaveLength(1)
    expect(operations[0]?.type).toBe('photo.gps.update')
  })

  it('skips photos that already have GPS', async () => {
    await localDb.photos.put({
      capturedAt: null,
      createdAt: new Date().toISOString(),
      creatorId,
      entryId,
      id: photoId,
      latitude: 48.2,
      longitude: 16.37,
      position: 0,
      syncStatus: 'synced',
    })

    await expect(backfillPhotoGpsFromLocalVariants(photoId)).resolves.toBe(
      false,
    )
    expect(extractGpsFromBlob).not.toHaveBeenCalled()
  })
})
