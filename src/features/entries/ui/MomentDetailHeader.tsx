import { Link } from '@tanstack/react-router'
import { ArrowLeft, MoreHorizontal } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Entry } from '@/entities/entry/model/entry'
import type { MomentTextSaveState } from '@/features/entries/lib/use-moment-text-draft'
import { ShareIconButton } from '@/features/sharing/ui/ShareIconButton'
import { MomentSyncIndicator } from '@/features/sync/ui/MomentSyncIndicator'
import { syncPendingOperations } from '@/shared/sync/sync.service'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/lib/cn'

interface MomentDetailHeaderProps {
  actionsSlot?: ReactNode
  backHref?: string
  editing: boolean
  entry: Entry
  onSyncRetry?: () => void
  saveState?: MomentTextSaveState
}

export function MomentDetailHeader({
  actionsSlot,
  backHref,
  editing,
  entry,
  onSyncRetry,
  saveState = 'idle',
}: MomentDetailHeaderProps) {
  const { t } = useTranslation()

  const saveLabel =
    saveState === 'saving'
      ? t('entry.saving')
      : saveState === 'saved'
        ? t('entry.autosaved')
        : saveState === 'error'
          ? t('entry.saveFailedShort')
          : null

  const syncLabel =
    editing && saveLabel !== null
      ? saveLabel
      : entry.syncStatus === 'synced'
        ? t('entry.sync.synced')
        : t(`entry.sync.${entry.syncStatus}`)

  return (
    <header className="mb-8 flex items-center justify-between gap-3">
      {backHref !== undefined ? (
        <Link
          className="inline-flex min-h-11 min-w-0 items-center gap-2 text-sm font-semibold text-primary hover:underline"
          to={backHref}
        >
          <ArrowLeft aria-hidden="true" className="shrink-0" size={16} />
          <span className="truncate">{t('reader.backToTrip')}</span>
        </Link>
      ) : (
        <span />
      )}

      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <p
          aria-live={editing ? 'polite' : undefined}
          className="inline-flex min-h-8 shrink-0 items-center gap-1.5 text-xs text-muted"
        >
          <MomentSyncIndicator
            {...(onSyncRetry !== undefined ? { onRetry: onSyncRetry } : {})}
            syncStatus={entry.syncStatus}
          />
          <span className="hidden sm:inline">{syncLabel}</span>
          <span className="sm:hidden">
            {editing && saveLabel !== null ? saveLabel : null}
          </span>
        </p>
        {actionsSlot}
      </div>
    </header>
  )
}

interface MomentDetailActionsProps {
  deleting?: boolean
  editing: boolean
  entry: Entry
  menuOpen: boolean
  onDelete: () => void
  onEditToggle: () => void
  onMenuOpenChange: (open: boolean) => void
  onSyncRetry?: () => void
  shareText?: string | null
  shareUrl?: string | null
}

export function MomentDetailActions({
  deleting = false,
  editing,
  entry,
  menuOpen,
  onDelete,
  onEditToggle,
  onMenuOpenChange,
  onSyncRetry,
  shareText = null,
  shareUrl = null,
}: MomentDetailActionsProps) {
  const { t } = useTranslation()
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <Button
        className={cn(
          'min-h-10 px-4',
          editing ? 'inline-flex' : 'hidden sm:inline-flex',
        )}
        onClick={onEditToggle}
        variant="primary"
      >
        {editing ? t('entry.doneAction') : t('entry.editAction')}
      </Button>
      {!editing && shareUrl !== null && shareText !== null ? (
        <ShareIconButton
          className="size-10 rounded-lg"
          shareText={shareText}
          shareUrl={shareUrl}
          title={entry.title}
        />
      ) : null}
      <div className="relative">
        <button
          ref={menuButtonRef}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label={t('journey.more')}
          className="inline-flex size-10 items-center justify-center rounded-lg text-muted transition hover:bg-surface/80 hover:text-foreground"
          onClick={() => {
            onMenuOpenChange(!menuOpen)
          }}
          type="button"
        >
          <MoreHorizontal aria-hidden="true" size={18} />
        </button>
        {menuOpen ? (
          <>
            <button
              aria-label={t('journey.manageClose')}
              className="fixed inset-0 z-10 cursor-default bg-transparent"
              onClick={() => {
                onMenuOpenChange(false)
              }}
              type="button"
            />
            <div
              className="absolute right-0 top-[calc(100%+0.25rem)] z-20 min-w-[11rem] overflow-hidden rounded-xl border border-border/60 bg-surface shadow-soft"
              role="menu"
            >
              {entry.syncStatus !== 'synced' ? (
                <button
                  className="flex min-h-11 w-full items-center px-4 text-left text-sm font-semibold hover:bg-background"
                  onClick={() => {
                    onMenuOpenChange(false)
                    void syncPendingOperations().then(() => {
                      onSyncRetry?.()
                    })
                  }}
                  role="menuitem"
                  type="button"
                >
                  {t('entry.syncNow')}
                </button>
              ) : null}
              <button
                className="flex min-h-11 w-full items-center px-4 text-left text-sm font-semibold text-destructive hover:bg-background disabled:opacity-50"
                disabled={deleting}
                onClick={onDelete}
                role="menuitem"
                type="button"
              >
                {deleting ? t('entry.deleting') : t('entry.deleteAction')}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
