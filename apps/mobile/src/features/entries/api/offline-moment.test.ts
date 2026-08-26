import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-file-system', () => ({
  deleteAsync: vi.fn(async () => {}),
  documentDirectory: 'file:///mock/documents/',
  getInfoAsync: vi.fn(async () => ({ exists: true, size: 100 })),
}))

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(),
}))

vi.mock('@/foundation/sync/sync-drain-request', () => ({
  requestSyncDrain: vi.fn(),
}))

vi.mock('@/platform/supabase', () => ({
  getSupabaseClient: vi.fn(),
  isSupabaseConfigured: vi.fn(() => true),
}))

vi.mock('@/platform/media/photo', () => ({
  generateMediumJpeg: vi.fn(),
  generateSmallJpeg: vi.fn(),
  generateThumbJpeg: vi.fn(),
  getLocalFileByteSize: vi.fn(async () => 1000),
  persistPhotoLocally: vi.fn(async (uri: string) => uri),
}))

import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite'
import {
  getMobileDatabase,
  resetMobileDatabaseForTests,
} from '@/platform/storage/database'
import { createInMemorySQLiteDatabase } from '@/platform/storage/test-utils/in-memory-sqlite'
import { saveJourneyMomentLocally } from '@/features/entries/api/save-journey-moment-local'
import { mergeLocalMomentsIntoJourneyDetail } from '@/features/journeys/lib/merge-local-moments'
import type { JourneyFullDetail } from '@/features/journeys/model/journey-detail'
import {
  upsertMomentDraftPhoto,
  listActiveMomentDraftPhotos,
} from '@/platform/media/draft-photos'
import type { PickedPhoto } from '@/platform/media/photo'
import {
  getLocalMoment,
  listLocalMomentsForJourney,
} from '@/platform/storage/local-moments'
import {
  ENTRY_CREATE_OPERATION,
  entryCreateOperationId,
} from '@/platform/sync/entry-sync'
import {
  enqueueSyncOperation,
  getSyncOperation,
  isSyncOperationBlocked,
  peekNextSyncOperation,
} from '@/platform/sync/queue'
import { PHOTO_UPLOAD_OPERATION } from '@/platform/sync/photo-upload'

const memoryDb = createInMemorySQLiteDatabase()

vi.mocked(openDatabaseAsync).mockImplementation(
  async () => memoryDb as unknown as SQLiteDatabase,
)

function readyPhoto(id: string): PickedPhoto {
  return {
    diagnostics: {
      attemptCount: 1,
      declaredMime: 'image/jpeg',
      failedStage: null,
      lastError: null,
      normalizedByteSize: 1000,
      normalizedHeight: 800,
      normalizedWidth: 1200,
      originalByteSize: 2000,
      sourceHeight: 800,
      sourceUriScheme: 'file',
      sourceWidth: 1200,
    },
    height: 800,
    localId: id,
    metadata: {
      capturedAt: null,
      latitude: null,
      localUri: `file:///mock/documents/photos/${id}.jpg`,
      longitude: null,
    },
    mimeType: 'image/jpeg',
    status: 'ready',
    smallUri: null,
    thumbUri: null,
    uri: `file:///mock/documents/photos/${id}.jpg`,
    width: 1200,
  }
}

