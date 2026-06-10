import { afterEach, describe, expect, it } from 'vitest'
import {
  createLocalEntry,
  getLocalEntry,
} from '@/entities/entry/api/local-entry.repository'
import { localDb } from '@/shared/lib/local-db'

describe('local entry repository', () => {
  afterEach(async () => {
    await localDb.entries.clear()
    await localDb.syncOperations.clear()
  })

  it('stores an entry and its sync operation atomically', async () => {
    const spaceId = crypto.randomUUID()
    const entry = await createLocalEntry(crypto.randomUUID(), spaceId, {
      body: 'First offline memory',
      eventAt: new Date().toISOString(),
      language: 'en',
      title: 'Offline road',
      type: 'story',
      visibility: 'public',
    })

    expect(await getLocalEntry(entry.id)).toMatchObject({
      syncStatus: 'pending',
      title: 'Offline road',
    })
    expect(await localDb.syncOperations.count()).toBe(1)
    expect(await localDb.syncOperations.toArray()).toMatchObject([
      { creatorId: entry.creatorId },
    ])
  })
})
