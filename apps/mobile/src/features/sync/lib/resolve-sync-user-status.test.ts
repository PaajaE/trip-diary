import { describe, expect, it } from 'vitest'
import type { SyncCoordinatorSnapshot } from '@/foundation/sync/sync-observable'
import {
  getSyncFailureGuidanceKey,
  getSyncNextStepKey,
  getSyncStatusLabelKey,
  mapSafeSyncErrorMessage,
  resolveSyncUserStatus,
} from '@/features/sync/lib/resolve-sync-user-status'

function snapshot(
  overrides: Partial<SyncCoordinatorSnapshot> = {},
): SyncCoordinatorSnapshot {
  return {
    failedCount: 0,
    lastDrainAt: null,
    lastError: null,
    lastProcessedCount: 0,
    pendingCount: 0,
    phase: 'idle',
    retryableFailedCount: 0,
    terminalFailedCount: 0,
    ...overrides,
  }
}

describe('resolveSyncUserStatus', () => {
  it('prioritizes failed state over processing and pending', () => {
    const viewModel = resolveSyncUserStatus({
      isNetworkOnline: true,
      snapshot: snapshot({
        failedCount: 2,
        pendingCount: 3,
        phase: 'processing',
        retryableFailedCount: 1,
        terminalFailedCount: 1,
      }),
    })

    expect(viewModel.status).toBe('failed')
    expect(viewModel.canRetry).toBe(true)
  })

  it('shows processing when no failures exist', () => {
    expect(
      resolveSyncUserStatus({
        isNetworkOnline: true,
        snapshot: snapshot({ phase: 'processing', pendingCount: 1 }),
      }).status,
    ).toBe('processing')
  })

  it('shows waiting for network when offline with pending items', () => {
    expect(
      resolveSyncUserStatus({
        isNetworkOnline: false,
        snapshot: snapshot({
          pendingCount: 2,
          phase: 'waiting_for_network',
        }),
      }).status,
    ).toBe('waiting_for_network')
  })

  it('shows pending when online with waiting items', () => {
    expect(
      resolveSyncUserStatus({
        isNetworkOnline: true,
        snapshot: snapshot({ pendingCount: 2, phase: 'idle' }),
      }).status,
    ).toBe('pending')
  })

  it('shows waiting for session when auth is unavailable', () => {
    expect(
      resolveSyncUserStatus({
        isNetworkOnline: true,
        snapshot: snapshot({ phase: 'waiting_for_session' }),
      }).status,
    ).toBe('waiting_for_session')
  })

  it('shows synchronized when nothing is pending or failed', () => {
    expect(
      resolveSyncUserStatus({
        isNetworkOnline: false,
        snapshot: snapshot({ phase: 'waiting_for_network' }),
      }).status,
    ).toBe('synchronized')
  })

  it('disables retry for terminal-only failures', () => {
    const viewModel = resolveSyncUserStatus({
      isNetworkOnline: true,
      snapshot: snapshot({
        failedCount: 1,
        retryableFailedCount: 0,
        terminalFailedCount: 1,
      }),
    })

    expect(viewModel.status).toBe('failed')
    expect(viewModel.canRetry).toBe(false)
  })
})

describe('sync status labels and guidance', () => {
  it('maps user statuses to shared sync label keys', () => {
    expect(getSyncStatusLabelKey('synchronized')).toBe('sync.status.synced')
    expect(getSyncStatusLabelKey('failed')).toBe('sync.status.failedShort')
    expect(getSyncStatusLabelKey('waiting_for_session')).toBe(
      'sync.mobile.waitingForSession',
    )
  })

  it('selects mixed failure next-step copy when both failure types exist', () => {
    expect(
      getSyncNextStepKey({
        canRetry: true,
        failedCount: 2,
        pendingCount: 0,
        retryableFailedCount: 1,
        status: 'failed',
        terminalFailedCount: 1,
      }),
    ).toBe('sync.mobile.nextStepFailedMixed')
  })

  it('maps oversized photo errors to safe guidance', () => {
    expect(
      getSyncFailureGuidanceKey(
        {
          canRetry: false,
          failedCount: 1,
          pendingCount: 0,
          retryableFailedCount: 0,
          status: 'failed',
          terminalFailedCount: 1,
        },
        'Photo exceeds bucket file size limit of 8388608 bytes.',
      ),
    ).toBe('sync.mobile.guidanceOversized')
  })

  it('never exposes raw error text through the safe error mapper', () => {
    expect(mapSafeSyncErrorMessage('JWT expired')).toBe(
      'sync.mobile.safeErrorGeneric',
    )
    expect(mapSafeSyncErrorMessage(null)).toBe('sync.mobile.safeErrorGeneric')
  })
})
