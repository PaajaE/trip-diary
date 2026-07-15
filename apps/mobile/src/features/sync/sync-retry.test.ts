import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  requestSyncDrain,
  resetSyncDrainRequestsForTests,
  subscribeSyncDrainRequests,
} from '@/foundation/sync/sync-drain-request'

const resetRetryableFailedOperations = vi.fn()

vi.mock('@/platform/sync/queue', () => ({
  resetRetryableFailedOperations,
}))

describe('sync retry flow', () => {
  beforeEach(() => {
    resetSyncDrainRequestsForTests()
    resetRetryableFailedOperations.mockReset()
  })

  it('requests one drain after resetting retryable failures', async () => {
    resetRetryableFailedOperations.mockResolvedValue({
      resetCount: 2,
      terminalCount: 1,
    })

    const seen: string[] = []
    subscribeSyncDrainRequests((reason) => {
      seen.push(reason)
    })

    const result = await resetRetryableFailedOperations()
    if (result.resetCount > 0) {
      requestSyncDrain('manual_retry')
    }

    expect(result).toEqual({ resetCount: 2, terminalCount: 1 })
    expect(seen).toEqual(['manual_retry'])
  })
})
