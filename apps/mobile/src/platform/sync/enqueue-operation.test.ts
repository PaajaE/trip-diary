import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/platform/storage/database', () => ({
  getMobileDatabase: vi.fn(),
  resetMobileDatabaseForTests: vi.fn(),
}))

const { requestSyncDrain } = vi.hoisted(() => ({
  requestSyncDrain: vi.fn(),
}))

vi.mock('@/foundation/sync/sync-drain-request', () => ({
  requestSyncDrain,
}))

vi.mock('@/platform/sync/queue', () => ({
  enqueueSyncOperation: vi.fn(async (input: unknown) => ({
    ...(input as object),
    status: 'pending',
  })),
}))

import { enqueueSyncOperationForApp } from '@/platform/sync/enqueue-operation'
import { enqueueSyncOperation } from '@/platform/sync/queue'

describe('enqueueSyncOperationForApp', () => {
  beforeEach(() => {
    requestSyncDrain.mockReset()
  })

  it('stores the enqueueing user id and requests a drain', async () => {
    await enqueueSyncOperationForApp({
      id: 'op-1',
      operationType: 'photo.upload',
      payload: { photoId: 'photo-1' },
      userId: 'user-abc',
    })

    expect(enqueueSyncOperation).toHaveBeenCalledWith({
      id: 'op-1',
      operationType: 'photo.upload',
      payload: {
        enqueuedByUserId: 'user-abc',
        photoId: 'photo-1',
      },
    })
    expect(requestSyncDrain).toHaveBeenCalledWith('enqueue')
  })
})
