import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-file-system', () => ({
  deleteAsync: vi.fn(async () => {}),
  documentDirectory: 'file:///mock/documents/',
  getInfoAsync: vi.fn(async (uri: string) => ({
    exists: true,
    isDirectory: uri.endsWith('/photos'),
    modificationTime: (Date.now() - 48 * 60 * 60 * 1000) / 1000,
    size: 100,
    uri,
  })),
  readDirectoryAsync: vi.fn(async () => [
    'tracked.jpg',
    'orphan-old.jpg',
    'staging-stale',
  ]),
}))

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(),
}))

import * as FileSystem from 'expo-file-system'
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite'
import {
  getMobileDatabase,
  resetMobileDatabaseForTests,
} from '@/platform/storage/database'
import { createInMemorySQLiteDatabase } from '@/platform/storage/test-utils/in-memory-sqlite'
import type { PickedPhoto } from '@/platform/media/photo'
import {
  buildMomentDraftKey,
  clearEnqueuedMomentDraftPhotos,
  draftPhotoToPickedPhoto,
  listActiveMomentDraftPhotos,
  listTrackedLocalPhotoUris,
  markMomentDraftPhotoEnqueued,
  reconcileOrphanPhotoFiles,
  removeMomentDraftPhoto,
  upsertMomentDraftPhoto,
} from './draft-photos'

const memoryDb = createInMemorySQLiteDatabase()

vi.mocked(openDatabaseAsync).mockImplementation(
  async () => memoryDb as unknown as SQLiteDatabase,
)

function readyPhoto(
  id: string,
  overrides: Partial<PickedPhoto> = {},
): PickedPhoto {
  return {
    diagnostics: {
      attemptCount: 1,
      declaredMime: 'image/jpeg',
      failedStage: null,
      lastError: null,
      normalizedByteSize: 1200,
      normalizedHeight: 900,
      normalizedWidth: 1200,
      originalByteSize: 5000,
      sourceHeight: 3024,
      sourceUriScheme: 'file',
      sourceWidth: 4032,
    },
    height: 900,
    localId: id,
    metadata: {
      capturedAt: '2026:07:10 14:30:00',
      latitude: 50,
      localUri: `file:///mock/documents/photos/${id}.jpg`,
      longitude: 14,
    },
    mimeType: 'image/jpeg',
    status: 'ready',
    smallUri: `file:///mock/documents/photos/${id}-small.jpg`,
    thumbUri: `file:///mock/documents/photos/${id}-thumb.jpg`,
    uri: `file:///mock/documents/photos/${id}.jpg`,
    width: 1200,
    ...overrides,
  }
}

function failedPhoto(id: string): PickedPhoto {
  return {
    diagnostics: {
      attemptCount: 1,
      declaredMime: null,
      failedStage: 'copy',
      lastError: 'Could not copy the selected photo',
      normalizedByteSize: null,
      normalizedHeight: null,
      normalizedWidth: null,
      originalByteSize: null,
      sourceHeight: 100,
      sourceUriScheme: 'ph',
      sourceWidth: 100,
    },
    height: 100,
    localId: id,
    metadata: {
      capturedAt: null,
      latitude: null,
      localUri: '',
      longitude: null,
    },
    mimeType: 'image/jpeg',
    status: 'failed',
    smallUri: null,
    thumbUri: null,
    uri: '',
    width: 100,
  }
}

