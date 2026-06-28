import { afterEach, describe, expect, it } from 'vitest'
import { localDb } from '@/shared/lib/local-db'
import { syncOperationSchema } from '@/shared/sync/sync-operation'
import {
  shouldWaitForEntry,
  shouldWaitForPhotoUpload,
} from '@/shared/sync/sync-last-error'

describe('sync dependency helpers', () => {
  afterEach(async () => {
    await localDb.entries.clear()
    await localDb.photos.clear()
    await localDb.syncOperations.clear()
  })

  it('waits for downstream work while an entry is not synced, even if create failed', async () => {
    const entryId = crypto.randomUUID()
    const now = new Date().toISOString()

    await localDb.entries.add({
      body: 'Test',
      createdAt: now,
      creatorId: crypto.randomUUID(),
      eventAt: now,
      id: entryId,
      language: 'cs',
      publishedAt: null,
      slug: 'test-entry',
      spaceId: crypto.randomUUID(),
      status: 'published',
      syncStatus: 'failed',
      title: 'Test',
      type: 'story',
      updatedAt: now,
      version: 1,
      visibility: 'public',
    })
    await localDb.syncOperations.add(
      syncOperationSchema.parse({
        createdAt: now,
        creatorId: crypto.randomUUID(),
        entryId,
        id: crypto.randomUUID(),
        status: 'failed',
        type: 'entry.create',
      }),
    )

    await expect(shouldWaitForEntry(entryId)).resolves.toBe(true)
  })

  it('does not block photo upload on the same photo while the entry is synced', async () => {
    const entryId = crypto.randomUUID()
    const photoId = crypto.randomUUID()
    const now = new Date().toISOString()

    await localDb.entries.add({
      body: 'Test',
      createdAt: now,
      creatorId: crypto.randomUUID(),
      eventAt: now,
      id: entryId,
      language: 'cs',
      publishedAt: now,
      slug: 'test-entry',
      spaceId: crypto.randomUUID(),
      status: 'published',
      syncStatus: 'synced',
      title: 'Test',
      type: 'story',
      updatedAt: now,
      version: 1,
      visibility: 'public',
    })
    await localDb.photos.add({
      capturedAt: now,
      createdAt: now,
      creatorId: crypto.randomUUID(),
      entryId,
      id: photoId,
      latitude: null,
      longitude: null,
      position: 0,
      syncStatus: 'pending',
    })

    await expect(shouldWaitForPhotoUpload(photoId)).resolves.toBe(false)
  })
})
