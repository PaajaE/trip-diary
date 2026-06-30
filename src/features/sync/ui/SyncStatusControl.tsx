import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, RefreshCw } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/features/auth/session'
import { cn } from '@/shared/lib/cn'
import {
  isCellularSyncEnabled,
  setCellularSyncEnabled,
} from '@/shared/sync/sync-preferences'
import {
  prepareManualSync,
  syncPendingOperations,
} from '@/shared/sync/sync.service'
import { useSyncProgress } from '@/shared/sync/use-sync-progress'
import { useLastSyncError } from '@/shared/sync/use-last-sync-error'
import { useSyncStatus } from '@/shared/sync/use-sync-status'
import { AnchoredPanel } from '@/shared/ui/AnchoredPanel'
import { SyncStatusBadge } from '@/features/sync/ui/SyncStatusBadge'

export function SyncStatusControl() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useSession()
  const snapshot = useSyncStatus(user?.id)
  const progress = useSyncProgress()
  const lastSyncError = useLastSyncError()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [cellularSync, setCellularSync] = useState(isCellularSyncEnabled)

  if (user === null) {
    return <SyncStatusBadge />
  }

  const status = snapshot ?? 'synced'
  const canSyncNow =
    status === 'failed' || status === 'pending' || status === 'syncing'
  const showProgress = progress.phase !== 'idle'
  const progressRatio =
    progress.total > 0 ? Math.min(progress.current / progress.total, 1) : 0

  async function handleSync() {
    if (!canSyncNow || syncing) {
      return
    }
    setSyncing(true)
    try {
      if (user !== null) {
        await prepareManualSync(user.id)
      }
      await syncPendingOperations()
      await queryClient.invalidateQueries()
    } catch {
      // Status badge and lastSyncError will reflect the failure.
    } finally {
      setSyncing(false)
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-0.5"
        onClick={() => {
          setOpen((value) => !value)
        }}
        type="button"
      >
        <SyncStatusBadge />
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'shrink-0 text-muted transition-transform',
            open ? 'rotate-180' : '',
          )}
          size={14}
        />
      </button>
      <AnchoredPanel
        anchorRef={triggerRef}
        className="rounded-xl border border-border bg-background p-4 shadow-soft"
        onClose={() => {
          setOpen(false)
        }}
        open={open}
      >
        <p className="text-sm font-semibold">{t('sync.panel.title')}</p>
        <p className="mt-1 text-xs text-muted">
          {syncing ? t('sync.status.syncing') : t(`sync.status.${status}`)}
        </p>

        {lastSyncError !== null && !syncing ? (
          <p className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {lastSyncError}
          </p>
        ) : null}

        {showProgress ? (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between gap-3 text-xs text-muted">
              <span>
                {t(`sync.progress.phase.${progress.phase}`, {
                  defaultValue: progress.phase,
                })}
              </span>
              <span>
                {progress.current}/{progress.total}
              </span>
            </div>
            <div
              aria-hidden="true"
              className="h-1.5 overflow-hidden rounded-full bg-surface"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${String(progressRatio * 100)}%` }}
              />
            </div>
            {progress.label ? (
              <p className="truncate text-xs text-foreground">
                {progress.label}
              </p>
            ) : null}
            {progress.detail ? (
              <p className="truncate text-xs text-muted">
                {t(`sync.progress.detail.${progress.detail}`, {
                  defaultValue: progress.detail,
                })}
              </p>
            ) : null}
          </div>
        ) : null}

        <label className="mt-4 flex items-start gap-2 text-xs text-muted">
          <input
            checked={cellularSync}
            className="mt-0.5"
            onChange={(event) => {
              const enabled = event.target.checked
              setCellularSync(enabled)
              setCellularSyncEnabled(enabled)
            }}
            type="checkbox"
          />
          <span>{t('sync.panel.cellularSync')}</span>
        </label>

        {canSyncNow ? (
          <button
            className="mt-4 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            disabled={syncing}
            onClick={() => {
              void handleSync()
            }}
            type="button"
          >
            <RefreshCw
              aria-hidden="true"
              className={cn(syncing ? 'animate-spin' : '')}
              size={14}
            />
            {syncing ? t('sync.status.syncing') : t('sync.syncNow')}
          </button>
        ) : null}
      </AnchoredPanel>
    </>
  )
}
