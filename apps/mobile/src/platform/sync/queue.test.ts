import { beforeEach, describe, expect, it, vi } from 'vitest'

type SyncOperationStatus = 'failed' | 'pending' | 'processing' | 'synced'

interface SyncQueueRow {
  created_at: string
  id: string
  operation_type: string
  payload: string
  status: SyncOperationStatus
  status_updated_at: string
}

const syncQueue = new Map<string, SyncQueueRow>()

const { PhotoUploadError, processPhotoUploadOperation } = vi.hoisted(() => {
  class MockPhotoUploadError extends Error {
    constructor(
      message: string,
      readonly retryable: boolean,
    ) {
      super(message)
      this.name = 'PhotoUploadError'
    }
  }

  return {
    PhotoUploadError: MockPhotoUploadError,
    processPhotoUploadOperation: vi.fn(),
  }
})

vi.mock('@/platform/storage/database', () => ({
  getMobileDatabase: vi.fn(async () => ({
    execAsync: vi.fn(async () => {}),
    getAllAsync: vi.fn(async (sql: string) => {
      if (sql.includes('GROUP BY status')) {
        let pending = 0
        let failed = 0

        for (const row of syncQueue.values()) {
          if (row.status === 'pending') {
            pending += 1
          }
          if (row.status === 'failed') {
            failed += 1
          }
        }

        return [
          ...(pending > 0 ? [{ count: pending, status: 'pending' }] : []),
          ...(failed > 0 ? [{ count: failed, status: 'failed' }] : []),
        ]
      }

      if (sql.includes("FROM sync_queue WHERE status = 'failed'")) {
        return [...syncQueue.values()]
          .filter((row) => row.status === 'failed')
          .map((row) =>
            sql.includes('SELECT id, payload')
              ? { id: row.id, payload: row.payload }
              : { payload: row.payload },
          )
      }

      return []
    }),
    runAsync: vi.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.includes('INSERT INTO sync_queue')) {
        const [id, operationType, payload, createdAt, statusUpdatedAt] = params as [
          string,
          string,
          string,
          string,
          string,
        ]
        syncQueue.set(id, {
          created_at: createdAt,
          id,
          operation_type: operationType,
          payload,
          status: 'pending',
          status_updated_at: statusUpdatedAt,
        })
        return { changes: 1 }
      }

      if (
        sql.includes("SET status = 'pending', status_updated_at = ?") &&
        sql.includes('payload = ?')
      ) {
        const [statusUpdatedAt, payload, id] = params as [string, string, string]
        const row = syncQueue.get(id)
        if (row !== undefined) {
          row.status = 'pending'
          row.status_updated_at = statusUpdatedAt
          row.payload = payload
        }
        return { changes: row === undefined ? 0 : 1 }
      }

      if (
        sql.includes("SET status = 'pending', status_updated_at") &&
        sql.includes("status = 'processing'")
      ) {
        const [now, cutoff, ...excludes] = params as [string, string, ...string[]]
        let changes = 0

        for (const row of syncQueue.values()) {
          if (row.status !== 'processing' || row.status_updated_at >= cutoff) {
            continue
          }

          if (excludes.includes(row.id)) {
            continue
          }

          row.status = 'pending'
          row.status_updated_at = now
          changes += 1
        }

        return { changes }
      }

      if (
        sql.includes("SET status = 'pending', status_updated_at = ?") &&
        sql.includes('payload = ?')
      ) {
        const [statusUpdatedAt, payload, id] = params as [string, string, string]
        const row = syncQueue.get(id)
        if (row !== undefined) {
          row.status = 'pending'
          row.status_updated_at = statusUpdatedAt
          row.payload = payload
        }
        return { changes: row === undefined ? 0 : 1 }
      }

      if (sql.includes('UPDATE sync_queue SET status')) {
        const [status, statusUpdatedAt, id] = params as [
          SyncOperationStatus,
          string,
          string,
        ]
        const row = syncQueue.get(id)
        if (row !== undefined) {
          row.status = status
          row.status_updated_at = statusUpdatedAt
        }
        return { changes: row === undefined ? 0 : 1 }
      }

      if (sql.includes('UPDATE sync_queue SET payload')) {
        const [payload, statusUpdatedAt, id] = params as [string, string, string]
        const row = syncQueue.get(id)
        if (row !== undefined) {
          row.payload = payload
          row.status_updated_at = statusUpdatedAt
        }
        return { changes: row === undefined ? 0 : 1 }
      }

      return { changes: 0 }
    }),
    getFirstAsync: vi.fn(async (sql: string, id?: string) => {
      if (sql.includes("status = 'pending'")) {
        const pending = [...syncQueue.values()]
          .filter((row) => row.status === 'pending')
          .sort((left, right) =>
            left.created_at.localeCompare(right.created_at),
          )

        return pending[0] ?? null
      }

      if (sql.includes('WHERE id = ?') && typeof id === 'string') {
        return syncQueue.get(id) ?? null
      }

      return null
    }),
  })),
  resetMobileDatabaseForTests: vi.fn(),
}))

