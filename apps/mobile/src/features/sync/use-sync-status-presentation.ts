import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { requestSyncDrain } from '@/foundation/sync/sync-drain-request'
import { useSyncCoordinatorSnapshot } from '@/foundation/sync/use-sync-coordinator-snapshot'
import { isNetworkOnline, useNetworkState } from '@/foundation/network'
import {
  getSyncNextStepKey,
  getSyncStatusLabelKey,
  resolveSyncUserStatus,
} from '@/features/sync/lib/resolve-sync-user-status'
import { formatLastSyncTime } from '@/features/sync/lib/format-last-sync-time'
import { resetRetryableFailedOperations } from '@/platform/sync/queue'

export function useSyncStatusPresentation() {
  const snapshot = useSyncCoordinatorSnapshot()
  const networkState = useNetworkState()
  const { i18n, t } = useTranslation()
  const [isRetrying, setIsRetrying] = useState(false)

  const viewModel = useMemo(
    () =>
      resolveSyncUserStatus({
        isNetworkOnline: isNetworkOnline(networkState),
        snapshot,
      }),
    [networkState, snapshot],
  )

  const statusLabel = t(getSyncStatusLabelKey(viewModel.status))
  const nextStepLabel = t(getSyncNextStepKey(viewModel))
  const lastSyncLabel = useMemo(() => {
    const formatted = formatLastSyncTime(snapshot.lastDrainAt, i18n.language)
    if (formatted === null) {
      return null
    }
    if (formatted === 'just_now') {
      return t('sync.mobile.lastSyncedJustNow')
    }
    return t('sync.mobile.lastSyncedAt', { time: formatted.time })
  }, [i18n.language, snapshot.lastDrainAt, t])

  const accessibilityLabel = t('sync.mobile.accessibilityLabel', {
    failed: viewModel.failedCount,
    pending: viewModel.pendingCount,
    status: statusLabel,
  })

  const retry = useCallback(async () => {
    if (
      !viewModel.canRetry ||
      snapshot.phase === 'processing' ||
      isRetrying
    ) {
      return { resetCount: 0, terminalCount: viewModel.terminalFailedCount }
    }

    setIsRetrying(true)
    try {
      const result = await resetRetryableFailedOperations()
      requestSyncDrain('manual_retry')
      return result
    } finally {
      setIsRetrying(false)
    }
  }, [
    isRetrying,
    snapshot.phase,
    viewModel.canRetry,
    viewModel.terminalFailedCount,
  ])

  return {
    accessibilityLabel,
    isProcessing: snapshot.phase === 'processing' || isRetrying,
    lastError: snapshot.lastError,
    lastSyncLabel,
    nextStepLabel,
    retry,
    statusLabel,
    viewModel,
  }
}
