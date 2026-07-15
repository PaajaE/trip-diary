import type { SyncCoordinatorSnapshot } from '@/foundation/sync/sync-observable'

export type SyncUserStatus =
  | 'failed'
  | 'pending'
  | 'processing'
  | 'synchronized'
  | 'waiting_for_network'
  | 'waiting_for_session'

export interface SyncUserStatusViewModel {
  canRetry: boolean
  failedCount: number
  pendingCount: number
  retryableFailedCount: number
  status: SyncUserStatus
  terminalFailedCount: number
}

export interface ResolveSyncUserStatusInput {
  isNetworkOnline: boolean
  snapshot: SyncCoordinatorSnapshot
}

export function resolveSyncUserStatus(
  input: ResolveSyncUserStatusInput,
): SyncUserStatusViewModel {
  const {
    failedCount,
    pendingCount,
    phase,
    retryableFailedCount,
    terminalFailedCount,
  } = input.snapshot

  const base = {
    failedCount,
    pendingCount,
    retryableFailedCount,
    terminalFailedCount,
  }

  if (failedCount > 0) {
    return {
      ...base,
      canRetry: retryableFailedCount > 0,
      status: 'failed',
    }
  }

  if (phase === 'processing') {
    return {
      ...base,
      canRetry: false,
      status: 'processing',
    }
  }

  if (
    (phase === 'waiting_for_network' || !input.isNetworkOnline) &&
    pendingCount > 0
  ) {
    return {
      ...base,
      canRetry: false,
      status: 'waiting_for_network',
    }
  }

  if (pendingCount > 0) {
    return {
      ...base,
      canRetry: false,
      status: 'pending',
    }
  }

  if (phase === 'waiting_for_session') {
    return {
      ...base,
      canRetry: false,
      status: 'waiting_for_session',
    }
  }

  return {
    ...base,
    canRetry: false,
    status: 'synchronized',
  }
}

export function getSyncStatusLabelKey(status: SyncUserStatus): string {
  switch (status) {
    case 'failed':
      return 'sync.status.failedShort'
    case 'processing':
      return 'sync.status.syncing'
    case 'waiting_for_network':
      return 'sync.status.offline'
    case 'waiting_for_session':
      return 'sync.mobile.waitingForSession'
    case 'pending':
      return 'sync.status.pending'
    case 'synchronized':
      return 'sync.status.synced'
  }
}

export function getSyncNextStepKey(viewModel: SyncUserStatusViewModel): string {
  switch (viewModel.status) {
    case 'failed':
      if (
        viewModel.retryableFailedCount > 0 &&
        viewModel.terminalFailedCount > 0
      ) {
        return 'sync.mobile.nextStepFailedMixed'
      }
      if (viewModel.terminalFailedCount > 0) {
        return 'sync.mobile.nextStepFailedTerminal'
      }
      return 'sync.mobile.nextStepFailedRetryable'
    case 'processing':
      return 'sync.mobile.nextStepProcessing'
    case 'waiting_for_network':
      return 'sync.mobile.nextStepWaitingNetwork'
    case 'waiting_for_session':
      return 'sync.mobile.nextStepWaitingSession'
    case 'pending':
      return 'sync.mobile.nextStepPending'
    case 'synchronized':
      return 'sync.mobile.nextStepSynced'
  }
}

export function getSyncFailureGuidanceKey(
  viewModel: SyncUserStatusViewModel,
  lastError: string | null,
): string | null {
  if (viewModel.status !== 'failed') {
    return null
  }

  const normalized = lastError?.toLowerCase() ?? ''

  if (
    normalized.includes('file') &&
    (normalized.includes('missing') ||
      normalized.includes('not found') ||
      normalized.includes('no longer'))
  ) {
    return 'sync.mobile.guidanceMissingFile'
  }

  if (
    normalized.includes('limit') ||
    normalized.includes('too large') ||
    normalized.includes('oversize') ||
    normalized.includes('8388608')
  ) {
    return 'sync.mobile.guidanceOversized'
  }

  if (
    normalized.includes('permission') ||
    normalized.includes('rls') ||
    normalized.includes('policy') ||
    normalized.includes('different signed-in account')
  ) {
    return 'sync.mobile.guidancePermission'
  }

  if (
    viewModel.terminalFailedCount > 0 &&
    viewModel.retryableFailedCount === 0
  ) {
    return 'sync.mobile.guidanceGenericTerminal'
  }

  if (viewModel.retryableFailedCount > 0) {
    return 'sync.mobile.guidanceGenericRetryable'
  }

  return null
}

export function mapSafeSyncErrorMessage(lastError: string | null): string {
  if (lastError === null || lastError.trim().length === 0) {
    return 'sync.mobile.safeErrorGeneric'
  }

  return 'sync.mobile.safeErrorGeneric'
}
