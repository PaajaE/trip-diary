import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canProcessSyncQueue,
  createSyncCoordinator,
  MAX_SYNC_DRAIN_OPERATIONS,
  type SyncCoordinatorContext,
} from '@/foundation/sync/sync-coordinator'
import {
  getSyncCoordinatorSnapshot,
  resetSyncCoordinatorSnapshotForTests,
} from '@/foundation/sync/sync-observable'
import {
  requestSyncDrain,
  subscribeSyncDrainRequests,
} from '@/foundation/sync/sync-drain-request'

const onlineContext: SyncCoordinatorContext = {
  appIsActive: true,
  authLoading: false,
  networkState: {
    isConnected: true,
    isInternetReachable: true,
    status: 'online',
  },
  sessionUserId: 'user-1',
}

const offlineContext: SyncCoordinatorContext = {
  ...onlineContext,
  networkState: {
    isConnected: false,
    isInternetReachable: false,
    status: 'offline',
  },
}

function queueCounts(overrides: {
  failed?: number
  pending?: number
  retryableFailed?: number
  terminalFailed?: number
}) {
  const failed = overrides.failed ?? 0
  const pending = overrides.pending ?? 0
  return {
    failed,
    pending,
    retryableFailed: overrides.retryableFailed ?? failed,
    terminalFailed: overrides.terminalFailed ?? 0,
  }
}

describe('sync coordinator', () => {
  beforeEach(() => {
    resetSyncCoordinatorSnapshotForTests()
  })

  it('drains once when prerequisites are ready on startup', async () => {
    const drainQueue = vi.fn(async () => ({
      lastError: null,
      processedCount: 1,
    }))
    const coordinator = createSyncCoordinator({
      drainQueue,
      getQueueCounts: async () => queueCounts({ pending: 1 }),
    })

    await coordinator.maybeRunDrain(onlineContext, 'startup')

    expect(drainQueue).toHaveBeenCalledTimes(1)
    expect(drainQueue).toHaveBeenCalledWith(MAX_SYNC_DRAIN_OPERATIONS)
    expect(getSyncCoordinatorSnapshot().lastProcessedCount).toBe(1)
  })

  it('does not drain while offline', async () => {
    const drainQueue = vi.fn(async () => ({
      lastError: null,
      processedCount: 0,
    }))
    const coordinator = createSyncCoordinator({
      drainQueue,
      getQueueCounts: async () => queueCounts({ pending: 2 }),
    })

    await coordinator.maybeRunDrain(offlineContext, 'startup')

    expect(drainQueue).not.toHaveBeenCalled()
    expect(getSyncCoordinatorSnapshot().phase).toBe('waiting_for_network')
  })

  it('does not drain while signed out', async () => {
    const drainQueue = vi.fn()
    const coordinator = createSyncCoordinator({
      drainQueue,
      getQueueCounts: async () => queueCounts({ pending: 1 }),
    })

    await coordinator.maybeRunDrain(
      { ...onlineContext, sessionUserId: null },
      'startup',
    )

    expect(drainQueue).not.toHaveBeenCalled()
    expect(getSyncCoordinatorSnapshot().phase).toBe('waiting_for_session')
  })

  it('drains once on reconnect and ignores repeated online events', async () => {
    const drainQueue = vi.fn(async () => ({
      lastError: null,
      processedCount: 1,
    }))
    const coordinator = createSyncCoordinator({
      drainQueue,
      getQueueCounts: async () => queueCounts({ pending: 1 }),
    })

    await coordinator.handleNetworkChange(offlineContext, 'network_online')
    await coordinator.handleNetworkChange(onlineContext, 'network_online')
    await coordinator.handleNetworkChange(onlineContext, 'network_online')

    expect(drainQueue).toHaveBeenCalledTimes(1)
  })

  it('serializes concurrent drain requests', async () => {
    let inFlight = 0
    let maxConcurrent = 0
    const drainQueue = vi.fn(async () => {
      inFlight += 1
      maxConcurrent = Math.max(maxConcurrent, inFlight)
      await Promise.resolve()
      inFlight -= 1
      return { lastError: null, processedCount: 1 }
    })
    const coordinator = createSyncCoordinator({
      drainQueue,
      getQueueCounts: async () => queueCounts({ pending: 2 }),
    })

    await Promise.all([
      coordinator.maybeRunDrain(onlineContext, 'startup'),
      coordinator.maybeRunDrain(onlineContext, 'enqueue'),
    ])

    expect(maxConcurrent).toBe(1)
    expect(drainQueue).toHaveBeenCalledTimes(2)
  })

  it('records queue counts and last error in the observable snapshot', async () => {
    const coordinator = createSyncCoordinator({
      drainQueue: async () => ({
        lastError: 'Network down',
        processedCount: 1,
      }),
      getQueueCounts: async () =>
        queueCounts({ failed: 1, pending: 0, retryableFailed: 1 }),
    })

    await coordinator.maybeRunDrain(onlineContext, 'startup')

    expect(getSyncCoordinatorSnapshot()).toMatchObject({
      failedCount: 1,
      lastError: 'Network down',
      pendingCount: 0,
      phase: 'idle',
      retryableFailedCount: 1,
      terminalFailedCount: 0,
    })
  })

  it('requires an active app foreground state', () => {
    expect(
      canProcessSyncQueue({
        ...onlineContext,
        appIsActive: false,
      }),
    ).toBe(false)
  })
})

describe('sync drain requests', () => {
  beforeEach(() => {
    resetSyncCoordinatorSnapshotForTests()
  })

  it('notifies subscribers when enqueue requests a drain', () => {
    const seen: string[] = []
    const unsubscribe = subscribeSyncDrainRequests((reason) => {
      seen.push(reason)
    })

    requestSyncDrain('enqueue')
    unsubscribe()
    requestSyncDrain('enqueue')

    expect(seen).toEqual(['enqueue'])
  })
})
