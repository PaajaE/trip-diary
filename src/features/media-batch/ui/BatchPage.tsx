import { Link } from '@tanstack/react-router'
import { Inbox } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUnreviewedMediaQuery } from '@/entities/media/api/use-unreviewed-media-query'
import type { MediaItem } from '@/entities/media/model/media-library'
import { useCanEditJourney } from '@/features/journey-workspace/api/use-can-edit-journey'
import { useJourneyWorkspace } from '@/features/journey-workspace/api/use-journey-workspace'
import { BASE_URL } from '@/features/journey-workspace/lib/moment-labels'
import { MediaViewer } from '@/features/journey-workspace/ui/MediaViewer'
import { useDaySelection } from '@/features/journey-workspace/ui/day/use-day-selection'
import { OrganizeJourneyButton } from '@/features/journey-organize/ui/OrganizeJourneyButton'
import { useBatchActions } from '@/features/media-batch/api/use-batch-actions'
import {
  batchOrder,
  groupBatchByDay,
  type BatchDay,
} from '@/features/media-batch/model/batch-days'
import { batchMoveTargets } from '@/features/media-batch/model/move-targets'
import { BatchActionBar } from '@/features/media-batch/ui/BatchActionBar'
import { BatchDaySection } from '@/features/media-batch/ui/BatchDaySection'
import { cn } from '@/shared/lib/cn'
import { buttonVariants } from '@/shared/ui/button-variants'
import { EmptyState } from '@/shared/ui/EmptyState'

const NO_TARGETS = new Map<string, never[]>()

interface ViewerState {
  opener: HTMLElement | null
  startId: string
}

/** "Dávka k roztřídění": unsorted media of the journey, grouped by day. */
export function BatchPage({ journeyId }: { journeyId: string }) {
  const { i18n, t } = useTranslation()
  const query = useUnreviewedMediaQuery(journeyId)
  const workspace = useJourneyWorkspace(journeyId)
  const { canEdit } = useCanEditJourney(journeyId)
  const actions = useBatchActions(journeyId)
  const selection = useDaySelection()
  const [viewer, setViewer] = useState<ViewerState | null>(null)
  const locale = i18n.language

  const items = query.data
  const days = useMemo(() => groupBatchByDay(items ?? []), [items])
  const order = useMemo(() => batchOrder(days), [days])
  const selected = useMemo(
    () => (items ?? []).filter((item) => selection.ids.has(item.id)),
    [items, selection.ids],
  )
  const targets = useMemo(
    () =>
      workspace.status === 'ready'
        ? batchMoveTargets(workspace.tree, t, locale)
        : [],
    [workspace, t, locale],
  )

  // Sorted tiles vanish from the list; forget them in the selection too.
  const { ids: selectedIds, setMany } = selection
  useEffect(() => {
    if (items === undefined || selected.length === selectedIds.size) return
    const present = new Set(items.map((item) => item.id))
    setMany(
      [...selectedIds].filter((id) => !present.has(id)),
      false,
    )
  }, [items, selected.length, selectedIds, setMany])

  useEffect(() => {
    if (!selection.mode || viewer !== null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (document.querySelector('[role="dialog"]') !== null) return
      selection.clear()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [selection, viewer])

  function activate(item: MediaItem, trigger: HTMLElement, range: boolean) {
    if (canEdit && selection.mode) {
      selection.toggle(item.id, order, range)
    } else {
      setViewer({ opener: trigger, startId: item.id })
    }
  }

  function toggleDay(day: BatchDay, on: boolean) {
    selection.setMany(
      day.items.map((item) => item.id),
      on,
    )
    if (on) selection.setMode(true)
  }

  function afterAction(done: Promise<boolean>) {
    void done.then((ok) => {
      if (ok) selection.clear()
    })
  }

  if (query.isError) {
    return (
      <div className="space-y-3" role="alert">
        <p>{t('mediaBatch.loadError')}</p>
        <button
          className={buttonVariants({ variant: 'secondary' })}
          type="button"
          onClick={() => {
            void query.refetch()
          }}
        >
          {t('common.tryAgain')}
        </button>
      </div>
    )
  }
  if (items === undefined) {
    return <p role="status">{t('common.loading')}</p>
  }

  const remaining = items.length
  return (
    <div
      className={cn('space-y-6', selection.mode && 'pb-32 min-[760px]:pb-0')}
    >
      <div className="flex flex-wrap items-center gap-3">
        <p
          aria-live="polite"
          className="mr-auto text-lg font-semibold"
          data-testid="batch-remaining"
          role="status"
        >
          {t('mediaBatch.remaining', { count: remaining })}
        </p>
        {remaining > 0 && canEdit ? (
          <button
            aria-pressed={selection.mode}
            className={cn(
              buttonVariants({ variant: 'secondary' }),
              selection.mode && 'border-primary text-primary',
            )}
            type="button"
            onClick={() => {
              if (selection.mode) selection.clear()
              else selection.setMode(true)
            }}
          >
            {t('mediaBatch.select')}
          </button>
        ) : null}
        {canEdit ? <OrganizeJourneyButton journeyId={journeyId} /> : null}
      </div>

      {remaining === 0 ? (
        <EmptyState
          action={
            <Link
              className={buttonVariants({ variant: 'primary' })}
              params={{ journeyId }}
              to="/j/$journeyId/import"
            >
              {t('mediaImport.link')}
            </Link>
          }
          description={t('mediaBatch.emptyDescription')}
          icon={Inbox}
          title={t('mediaBatch.emptyTitle')}
        />
      ) : (
        <div className="space-y-6">
          {days.map((day) => (
            <BatchDaySection
              allSelected={day.items.every((item) =>
                selection.ids.has(item.id),
              )}
              baseUrl={BASE_URL}
              canEdit={canEdit}
              day={day}
              isSelected={selection.has}
              key={day.key}
              locale={locale}
              selecting={canEdit && selection.mode}
              onActivate={activate}
              onToggleDay={toggleDay}
            />
          ))}
        </div>
      )}

      {canEdit && selection.mode ? (
        <BatchActionBar
          allStarred={selected.length > 0 && selected.every((i) => i.starred)}
          count={selected.length}
          targets={targets}
          onClear={selection.clear}
          onDone={() => {
            afterAction(actions.done(selected))
          }}
          onMoveTo={(targetId) => {
            afterAction(actions.moveTo(selected, targetId))
          }}
          onNewStop={() => {
            afterAction(actions.newStop(selected))
          }}
          onStar={() => {
            void actions.star(selected)
          }}
          onTrash={() => {
            afterAction(actions.trash(selected))
          }}
        />
      ) : null}

      {viewer === null ? null : (
        <MediaViewer
          baseUrl={BASE_URL}
          edits={actions.edits}
          groups={[{ id: 'batch', items: items, title: t('mediaBatch.title') }]}
          locale={locale}
          returnFocusTo={viewer.opener}
          startId={viewer.startId}
          targets={NO_TARGETS}
          onClose={() => {
            setViewer(null)
          }}
          onDelete={(item) => {
            void actions.trash([item])
          }}
        />
      )}
    </div>
  )
}
