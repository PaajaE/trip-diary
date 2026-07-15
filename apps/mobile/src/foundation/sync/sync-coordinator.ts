import { isNetworkOnline, type NetworkState } from '@/foundation/network/network-status'
import {
  updateSyncCoordinatorSnapshot,
  type SyncCoordinatorPhase,
} from '@/foundation/sync/sync-observable'
import type { SyncDrainReason } from '@/foundation/sync/sync-drain-request'

export const MAX_SYNC_DRAIN_OPERATIONS = 10

export interface SyncQueueCounts {
  failed: number
  pending: number
  retryableFailed: number
  terminalFailed: number
}

export interface SyncDrainResult {
  lastError: string | null
  processedCount: number
}

export interface SyncCoordinatorContext {
  appIsActive: boolean
  authLoading: boolean
  networkState: NetworkState
  sessionUserId: string | null
}

export interface SyncCoordinatorDeps {
  drainQueue: (maxOperations: number) => Promise<SyncDrainResult>
  getQueueCounts: () => Promise<SyncQueueCounts>
}

function resolveIdlePhase(context: SyncCoordinatorContext): SyncCoordinatorPhase {
  if (context.authLoading || context.sessionUserId === null) {
    return 'waiting_for_session'
  }

  if (!isNetworkOnline(context.networkState)) {
    return 'waiting_for_network'
  }

  return 'idle'
}

export function canProcessSyncQueue(context: SyncCoordinatorContext): boolean {
  return (
    context.appIsActive &&
    !context.authLoading &&
    context.sessionUserId !== null &&
    isNetworkOnline(context.networkState)
  )
}

export function createSyncCoordinator(deps: SyncCoordinatorDeps) {
  let drainInFlight = false
  let followUpDrainRequested = false
  let lastNetworkWasOnline = false

  async function refreshCounts(): Promise<SyncQueueCounts> {
    const counts = await deps.getQueueCounts()
    updateSyncCoordinatorSnapshot({
      failedCount: counts.failed,
      pendingCount: counts.pending,
      retryableFailedCount: counts.retryableFailed,
      terminalFailedCount: counts.terminalFailed,
    })
    return counts
  }

  async function runDrain(
    context: SyncCoordinatorContext,
    reason: SyncDrainReason,
  ): Promise<void> {
    void reason

    if (drainInFlight) {
      followUpDrainRequested = true
      return
    }

    drainInFlight = true
    updateSyncCoordinatorSnapshot({ phase: 'processing' })

    try {
      do {
        followUpDrainRequested = false
        const result = await deps.drainQueue(MAX_SYNC_DRAIN_OPERATIONS)
        await refreshCounts()
        updateSyncCoordinatorSnapshot({
          lastDrainAt: new Date().toISOString(),
          lastError: result.lastError,
          lastProcessedCount: result.processedCount,
        })
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- set concurrently when another drain is requested mid-flight
      } while (followUpDrainRequested)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Sync drain failed unexpectedly.'
      await refreshCounts()
      updateSyncCoordinatorSnapshot({
        lastError: message,
      })
    } finally {
      drainInFlight = false
      updateSyncCoordinatorSnapshot({
        phase: resolveIdlePhase(context),
      })
    }
  }

  return {
    async maybeRunDrain(
      context: SyncCoordinatorContext,
      reason: SyncDrainReason,
    ): Promise<void> {
      updateSyncCoordinatorSnapshot({
        phase: resolveIdlePhase(context),
      })
      await refreshCounts()

      if (!canProcessSyncQueue(context)) {
        return
      }

      await runDrain(context, reason)
    },

    async handleNetworkChange(
      context: SyncCoordinatorContext,
      reason: SyncDrainReason,
    ): Promise<void> {
      const isOnline = isNetworkOnline(context.networkState)
      const becameOnline = isOnline && !lastNetworkWasOnline
      lastNetworkWasOnline = isOnline

      updateSyncCoordinatorSnapshot({
        phase: resolveIdlePhase(context),
      })
      await refreshCounts()

      if (!becameOnline || !canProcessSyncQueue(context)) {
        return
      }

      await runDrain(context, reason)
    },

    isDrainInFlight(): boolean {
      return drainInFlight
    },
  }
}

export type SyncCoordinator = ReturnType<typeof createSyncCoordinator>
