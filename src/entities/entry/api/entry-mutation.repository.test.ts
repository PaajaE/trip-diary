import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteEntry,
  updateEntry,
} from '@/entities/entry/api/entry-mutation.repository'
import { createLocalEntry } from '@/entities/entry/api/local-entry.repository'
import { localDb } from '@/shared/lib/local-db'
import * as network from '@/shared/lib/network'

vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

vi.mock('@/shared/lib/network', () => ({
  isBrowserOnline: vi.fn(() => false),
}))

describe('entry mutations offline', () => {
  beforeEach(() => {
    vi.mocked(network.isBrowserOnline).mockReturnValue(false)
  })

  afterEach(async () => {
    await localDb.deletedRecords.clear()
    await localDb.entries.clear()
    await localDb.syncOperations.clear()
  })

  it('updates a pending entry locally without queueing entry.update', async () => {
    const userId = crypto.randomUUID()
    const entry = await createLocalEntry(userId, crypto.randomUUID(), {
      body: 'Original body',
      eventAt: new Date().toISOString(),
      language: 'cs',
      title: 'Original title',
      type: 'note',
      visibility: 'public',
    })

    const updated = await updateEntry(entry.id, userId, {
      body: 'Updated body',
      eventAt: entry.eventAt,
      language: 'cs',
      title: 'Updated title',
      type: 'story',
      visibility: 'public',
    })

    expect(updated.title).toBe('Updated title')
    expect(await localDb.syncOperations.toArray()).toHaveLength(1)
    expect(await localDb.syncOperations.toArray()).toMatchObject([
      { entryId: entry.id, type: 'entry.create' },
    ])
  })

  it('queues entry.update for a previously synced entry', async () => {
    const userId = crypto.randomUUID()
    const entryId = crypto.randomUUID()
    const now = new Date().toISOString()

    await localDb.entries.add({
      body: 'Synced body',
      createdAt: now,
      creatorId: userId,
      eventAt: now,
      id: entryId,
      language: 'cs',
      publishedAt: now,
      slug: 'synced-entry',
      spaceId: crypto.randomUUID(),
      status: 'published',
      syncStatus: 'synced',
      title: 'Synced title',
      type: 'note',
      updatedAt: now,
      version: 2,
      visibility: 'public',
    })

    await updateEntry(entryId, userId, {
      body: 'Edited offline',
      eventAt: now,
      language: 'cs',
      title: 'Edited offline',
      type: 'note',
      visibility: 'public',
    })

    expect(await localDb.syncOperations.toArray()).toContainEqual(
      expect.objectContaining({
        entryId,
        expectedVersion: 2,
        type: 'entry.update',
      }),
    )
  })

  it('queues entry.delete for a synced entry', async () => {
    const userId = crypto.randomUUID()
    const entryId = crypto.randomUUID()
    const now = new Date().toISOString()

    await localDb.entries.add({
      body: 'Synced body',
      createdAt: now,
      creatorId: userId,
      eventAt: now,
      id: entryId,
      language: 'cs',
      publishedAt: now,
      slug: 'synced-entry',
      spaceId: crypto.randomUUID(),
      status: 'published',
      syncStatus: 'synced',
      title: 'Synced title',
      type: 'note',
      updatedAt: now,
      version: 1,
      visibility: 'public',
    })

    await deleteEntry(entryId, userId)

    expect(await localDb.entries.get(entryId)).toBeUndefined()
    expect(await localDb.deletedRecords.get(entryId)).toMatchObject({
      id: entryId,
      kind: 'entry',
    })
    expect(await localDb.syncOperations.toArray()).toContainEqual(
      expect.objectContaining({
        entryId,
        type: 'entry.delete',
      }),
    )
  })
})