describe('moment draft photos', () => {
  beforeEach(() => {
    memoryDb.reset()
    resetMobileDatabaseForTests()
    vi.mocked(openDatabaseAsync).mockImplementation(
      async () => memoryDb as unknown as SQLiteDatabase,
    )
    vi.mocked(FileSystem.deleteAsync).mockClear()
  })

  it('builds draft keys for create vs edit', () => {
    expect(
      buildMomentDraftKey({
        journeyId: 'journey-1',
        mode: 'create',
      }),
    ).toBe('journey:journey-1:new')
    expect(
      buildMomentDraftKey({
        entryId: 'entry-1',
        journeyId: 'journey-1',
        mode: 'create',
      }),
    ).toBe('entry:entry-1')
    expect(
      buildMomentDraftKey({
        entryId: 'entry-1',
        journeyId: 'journey-1',
        mode: 'edit',
      }),
    ).toBe('entry:entry-1')
  })

  it('persists accepted picks before Moment save and restores after restart', async () => {
    await getMobileDatabase()
    const draftKey = 'journey:j1:new'
    const photo = readyPhoto('11111111-1111-4111-8111-111111111111')

    await upsertMomentDraftPhoto({
      draftKey,
      journeyId: 'j1',
      photo,
      position: 0,
    })

    resetMobileDatabaseForTests()
    const restored = await listActiveMomentDraftPhotos(draftKey)
    expect(restored).toHaveLength(1)
    expect(draftPhotoToPickedPhoto(restored[0])).toMatchObject({
      localId: photo.localId,
      status: 'ready',
      uri: photo.uri,
    })
  })

  it('retains every accepted item across partial batch persistence', async () => {
    await getMobileDatabase()
    const draftKey = 'journey:j1:new'
    await upsertMomentDraftPhoto({
      draftKey,
      journeyId: 'j1',
      photo: readyPhoto('11111111-1111-4111-8111-111111111111'),
      position: 0,
    })
    await upsertMomentDraftPhoto({
      draftKey,
      journeyId: 'j1',
      photo: readyPhoto('22222222-2222-4222-8222-222222222222'),
      position: 1,
    })
    await upsertMomentDraftPhoto({
      draftKey,
      journeyId: 'j1',
      photo: failedPhoto('33333333-3333-4333-8333-333333333333'),
      position: 2,
    })

    const rows = await listActiveMomentDraftPhotos(draftKey)
    expect(rows.map((row) => row.id)).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ])
    expect(rows[2]?.status).toBe('failed')
    expect(draftPhotoToPickedPhoto(rows[2]).uri).toBe('')
    expect(draftPhotoToPickedPhoto(rows[2]).diagnostics.sourceUriScheme).toBe(
      'ph',
    )
  })

  it('remove deletes persistent pending state and local files', async () => {
    await getMobileDatabase()
    const photo = readyPhoto('11111111-1111-4111-8111-111111111111')
    await upsertMomentDraftPhoto({
      draftKey: 'journey:j1:new',
      journeyId: 'j1',
      photo,
    })

    await removeMomentDraftPhoto(photo.localId)
    await removeMomentDraftPhoto(photo.localId)

    expect(await listActiveMomentDraftPhotos('journey:j1:new')).toEqual([])
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(photo.uri, {
      idempotent: true,
    })
  })

  it('marks enqueued drafts and clears them without duplicating identities', async () => {
    await getMobileDatabase()
    const draftKey = 'journey:j1:new'
    const photoId = '11111111-1111-4111-8111-111111111111'
    await upsertMomentDraftPhoto({
      draftKey,
      journeyId: 'j1',
      photo: readyPhoto(photoId),
    })

    await markMomentDraftPhotoEnqueued({
      entryId: 'entry-1',
      photoId,
    })
    expect(await listActiveMomentDraftPhotos(draftKey)).toEqual([])

    await clearEnqueuedMomentDraftPhotos(draftKey)
    const db = await getMobileDatabase()
    const remaining = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM moment_draft_photos WHERE id = ?`,
      photoId,
    )
    expect(remaining).toBeNull()
  })

  it('failed unmaterialized ph:// stays visible after restart and is not pretend-retryable', async () => {
    await getMobileDatabase()
    const draftKey = 'journey:j1:new'
    const photo = failedPhoto('44444444-4444-4444-8444-444444444444')

    await upsertMomentDraftPhoto({
      draftKey,
      journeyId: 'j1',
      photo,
    })

    resetMobileDatabaseForTests()
    const restored = await listActiveMomentDraftPhotos(draftKey)
    expect(restored).toHaveLength(1)
    const picked = draftPhotoToPickedPhoto(restored[0])
    expect(picked.status).toBe('failed')
    expect(picked.uri).toBe('')
    expect(picked.diagnostics.sourceUriScheme).toBe('ph')
    expect(picked.diagnostics.lastError).toMatch(/select|materializ/i)
  })

  it('orphan reconciliation never deletes tracked media', async () => {
    await getMobileDatabase()
    const trackedUri = 'file:///mock/documents/photos/tracked.jpg'
    await upsertMomentDraftPhoto({
      draftKey: 'journey:j1:new',
      journeyId: 'j1',
      photo: readyPhoto('11111111-1111-4111-8111-111111111111', {
        smallUri: null,
        thumbUri: null,
        uri: trackedUri,
        metadata: {
          capturedAt: null,
          latitude: null,
          localUri: trackedUri,
          longitude: null,
        },
      }),
    })

    const tracked = await listTrackedLocalPhotoUris()
    expect(tracked.has(trackedUri)).toBe(true)

    const result = await reconcileOrphanPhotoFiles({
      maxAgeMs: 60 * 60 * 1000,
      nowMs: Date.now(),
    })

    expect(result.skippedTracked).toBeGreaterThanOrEqual(1)
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      'file:///mock/documents/photos/orphan-old.jpg',
      { idempotent: true },
    )
    expect(FileSystem.deleteAsync).not.toHaveBeenCalledWith(trackedUri, {
      idempotent: true,
    })
  })
})
