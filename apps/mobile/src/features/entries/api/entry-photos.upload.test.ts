import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-file-system', () => ({
  copyAsync: vi.fn(async () => {}),
  deleteAsync: vi.fn(async () => {}),
  documentDirectory: 'file:///mock/documents/',
  getInfoAsync: vi.fn(async (uri: string) => ({
    exists: true,
    isDirectory: false,
    size: 2048,
    uri,
  })),
  makeDirectoryAsync: vi.fn(async () => {}),
}))

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(),
}))

vi.mock('@/platform/supabase', () => ({
  getSupabaseClient: vi.fn(),
  isSupabaseConfigured: vi.fn(() => true),
}))

vi.mock('@/foundation/sync/sync-drain-request', () => ({
  requestSyncDrain: vi.fn(),
}))

vi.mock('@/platform/media/photo', () => ({
  generateMediumJpeg: vi.fn(async () => {
    throw new Error('medium not needed in enqueue tests')
  }),
  generateSmallJpeg: vi.fn(async () => {
    throw new Error('small not needed in enqueue tests')
  }),
  generateThumbJpeg: vi.fn(async () => {
    throw new Error('thumb not needed in enqueue tests')
  }),
  getLocalFileByteSize: vi.fn(async () => 2048),
  persistPhotoLocally: vi.fn(async (uri: string) => uri),
}))

vi.mock('@/features/photos/api/signed-photo-url', () => ({
  createSignedPhotoUrls: vi.fn(),
}))

vi.mock('@/features/photos/lib/pick-photo-variant-path', () => ({
  groupVariantsByPhotoId: vi.fn(),
  pickDetailPhotoVariantPath: vi.fn(),
}))

vi.mock('@/features/photos/lib/read-photo-coordinate', () => ({
  readMeaningfulPhotoGps: vi.fn(),
}))

import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite'
import {
  getMobileDatabase,
  resetMobileDatabaseForTests,
} from '@/platform/storage/database'
import { createInMemorySQLiteDatabase } from '@/platform/storage/test-utils/in-memory-sqlite'
import type { PickedPhoto } from '@/platform/media/photo'
import { upsertMomentDraftPhoto } from '@/platform/media/draft-photos'
import { getSyncOperation } from '@/platform/sync/queue'
import { uploadEntryPhotos } from './entry-photos.repository'

const memoryDb = createInMemorySQLiteDatabase()

vi.mocked(openDatabaseAsync).mockImplementation(
  async () => memoryDb as unknown as SQLiteDatabase,
)

function readyPhoto(id: string): PickedPhoto {
  const uri = `file:///mock/documents/photos/${id}.jpg`
  return {
    diagnostics: {
      attemptCount: 1,
      declaredMime: 'image/jpeg',
      failedStage: null,
      lastError: null,
      normalizedByteSize: 2048,
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
      capturedAt: null,
      latitude: null,
      localUri: uri,
      longitude: null,
    },
    mimeType: 'image/jpeg',
    status: 'ready',
    smallUri: null,
    thumbUri: null,
    uri,
    width: 1200,
  }
}

describe('uploadEntryPhotos draft association', () => {
  beforeEach(() => {
    memoryDb.reset()
    resetMobileDatabaseForTests()
    vi.mocked(openDatabaseAsync).mockImplementation(
      async () => memoryDb as unknown as SQLiteDatabase,
    )
  })

  it('associates existing draft localId as photoId instead of inventing a new id', async () => {
    await getMobileDatabase()
    const photoId = '11111111-1111-4111-8111-111111111111'
    const photo = readyPhoto(photoId)
    const draftKey = 'journey:j1:new'

    await upsertMomentDraftPhoto({
      draftKey,
      journeyId: 'j1',
      photo,
    })

    const result = await uploadEntryPhotos({
      draftKey,
      entryId: 'entry-1',
      journeyId: 'j1',
      photos: [photo],
      userId: 'user-1',
    })

    expect(result.enqueuedPhotoIds).toEqual([photoId])
    const operation = await getSyncOperation(`photo-upload-${photoId}`)
    expect(operation).not.toBeNull()
    expect(operation?.payload.photoId).toBe(photoId)
    expect(operation?.payload.variant).toBe('full')
  })

  it('repeated Save reuses the same queue operation (idempotent)', async () => {
    await getMobileDatabase()
    const photoId = '22222222-2222-4222-8222-222222222222'
    const photo = readyPhoto(photoId)
    const draftKey = 'entry:entry-1'

    const first = await uploadEntryPhotos({
      draftKey,
      entryId: 'entry-1',
      journeyId: 'j1',
      photos: [photo],
      userId: 'user-1',
    })
    const second = await uploadEntryPhotos({
      draftKey,
      entryId: 'entry-1',
      journeyId: 'j1',
      photos: [photo],
      userId: 'user-1',
    })

    expect(first.enqueuedPhotoIds).toEqual([photoId])
    expect(second.enqueuedPhotoIds).toEqual([photoId])
    expect(memoryDb.getTableRowCount('sync_queue')).toBe(1)
    const operation = await getSyncOperation(`photo-upload-${photoId}`)
    expect(operation?.status).toBe('pending')
    expect(operation?.payload.photoId).toBe(photoId)
  })
})