describe('offline moment persistence', () => {
  beforeEach(() => {
    memoryDb.reset()
    resetMobileDatabaseForTests()
    vi.mocked(openDatabaseAsync).mockImplementation(
      async () => memoryDb as unknown as SQLiteDatabase,
    )
  })

  it('saves a new Moment locally with stable id and entry.create before photos', async () => {
    await getMobileDatabase()
    const entryId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const photoId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

    await upsertMomentDraftPhoto({
      draftKey: `entry:${entryId}`,
      journeyId: 'journey-1',
      photo: readyPhoto(photoId),
    })

    const saved = await saveJourneyMomentLocally({
      body: 'Day one offline',
      creatorId: 'user-1',
      entryId,
      eventAt: '2026-08-25T12:00:00.000Z',
      journeyId: 'journey-1',
      language: 'en',
      latitude: null,
      locationTitle: 'Camp',
      longitude: null,
      mode: 'create',
      spaceId: 'space-1',
      stageId: null,
      title: 'Camp morning',
      type: 'story',
      userId: 'user-1',
      visibility: 'public',
    })

    expect(saved.entryId).toBe(entryId)
    const local = await getLocalMoment(entryId)
    expect(local).toMatchObject({
      body: 'Day one offline',
      syncStatus: 'pending',
      title: 'Camp morning',
    })

    const createOp = await getSyncOperation(entryCreateOperationId(entryId))
    expect(createOp?.operationType).toBe(ENTRY_CREATE_OPERATION)
    expect(createOp?.status).toBe('pending')

    const drafts = await listActiveMomentDraftPhotos(`entry:${entryId}`)
    expect(drafts).toHaveLength(1)
    expect(drafts[0]?.entryId).toBe(entryId)
  })

  it('restores multiple offline Moments after simulated restart', async () => {
    await getMobileDatabase()
    await saveJourneyMomentLocally({
      body: 'A',
      creatorId: 'user-1',
      entryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      eventAt: '2026-08-25T10:00:00.000Z',
      journeyId: 'journey-1',
      language: 'en',
      latitude: null,
      locationTitle: null,
      longitude: null,
      mode: 'create',
      spaceId: 'space-1',
      stageId: null,
      title: 'Moment A',
      type: 'story',
      userId: 'user-1',
      visibility: 'public',
    })
    await saveJourneyMomentLocally({
      body: 'B',
      creatorId: 'user-1',
      entryId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      eventAt: '2026-08-25T11:00:00.000Z',
      journeyId: 'journey-1',
      language: 'en',
      latitude: null,
      locationTitle: null,
      longitude: null,
      mode: 'create',
      spaceId: 'space-1',
      stageId: null,
      title: 'Moment B',
      type: 'story',
      userId: 'user-1',
      visibility: 'public',
    })

    resetMobileDatabaseForTests()
    const restored = await listLocalMomentsForJourney('journey-1')
    expect(restored.map((row) => row.title).sort()).toEqual([
      'Moment A',
      'Moment B',
    ])
  })

  it('blocks photo.upload until entry.create completes', async () => {
    await getMobileDatabase()
    const entryId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    await enqueueSyncOperation({
      id: entryCreateOperationId(entryId),
      operationType: ENTRY_CREATE_OPERATION,
      payload: { entryId, journeyId: 'journey-1' },
    })
    await enqueueSyncOperation({
      id: `photo-upload-dddddddd-dddd-4ddd-8ddd-dddddddddddd`,
      operationType: PHOTO_UPLOAD_OPERATION,
      payload: {
        entryId,
        journeyId: 'journey-1',
        photoId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      },
    })

    const next = await peekNextSyncOperation()
    expect(next?.operationType).toBe(ENTRY_CREATE_OPERATION)

    const photoOp = await getSyncOperation(
      'photo-upload-dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    )
    expect(photoOp).not.toBeNull()
    expect(await isSyncOperationBlocked(photoOp!)).toBe(true)
  })

  it('merges pending local Moments into journey detail without dropping remote ones', () => {
    const detail: JourneyFullDetail = {
      endsAt: null,
      entries: [
        {
          body: 'remote',
          coverPreviewUrl: null,
          createdAt: '2026-08-24T10:00:00.000Z',
          eventAt: '2026-08-24T10:00:00.000Z',
          id: 'remote-entry',
          slug: null,
          stageId: null,
          stopId: null,
          title: 'Remote',
          type: 'story',
        },
      ],
      id: 'journey-1',
      spaceId: 'space-1',
      stages: [],
      startsAt: null,
      status: 'active',
      stops: [],
      summary: '',
      title: 'Trip',
    }

    const merged = mergeLocalMomentsIntoJourneyDetail(detail, [
      {
        body: 'local body',
        createdAt: '2026-08-25T12:00:00.000Z',
        creatorId: 'user-1',
        eventAt: '2026-08-25T12:00:00.000Z',
        id: 'local-entry',
        journeyId: 'journey-1',
        language: 'en',
        latitude: null,
        locationTitle: null,
        longitude: null,
        slug: null,
        spaceId: 'space-1',
        stageId: null,
        stopId: null,
        syncStatus: 'pending',
        title: 'Local offline',
        type: 'story',
        updatedAt: '2026-08-25T12:00:00.000Z',
        visibility: 'public',
      },
    ])

    expect(merged.entries.map((entry) => entry.id)).toEqual([
      'local-entry',
      'remote-entry',
    ])
  })

  it('offline edit updates local record and does not invent a second create', async () => {
    await getMobileDatabase()
    const entryId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    await saveJourneyMomentLocally({
      body: 'v1',
      creatorId: 'user-1',
      entryId,
      eventAt: '2026-08-25T12:00:00.000Z',
      journeyId: 'journey-1',
      language: 'en',
      latitude: null,
      locationTitle: null,
      longitude: null,
      mode: 'create',
      spaceId: 'space-1',
      stageId: null,
      title: 'v1',
      type: 'story',
      userId: 'user-1',
      visibility: 'public',
    })

    await saveJourneyMomentLocally({
      body: 'v2 offline edit',
      creatorId: 'user-1',
      entryId,
      eventAt: '2026-08-25T12:00:00.000Z',
      journeyId: 'journey-1',
      language: 'en',
      latitude: null,
      locationTitle: null,
      longitude: null,
      mode: 'edit',
      spaceId: 'space-1',
      stageId: null,
      title: 'v2',
      type: 'story',
      userId: 'user-1',
      visibility: 'public',
    })

    const local = await getLocalMoment(entryId)
    expect(local?.title).toBe('v2')
    expect(local?.body).toBe('v2 offline edit')
    expect(memoryDb.getTableRowCount('sync_queue')).toBe(1)
    expect(
      (await getSyncOperation(entryCreateOperationId(entryId)))?.status,
    ).toBe('pending')
  })
})
