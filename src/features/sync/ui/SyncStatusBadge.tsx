import { AlertCircle, CloudOff, LoaderCircle, Wifi } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/features/auth/session'
import { cn } from '@/shared/lib/cn'
import { useSyncStatus } from '@/shared/sync/use-sync-status'
import type { GlobalSyncStatus } from '@/shared/sync/sync-status'

export function SyncStatusBadge() {
  const { t } = useTranslation()
  const { user } = useSession()
  const snapshot = useSyncStatus(user?.id)

  if (user === null) {
    return (
      <span className="inline-flex max-w-[11rem] items-center gap-1.5 rounded-full bg-surface px-2.5 py-2 text-xs text-muted shadow-soft sm:max-w-none sm:px-3">
        <CloudOff aria-hidden="true" className="shrink-0" size={14} />
        <span className="truncate">{t('sync.status.ready')}</span>
      </span>
    )
  }

  const status = snapshot ?? 'synced'
  const label =
    status === 'failed'
      ? t('sync.status.failedShort')
      : t(`sync.status.${status}`)

  return (
    <span
      className={cn(
        'inline-flex min-h-9 max-w-[9.5rem] items-center gap-1.5 rounded-full px-2.5 py-2 text-xs font-medium shadow-soft sm:max-w-none sm:px-3',
        status === 'failed'
          ? 'bg-destructive/10 text-destructive'
          : status === 'synced'
            ? 'bg-primary/10 text-primary'
            : 'bg-surface text-muted',
      )}
    >
      <StatusIcon spinning={status === 'syncing'} status={status} />
      <span className="truncate">{label}</span>
    </span>
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
