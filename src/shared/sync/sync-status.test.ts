import { afterEach, describe, expect, it } from 'vitest'
import { localDb } from '@/shared/lib/local-db'
import { getSyncStatusSnapshot } from '@/shared/sync/sync-status'

describe('getSyncStatusSnapshot', () => {
  const creatorId = crypto.randomUUID()

  afterEach(async () => {
    await localDb.entries.clear()
    await localDb.photos.clear()
    await localDb.syncOperations.clear()
  })

  it('reports pending when local entries are waiting to sync', async () => {
    await localDb.entries.add({
      body: 'Story',
      createdAt: new Date().toISOString(),
      creatorId,
      eventAt: new Date().toISOString(),
      id: crypto.randomUUID(),
      language: 'cs',
      publishedAt: null,
      slug: null,
      spaceId: crypto.randomUUID(),
      status: 'published',
      syncStatus: 'local',
      title: 'Moment',
      type: 'story',
      updatedAt: new Date().toISOString(),
      version: 1,
      visibility: 'public',
    })

    await expect(getSyncStatusSnapshot(creatorId)).resolves.toBe('pending')
  })

  it('reports failed when an entry failed to sync', async () => {
    await localDb.entries.add({
      body: 'Story',
      createdAt: new Date().toISOString(),
      creatorId,
      eventAt: new Date().toISOString(),
      id: crypto.randomUUID(),
      language: 'cs',
      publishedAt: null,
      slug: null,
      spaceId: crypto.randomUUID(),
      status: 'published',
      syncStatus: 'failed',
      title: 'Moment',
      type: 'story',
      updatedAt: new Date().toISOString(),
      version: 1,
      visibility: 'public',
    })

    await expect(getSyncStatusSnapshot(creatorId)).resolves.toBe('failed')
  })
})