vi.mock('./photo-upload', () => ({
  PHOTO_UPLOAD_OPERATION: 'photo.upload',
  PhotoUploadError,
  processPhotoUploadOperation,
}))

import {
  drainSyncQueue,
  enqueueSyncOperation,
  getSyncOperation,
  getSyncQueueCounts,
  getSyncQueueStatusSummary,
  markSyncOperationStatus,
  peekNextSyncOperation,
  processNextSyncOperation,
  recoverStaleProcessingOperations,
  resetRetryableFailedOperations,
} from './queue'
import { PHOTO_UPLOAD_OPERATION } from './photo-upload'

const photoUploadPayload = {
  byteSize: 1000,
  height: 100,
  journeyId: 'journey-1',
  localUri: 'file:///photo.jpg',
  mimeType: 'image/jpeg',
  originalFilename: 'photo.jpg',
  photoId: '40000000-0000-4000-8000-000000000001',
  width: 100,
}

describe('sync queue', () => {
  beforeEach(() => {
    syncQueue.clear()
    processPhotoUploadOperation.mockReset()
  })

  it('enqueues an operation as pending', async () => {
    const operation = await enqueueSyncOperation({
      id: 'op-1',
      operationType: 'create-entry',
      payload: { entryId: 'entry-1' },
    })

    expect(operation).toMatchObject({
      id: 'op-1',
      operationType: 'create-entry',
      payload: { entryId: 'entry-1' },
      status: 'pending',
    })
    expect(operation.createdAt).toEqual(expect.any(String))
    expect(operation.statusUpdatedAt).toEqual(operation.createdAt)
  })

  it('peeks the oldest pending operation first', async () => {
    await enqueueSyncOperation({
      id: 'op-late',
      operationType: 'update-entry',
      payload: { entryId: 'entry-2' },
    })
    syncQueue.get('op-late')!.created_at = '2026-07-10T12:00:00.000Z'

    await enqueueSyncOperation({
      id: 'op-early',
      operationType: 'create-entry',
      payload: { entryId: 'entry-1' },
    })
    syncQueue.get('op-early')!.created_at = '2026-07-10T10:00:00.000Z'

    const next = await peekNextSyncOperation()

    expect(next?.id).toBe('op-early')
  })

  it('returns null when no pending operations exist', async () => {
    expect(await peekNextSyncOperation()).toBeNull()
  })

  it('marks an operation status', async () => {
    await enqueueSyncOperation({
      id: 'op-1',
      operationType: 'create-entry',
      payload: { entryId: 'entry-1' },
    })

    await markSyncOperationStatus('op-1', 'processing')

    expect(syncQueue.get('op-1')?.status).toBe('processing')
  })

  it('marks photo upload operations as synced only after upload success', async () => {
    processPhotoUploadOperation.mockResolvedValue({
      photoId: 'photo-1',
      storagePath: 'user-1/photo-1/preview.jpg',
    })

    await enqueueSyncOperation({
      id: 'photo-op-1',
      operationType: PHOTO_UPLOAD_OPERATION,
      payload: photoUploadPayload,
    })

    const processed = await processNextSyncOperation()

    expect(processed).toMatchObject({
      remoteStoragePath: 'user-1/photo-1/preview.jpg',
      status: 'synced',
    })
    expect(syncQueue.get('photo-op-1')?.status).toBe('synced')
    expect(JSON.parse(syncQueue.get('photo-op-1')!.payload)).toMatchObject({
      remoteStoragePath: 'user-1/photo-1/preview.jpg',
    })
    expect(await peekNextSyncOperation()).toBeNull()
  })

  it('keeps failed uploads retryable and does not mark them synced', async () => {
    processPhotoUploadOperation.mockRejectedValue(new Error('Network down'))

    await enqueueSyncOperation({
      id: 'photo-op-fail',
      operationType: PHOTO_UPLOAD_OPERATION,
      payload: photoUploadPayload,
    })

    const processed = await processNextSyncOperation()

    expect(processed?.status).toBe('failed')
    expect(syncQueue.get('photo-op-fail')?.status).toBe('failed')
    expect(JSON.parse(syncQueue.get('photo-op-fail')!.payload)).toMatchObject({
      lastError: 'Network down',
      retryable: true,
    })
  })

  it('classifies missing local files as terminal failures', async () => {
    processPhotoUploadOperation.mockRejectedValue(
      new PhotoUploadError('Local photo file is missing', false),
    )

    await enqueueSyncOperation({
      id: 'photo-op-missing',
      operationType: PHOTO_UPLOAD_OPERATION,
      payload: photoUploadPayload,
    })

    const processed = await processNextSyncOperation()
    const stored = await getSyncOperation('photo-op-missing')

    expect(processed?.status).toBe('failed')
    expect(stored?.payload).toMatchObject({
      lastError: 'Local photo file is missing',
      retryable: false,
    })
  })

  it('retry flow reprocesses an operation after failed is reset to pending', async () => {
    processPhotoUploadOperation
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({
        photoId: 'photo-retry',
        storagePath: 'user-1/photo-retry/preview.jpg',
      })

    await enqueueSyncOperation({
      id: 'op-retry',
      operationType: PHOTO_UPLOAD_OPERATION,
      payload: {
        ...photoUploadPayload,
        photoId: '40000000-0000-4000-8000-000000000099',
      },
    })

    await processNextSyncOperation()
    await markSyncOperationStatus('op-retry', 'pending')

    const retried = await processNextSyncOperation()

    expect(retried?.status).toBe('synced')
    expect(syncQueue.get('op-retry')?.status).toBe('synced')
  })

  it('resets stale processing operations to pending', async () => {
    syncQueue.set('stale-op', {
      created_at: '2026-07-10T10:00:00.000Z',
      id: 'stale-op',
      operation_type: PHOTO_UPLOAD_OPERATION,
      payload: JSON.stringify(photoUploadPayload),
      status: 'processing',
      status_updated_at: '2020-01-01T00:00:00.000Z',
    })

    const changes = await recoverStaleProcessingOperations()

    expect(changes).toBe(1)
    expect(syncQueue.get('stale-op')?.status).toBe('pending')
  })

  it('leaves recent processing operations unchanged', async () => {
    const recent = new Date().toISOString()
    syncQueue.set('fresh-op', {
      created_at: '2026-07-10T10:00:00.000Z',
      id: 'fresh-op',
      operation_type: PHOTO_UPLOAD_OPERATION,
      payload: JSON.stringify(photoUploadPayload),
      status: 'processing',
      status_updated_at: recent,
    })

    const changes = await recoverStaleProcessingOperations()

    expect(changes).toBe(0)
    expect(syncQueue.get('fresh-op')?.status).toBe('processing')
  })

  it('recovered stale operation can be processed successfully', async () => {
    processPhotoUploadOperation.mockResolvedValue({
      photoId: 'photo-1',
      storagePath: 'user-1/photo-1/preview.jpg',
    })

    syncQueue.set('stale-photo', {
      created_at: '2026-07-10T10:00:00.000Z',
      id: 'stale-photo',
      operation_type: PHOTO_UPLOAD_OPERATION,
      payload: JSON.stringify(photoUploadPayload),
      status: 'processing',
      status_updated_at: '2020-01-01T00:00:00.000Z',
    })

    const processed = await processNextSyncOperation()

    expect(processed?.status).toBe('synced')
    expect(syncQueue.get('stale-photo')?.status).toBe('synced')
  })

  it('recovery does not affect synced, failed, or normal pending operations', async () => {
    syncQueue.set('synced-op', {
      created_at: '2020-01-01T00:00:00.000Z',
      id: 'synced-op',
      operation_type: 'journey.touch',
      payload: '{}',
      status: 'synced',
      status_updated_at: '2020-01-01T00:00:00.000Z',
    })
    syncQueue.set('failed-op', {
      created_at: '2020-01-01T00:00:00.000Z',
      id: 'failed-op',
      operation_type: PHOTO_UPLOAD_OPERATION,
      payload: '{}',
      status: 'failed',
      status_updated_at: '2020-01-01T00:00:00.000Z',
    })
    syncQueue.set('pending-op', {
      created_at: '2026-07-10T10:00:00.000Z',
      id: 'pending-op',
      operation_type: PHOTO_UPLOAD_OPERATION,
      payload: JSON.stringify(photoUploadPayload),
      status: 'pending',
      status_updated_at: '2026-07-10T10:00:00.000Z',
    })

    await recoverStaleProcessingOperations()

    expect(syncQueue.get('synced-op')?.status).toBe('synced')
    expect(syncQueue.get('failed-op')?.status).toBe('failed')
    expect(syncQueue.get('pending-op')?.status).toBe('pending')
  })

  it('serializes concurrent processNextSyncOperation calls', async () => {
    let releaseUpload: (() => void) | undefined
    const uploadStarted = new Promise<void>((resolve) => {
      processPhotoUploadOperation.mockImplementation(async () => {
        resolve()
        await new Promise<void>((unlock) => {
          releaseUpload = unlock
        })
        return {
          photoId: 'photo-1',
          storagePath: 'user-1/photo-1/preview.jpg',
        }
      })
    })

    await enqueueSyncOperation({
      id: 'photo-op-concurrent',
      operationType: PHOTO_UPLOAD_OPERATION,
      payload: photoUploadPayload,
    })

    const first = processNextSyncOperation()
    await uploadStarted
    const second = processNextSyncOperation()

    releaseUpload?.()

    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(processPhotoUploadOperation).toHaveBeenCalledTimes(1)
    expect(firstResult?.status).toBe('synced')
    expect(secondResult).toBeNull()
  })

  it('reports pending and failed counts', async () => {
    await enqueueSyncOperation({
      id: 'pending-op',
      operationType: 'journey.touch',
      payload: {},
    })
    await enqueueSyncOperation({
      id: 'failed-op',
      operationType: 'journey.touch',
      payload: {},
    })
    await markSyncOperationStatus('failed-op', 'failed')

    expect(await getSyncQueueCounts()).toEqual({ failed: 1, pending: 1 })
  })

  it('drains pending operations sequentially until empty', async () => {
    processPhotoUploadOperation.mockResolvedValue({
      photoId: 'photo-1',
      storagePath: 'user-1/photo-1/preview.jpg',
    })

    await enqueueSyncOperation({
      id: 'touch-op',
      operationType: 'journey.touch',
      payload: {},
    })
    await enqueueSyncOperation({
      id: 'photo-op-drain',
      operationType: PHOTO_UPLOAD_OPERATION,
      payload: photoUploadPayload,
    })

    const result = await drainSyncQueue(10)

    expect(result.processedCount).toBe(2)
    expect(await peekNextSyncOperation()).toBeNull()
  })

  it('does not retry failed operations during the same drain', async () => {
    processPhotoUploadOperation.mockRejectedValue(new Error('Network down'))

    await enqueueSyncOperation({
      id: 'photo-op-fail-drain',
      operationType: PHOTO_UPLOAD_OPERATION,
      payload: photoUploadPayload,
    })

    const result = await drainSyncQueue(10)

    expect(result.processedCount).toBe(1)
    expect(syncQueue.get('photo-op-fail-drain')?.status).toBe('failed')
    expect(processPhotoUploadOperation).toHaveBeenCalledTimes(1)
  })

  it('continues past a terminal failed operation to later pending work', async () => {
    syncQueue.set('failed-terminal', {
      created_at: '2026-07-10T09:00:00.000Z',
      id: 'failed-terminal',
      operation_type: 'journey.touch',
      payload: '{}',
      status: 'failed',
      status_updated_at: '2026-07-10T09:00:00.000Z',
    })

    await enqueueSyncOperation({
      id: 'pending-after-failed',
      operationType: 'journey.touch',
      payload: {},
    })

    const result = await drainSyncQueue(10)

    expect(result.processedCount).toBe(1)
    expect(syncQueue.get('pending-after-failed')?.status).toBe('synced')
  })

  it('summarizes retryable and terminal failed operations', async () => {
    syncQueue.set('failed-retryable', {
      created_at: '2026-07-10T09:00:00.000Z',
      id: 'failed-retryable',
      operation_type: PHOTO_UPLOAD_OPERATION,
      payload: JSON.stringify({ retryable: true, lastError: 'Network down' }),
      status: 'failed',
      status_updated_at: '2026-07-10T09:00:00.000Z',
    })
    syncQueue.set('failed-terminal', {
      created_at: '2026-07-10T09:01:00.000Z',
      id: 'failed-terminal',
      operation_type: PHOTO_UPLOAD_OPERATION,
      payload: JSON.stringify({ retryable: false, lastError: 'Too large' }),
      status: 'failed',
      status_updated_at: '2026-07-10T09:01:00.000Z',
    })

    await expect(getSyncQueueStatusSummary()).resolves.toEqual({
      failed: 2,
      pending: 0,
      retryableFailed: 1,
      terminalFailed: 1,
    })
  })

  it('resets only retryable failed operations to pending', async () => {
    syncQueue.set('failed-retryable', {
      created_at: '2026-07-10T09:00:00.000Z',
      id: 'failed-retryable',
      operation_type: PHOTO_UPLOAD_OPERATION,
      payload: JSON.stringify({ retryable: true, lastError: 'Network down' }),
      status: 'failed',
      status_updated_at: '2026-07-10T09:00:00.000Z',
    })
    syncQueue.set('failed-terminal', {
      created_at: '2026-07-10T09:01:00.000Z',
      id: 'failed-terminal',
      operation_type: PHOTO_UPLOAD_OPERATION,
      payload: JSON.stringify({ retryable: false, lastError: 'Too large' }),
      status: 'failed',
      status_updated_at: '2026-07-10T09:01:00.000Z',
    })

    await expect(resetRetryableFailedOperations()).resolves.toEqual({
      resetCount: 1,
      terminalCount: 1,
    })

    expect(syncQueue.get('failed-retryable')?.status).toBe('pending')
    expect(syncQueue.get('failed-terminal')?.status).toBe('failed')
  })
})
