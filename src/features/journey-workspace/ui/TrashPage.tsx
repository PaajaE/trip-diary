import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invalidateTrashChange } from '@/entities/media/api/invalidate-trash-change'
import { mediaQueryKeys } from '@/entities/media/api/media-query-keys'
import {
  listTrashedMedia,
  restoreMedia,
} from '@/entities/media/api/media-trash.repository'
import type { TrashedMediaItem } from '@/entities/media/model/media-library'
import { useSession } from '@/features/auth/session'
import { useCanEditJourney } from '@/features/journey-workspace/api/use-can-edit-journey'
import { purgeTrashedMedia } from '@/features/journey-workspace/api/purge-trash'
import { formatInstantDate } from '@/features/journey-workspace/lib/format-range'
import {
  TRASH_RETENTION_DAYS,
  trashDaysLeft,
} from '@/features/journey-workspace/lib/trash-retention'
import { DEFAULT_MEDIA_BASE_URL } from '@/features/journey-workspace/lib/media-thumb'
import { MediaThumb } from '@/features/journey-workspace/ui/MediaThumb'
import {
  dialogButton,
  WorkspaceDialog,
} from '@/features/journey-workspace/ui/WorkspaceDialog'
import { publicEnv } from '@/shared/config/env'
import { EmptyState } from '@/shared/ui/EmptyState'
import { useToast } from '@/shared/ui/use-toast'

const BASE_URL = publicEnv.mediaBaseUrl ?? DEFAULT_MEDIA_BASE_URL

