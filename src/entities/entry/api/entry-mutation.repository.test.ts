import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteEntry,
  updateEntry,
  updateEntryContent,
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

  it('updates title and body without changing type, time, or visibility', async () => {
    const userId = crypto.randomUUID()
    const eventAt = '2026-06-01T12:00:00.000+00:00'
    const entry = await createLocalEntry(userId, crypto.randomUUID(), {
      body: 'Original body',
      eventAt,
      language: 'en',
      title: 'Original title',
      type: 'tip',
      visibility: 'private',
    })

    const updated = await updateEntryContent(entry.id, userId, {
      body: 'Updated body with ěščř and ⛰',
      title: 'Updated title',
    })

    expect(updated).toMatchObject({
      body: 'Updated body with ěščř and ⛰',
      eventAt,
      language: 'en',
      title: 'Updated title',
      type: 'tip',
      visibility: 'private',
    })
  })

  it('queues entry.update when the create operation has already started', async () => {
    const userId = crypto.randomUUID()
    const entry = await createLocalEntry(userId, crypto.randomUUID(), {
      body: 'Original body',
      eventAt: new Date().toISOString(),
      language: 'cs',
      title: 'Original title',
      type: 'note',
      visibility: 'public',
    })
    const createOperation = (await localDb.syncOperations.toArray()).find(
      (operation) =>
        operation.type === 'entry.create' && operation.entryId === entry.id,
    )
    if (createOperation?.type !== 'entry.create') {
      throw new Error('expected a pending entry.create operation')
    }
    await localDb.syncOperations.put({
      ...createOperation,
      status: 'syncing',
    })

    await updateEntryContent(entry.id, userId, {
      body: 'Edited during create sync',
      title: entry.title,
    })

    expect(await localDb.syncOperations.toArray()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entryId: entry.id,
          type: 'entry.create',
          status: 'syncing',
        }),
        expect.objectContaining({
          entryId: entry.id,
          type: 'entry.update',
        }),
      ]),
    )
  })

  it('does not queue entry.update when create is still failed', async () => {
    const userId = crypto.randomUUID()
    const entry = await createLocalEntry(userId, crypto.randomUUID(), {
      body: 'Original body',
      eventAt: new Date().toISOString(),
      language: 'cs',
      title: 'Original title',
      type: 'note',
      visibility: 'public',
    })
    const createOperation = (await localDb.syncOperations.toArray()).find(
      (operation) =>
        operation.type === 'entry.create' && operation.entryId === entry.id,
    )
    if (createOperation?.type !== 'entry.create') {
      throw new Error('expected a pending entry.create operation')
    }
    await localDb.syncOperations.put({
      ...createOperation,
      status: 'failed',
    })

    await updateEntryContent(entry.id, userId, {
      body: 'Edited after failed create',
      title: entry.title,
    })

    expect(await localDb.syncOperations.toArray()).toEqual([
      expect.objectContaining({
        entryId: entry.id,
        status: 'failed',
        type: 'entry.create',
      }),
    ])
    expect(await localDb.entries.get(entry.id)).toMatchObject({
      body: 'Edited after failed create',
    })
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
