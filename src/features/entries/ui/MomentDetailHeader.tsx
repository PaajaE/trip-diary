import { Link } from '@tanstack/react-router'
import { ArrowLeft, MoreHorizontal } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Entry } from '@/entities/entry/model/entry'
import { formatMomentDateLabel } from '@/features/journeys/lib/format-moment-datetime'
import type { MomentTextSaveState } from '@/features/entries/lib/use-moment-text-draft'
import { ShareIconButton } from '@/features/sharing/ui/ShareIconButton'
import { MomentSyncIndicator } from '@/features/sync/ui/MomentSyncIndicator'
import { syncPendingOperations } from '@/shared/sync/sync.service'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/lib/cn'

interface MomentDetailHeaderProps {
  editing: boolean
  entry: Entry
  locationLabel?: string | null
  menuOpen: boolean
  onDelete: () => void
  onEditToggle: () => void
  onMenuOpenChange: (open: boolean) => void
  onSyncRetry?: () => void
  returnTo?: string
  saveState?: MomentTextSaveState
  shareText?: string | null
  shareUrl?: string | null
  deleting?: boolean
}

export function MomentDetailHeader({
  deleting = false,
  editing,
  entry,
  locationLabel = null,
  menuOpen,
  onDelete,
  onEditToggle,
  onMenuOpenChange,
  onSyncRetry,
  returnTo,
  saveState = 'idle',
  shareText = null,
  shareUrl = null,
}: MomentDetailHeaderProps) {
  const { i18n, t } = useTranslation()
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const dateLabel = formatMomentDateLabel(entry.eventAt, i18n.language)
  const metadataParts = [
    t(`entry.type.${entry.type}`),
    dateLabel,
    locationLabel,
  ].filter((part): part is string => part !== null && part.trim() !== '')

  const saveLabel =
    saveState === 'saving'
      ? t('entry.saving')
      : saveState === 'saved'
        ? t('entry.autosaved')
        : saveState === 'error'
          ? t('entry.saveFailedShort')
          : entry.syncStatus !== 'synced'
            ? t(`entry.sync.${entry.syncStatus}`)
            : t('entry.sync.synced')

  return (
    <header className="space-y-4">
      {returnTo !== undefined ? (
        <Link
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline"
          to={returnTo}
        >
          <ArrowLeft aria-hidden="true" size={16} />
          {t('entry.back')}
        </Link>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-[0.6875rem] font-semibold tracking-[0.18em] text-accent uppercase">
          {metadataParts.join(' · ')}
        </p>
        <p
          className={cn(
            'inline-flex min-h-8 items-center gap-1.5 text-xs text-muted',
            editing ? 'order-last w-full sm:order-none sm:w-auto' : '',
          )}
        >
          <MomentSyncIndicator
            {...(onSyncRetry !== undefined ? { onRetry: onSyncRetry } : {})}
            syncStatus={entry.syncStatus}
          />
          {editing ? (
            <span aria-live="polite">{saveLabel}</span>
          ) : entry.syncStatus === 'synced' ? (
            <span>{t('entry.sync.synced')}</span>
          ) : null}
        </p>
      </div>

      <div className="flex flex-wrap items-start justify-end gap-1.5 sm:gap-2">
        <Button
          className="min-h-10 px-4"
          onClick={onEditToggle}
          variant={editing ? 'primary' : 'secondary'}
        >
          {editing ? t('entry.doneAction') : t('entry.editAction')}
        </Button>
        {!editing && shareUrl !== null && shareText !== null ? (
          <ShareIconButton
            className="size-10 rounded-lg sm:hidden"
            shareText={shareText}
            shareUrl={shareUrl}
            title={entry.title}
          />
        ) : null}
        {!editing && shareUrl !== null && shareText !== null ? (
          <ShareIconButton
            className="hidden min-h-10 rounded-lg px-3 sm:inline-flex"
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
            className="inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-background"
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
                className="absolute right-0 top-[calc(100%+0.25rem)] z-20 min-w-[11rem] overflow-hidden rounded-xl border border-border/80 bg-surface shadow-soft"
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
    </header>
  )
}
