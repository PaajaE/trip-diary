import { useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  CloudOff,
  LoaderCircle,
  RefreshCw,
  Wifi,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/features/auth/session'
import { cn } from '@/shared/lib/cn'
import { useSyncStatus } from '@/shared/sync/use-sync-status'
import { syncPendingOperations } from '@/shared/sync/sync.service'
import type { GlobalSyncStatus } from '@/shared/sync/sync-status'

export function SyncStatusBadge() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useSession()
  const snapshot = useSyncStatus(user?.id)
  const [syncing, setSyncing] = useState(false)

  if (user === null) {
    return (
      <span className="inline-flex max-w-[11rem] items-center gap-1.5 rounded-full bg-surface px-2.5 py-2 text-xs text-muted shadow-soft sm:max-w-none sm:px-3">
        <CloudOff aria-hidden="true" className="shrink-0" size={14} />
        <span className="truncate">{t('sync.status.ready')}</span>
      </span>
    )
  }

  const status = snapshot ?? 'synced'
  const label = t(`sync.status.${status}`)
  const canSyncNow = status === 'failed' || status === 'pending'

  async function handleSync() {
    if (!canSyncNow || syncing) {
      return
    }
    setSyncing(true)
    try {
      await syncPendingOperations()
      await queryClient.invalidateQueries()
    } catch {
      // Status badge will reflect failed operations on the next refresh.
    } finally {
      setSyncing(false)
    }
  }

  return (
    <button
      aria-label={canSyncNow ? `${label}. ${t('sync.syncNow')}` : label}
      className={cn(
        'inline-flex max-w-[11rem] min-h-9 items-center gap-1.5 rounded-full px-2.5 py-2 text-xs font-medium shadow-soft sm:max-w-none sm:px-3',
        status === 'failed'
          ? 'bg-destructive/10 text-destructive'
          : status === 'synced'
            ? 'bg-primary/10 text-primary'
            : 'bg-surface text-muted',
        canSyncNow ? 'cursor-pointer hover:bg-white' : 'cursor-default',
      )}
      disabled={!canSyncNow || syncing}
      onClick={() => {
        void handleSync()
      }}
      type="button"
    >
      <StatusIcon spinning={syncing || status === 'syncing'} status={status} />
      <span className="truncate">
        {syncing ? t('sync.status.syncing') : label}
      </span>
      {canSyncNow && !syncing ? (
        <RefreshCw aria-hidden="true" className="shrink-0" size={12} />
      ) : null}
    </button>
  )
}

function StatusIcon({
  spinning,
  status,
}: {
  spinning: boolean
  status: GlobalSyncStatus
}) {
  const className = cn('shrink-0', spinning ? 'animate-spin' : '')

  if (status === 'failed') {
    return <AlertCircle aria-hidden="true" className={className} size={14} />
  }
  if (status === 'syncing' || spinning) {
    return <LoaderCircle aria-hidden="true" className={className} size={14} />
  }
  if (status === 'offline' || status === 'pending') {
    return <CloudOff aria-hidden="true" className={className} size={14} />
  }
  return <Wifi aria-hidden="true" className={className} size={14} />
}
