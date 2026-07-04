import { Check, CloudOff, Loader2, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Entry } from '@/entities/entry/model/entry'
import { cn } from '@/shared/lib/cn'

interface MomentSyncIndicatorProps {
  className?: string
  onRetry?: () => void
  syncStatus: Entry['syncStatus']
}

export function MomentSyncIndicator({
  className,
  onRetry,
  syncStatus,
}: MomentSyncIndicatorProps) {
  const { t } = useTranslation()

  if (syncStatus === 'synced') {
    return (
      <span
        aria-label={t('moment.syncSynced')}
        className={cn('text-muted', className)}
        title={t('moment.syncSynced')}
      >
        <Check aria-hidden="true" size={15} />
      </span>
    )
  }

  if (syncStatus === 'failed') {
    return (
      <button
        aria-label={t('moment.syncFailed')}
        className={cn('text-destructive', className)}
        onClick={onRetry}
        title={t('moment.syncFailed')}
        type="button"
      >
        <RefreshCw aria-hidden="true" size={15} />
      </button>
    )
  }

  if (syncStatus === 'syncing') {
    return (
      <span
        aria-label={t('moment.syncSyncing')}
        className={cn('text-muted', className)}
        title={t('moment.syncSyncing')}
      >
        <Loader2 aria-hidden="true" className="animate-spin" size={15} />
      </span>
    )
  }

  return (
    <span
      aria-label={t('moment.syncPending')}
      className={cn('text-muted', className)}
      title={t('moment.syncPending')}
    >
      <CloudOff aria-hidden="true" size={15} />
    </span>
  )
}