function PurgeDialog({
  count,
  onClose,
  onConfirm,
  skipped,
}: {
  count: number
  onClose: () => void
  onConfirm: () => void
  skipped: number
}) {
  const { t } = useTranslation()
  return (
    <WorkspaceDialog title={t('trash.purgeTitle')} onClose={onClose}>
      <p className="mt-2 text-sm">{t('trash.purgeBody', { count })}</p>
      {skipped > 0 ? (
        <p className="mt-2 text-sm text-muted">
          {t('trash.purgeSkipped', { count: skipped })}
        </p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <button className={dialogButton} type="button" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button
          className={`${dialogButton} bg-destructive text-white`}
          type="button"
          onClick={onConfirm}
        >
          {t('trash.purgeConfirm')}
        </button>
      </div>
    </WorkspaceDialog>
  )
}

export function TrashPage({
  journeyId,
  now,
}: {
  journeyId: string
  /** Clock for the countdown; injectable for tests. */
  now?: number
}) {
  const { i18n, t } = useTranslation()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { user } = useSession()
  const { canEdit } = useCanEditJourney(journeyId)
  const query = useQuery({
    queryFn: () => listTrashedMedia(journeyId),
    queryKey: mediaQueryKeys.trash(journeyId),
  })
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [clock] = useState(() => now ?? Date.now())
  const [confirm, setConfirm] = useState<'purge' | 'empty' | null>(null)
  const [busy, setBusy] = useState(false)

  if (query.isPending) {
    return <p role="status">{t('common.loading')}</p>
  }
  if (query.isError) {
    return <p role="alert">{t('trash.loadError')}</p>
  }
  const items = query.data
  if (items.length === 0) {
    return (
      <EmptyState
        description={t('trash.emptyBody')}
        icon={Trash2}
        title={t('trash.emptyTitle')}
      />
    )
  }

  const userId = user?.id
  const mine = (item: TrashedMediaItem) => item.ownerId === userId
  const chosen = items.filter((item) => selected.has(item.id))
  const claimed = (item: TrashedMediaItem) => item.purgeClaimedAt !== null
  const restorable = chosen.filter((item) => !claimed(item))
  const chosenMine = chosen.filter(mine)
  const skipped = chosen.length - chosenMine.length
  const allMine = items.filter(mine)
  const purgeTargets = confirm === 'empty' ? allMine : chosenMine
  const purgeSkipped =
    confirm === 'empty' ? items.length - allMine.length : skipped

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const refresh = () =>
    invalidateTrashChange(queryClient, journeyId).catch(() => undefined)

  const restore = async () => {
    const ids = restorable.map((item) => item.id)
    if (ids.length === 0 || busy || !canEdit) return
    setBusy(true)
    try {
      // The server skips items whose purge was claimed meanwhile and returns
      // the number really restored.
      const done = await restoreMedia(ids)
      setSelected(new Set())
      showToast({
        message:
          done < ids.length
            ? t('trash.restoredPartial', { done, total: ids.length })
            : t('trash.restored', { count: done }),
      })
    } catch {
      showToast({ message: t('trash.restoreFailed'), variant: 'error' })
    } finally {
      await refresh()
      setBusy(false)
    }
  }

  const purge = async (targets: TrashedMediaItem[]) => {
    setConfirm(null)
    if (targets.length === 0 || busy || !canEdit) return
    setBusy(true)
    try {
      const outcome = await purgeTrashedMedia(targets.map((item) => item.id))
      setSelected((current) => {
        const next = new Set(current)
        for (const id of outcome.purged) next.delete(id)
        return next
      })
      if (outcome.purged.length > 0) {
        showToast({
          message: t('trash.purged', { count: outcome.purged.length }),
        })
      }
      if (outcome.skipped.length > 0) {
        showToast({
          message: t('trash.purgeSkippedNow', {
            count: outcome.skipped.length,
          }),
        })
      }
      if (outcome.failed.length > 0) {
        showToast({
          message: t('trash.purgeFailed', { count: outcome.failed.length }),
          variant: 'error',
        })
      }
    } finally {
      await refresh()
      setBusy(false)
    }
  }

  return (
    <div className="pb-24 sm:pb-0">
      <p className="mb-4 text-sm text-muted">
        {t('trash.subtitle', { days: TRASH_RETENTION_DAYS })}
      </p>
      <div
        className="mb-4 flex flex-wrap items-center gap-2"
        data-testid="trash-toolbar"
      >
        <button
          className={dialogButton}
          type="button"
          onClick={() => {
            setSelected(
              chosen.length === items.length
                ? new Set()
                : new Set(items.map((item) => item.id)),
            )
          }}
        >
          {chosen.length === items.length
            ? t('trash.clearSelection')
            : t('trash.selectAll')}
        </button>
        <button
          className={dialogButton}
          disabled={restorable.length === 0 || busy || !canEdit}
          type="button"
          onClick={() => {
            void restore()
          }}
        >
          {t('trash.restore')}
        </button>
        <button
          className={`${dialogButton} text-destructive`}
          disabled={chosenMine.length === 0 || busy || !canEdit}
          type="button"
          onClick={() => {
            setConfirm('purge')
          }}
        >
          {t('trash.purge')}
        </button>
        <button
          className={`${dialogButton} text-destructive`}
          disabled={allMine.length === 0 || busy || !canEdit}
          type="button"
          onClick={() => {
            setConfirm('empty')
          }}
        >
          {t('trash.emptyTrash')}
        </button>
        <span aria-live="polite" className="text-sm text-muted">
          {chosen.length > 0
            ? t('trash.selected', { count: chosen.length })
            : ''}
        </span>
      </div>
      {!canEdit ? (
        <p className="mb-3 text-xs text-muted" data-testid="read-only-note">
          {t('trash.readOnly')}
        </p>
      ) : null}
      {skipped > 0 || allMine.length < items.length ? (
        <p className="mb-3 text-xs text-muted" data-testid="purge-note">
          {t('trash.purgeNotAllowed')}
        </p>
      ) : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]">
        {items.map((item) => {
          const left = trashDaysLeft(item.deletedAt, clock)
          const isChosen = selected.has(item.id)
          return (
            <li key={item.id}>
              <label
                className={`block cursor-pointer rounded-sm p-1 ${isChosen ? 'bg-primary/10 ring-2 ring-primary' : ''}`}
              >
                <span className="relative block">
                  <MediaThumb
                    baseUrl={BASE_URL}
                    className="aspect-square h-auto w-full"
                    item={item}
                  />
                  <input
                    aria-label={t('trash.select', {
                      name: item.caption ?? t('trash.media'),
                    })}
                    checked={isChosen}
                    className="absolute left-1.5 top-1.5 size-5"
                    type="checkbox"
                    onChange={() => {
                      toggle(item.id)
                    }}
                  />
                </span>
                <span className="mt-1 block text-xs text-muted">
                  {t('trash.trashedOn', {
                    date: formatInstantDate(
                      item.deletedAt,
                      null,
                      i18n.language,
                    ),
                  })}
                </span>
                <span
                  className="block text-xs font-medium"
                  data-testid="trash-days-left"
                  title={claimed(item) ? t('trash.pendingHint') : undefined}
                >
                  {claimed(item)
                    ? t('trash.pending')
                    : left > 0
                      ? t('trash.daysLeft', { count: left })
                      : t('trash.expiring')}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      {confirm !== null ? (
        <PurgeDialog
          count={purgeTargets.length}
          skipped={purgeSkipped}
          onClose={() => {
            setConfirm(null)
          }}
          onConfirm={() => {
            void purge(purgeTargets)
          }}
        />
      ) : null}
    </div>
  )
}
